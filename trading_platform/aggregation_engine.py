"""
Aggregation Engine
==================
Consumes a stream of Trade objects and produces time-bucketed candles enriched
with order-flow metrics:

  • Bid volume / Ask volume per price level
  • Delta  = Ask − Bid  (positive ⟹ more aggressive buying)
  • Cumulative Volume Delta (CVD) — running across all candles in the session
  • Absorption detection  — high volume, tiny delta ⟹ passive liquidity absorbing aggression

The engine is purely computational (no Qt, no I/O).  It is driven by calling
`on_trade(trade)` from the data engine callback.  When a candle closes the
`on_candle_closed` callback is invoked with the completed RawCandle.

Thread note: `on_trade` is called from the asyncio thread; the callbacks fire
on that same thread.  Qt signal emission is done one level up in ui_main.py.
"""

from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from .config import get_config
from .data_engine import Trade


# ── Domain objects ─────────────────────────────────────────────────────────────

@dataclass
class PriceLevelData:
    """Volume accumulated at a single price level within one candle."""
    bid_vol: float = 0.0    # sells that hit the bid (aggressive sellers)
    ask_vol: float = 0.0    # buys  that lifted the ask (aggressive buyers)

    @property
    def delta(self) -> float:
        return self.ask_vol - self.bid_vol

    @property
    def total(self) -> float:
        return self.bid_vol + self.ask_vol

    @property
    def is_empty(self) -> bool:
        return self.bid_vol == 0 and self.ask_vol == 0


@dataclass
class AbsorptionZone:
    price:      float
    total_vol:  float
    delta:      float
    kind:       str      # "buy_absorption" | "sell_absorption"


@dataclass
class RawCandle:
    """
    Completed candle with full order-flow data.
    This is what gets handed to FootprintEngine and VolumeProfile.
    """
    timestamp:   float                            # open timestamp
    open:        float
    high:        float
    low:         float
    close:       float
    levels:      Dict[float, PriceLevelData]      # price → data
    total_bid:   float
    total_ask:   float
    cvd_open:    float                            # CVD value at candle open
    cvd_close:   float                            # CVD value at candle close
    absorptions: List[AbsorptionZone] = field(default_factory=list)
    trade_count: int = 0

    @property
    def total_volume(self) -> float:
        return self.total_bid + self.total_ask

    @property
    def delta(self) -> float:
        return self.total_ask - self.total_bid

    @property
    def sorted_prices(self) -> List[float]:
        return sorted(self.levels.keys())


# ── Absorption detector ────────────────────────────────────────────────────────

class AbsorptionDetector:
    """
    Identifies price levels where high passive volume absorbed aggressive flow.

    Signature:
      - Total volume at level ≥ absorption_min_volume
      - |delta| / total ≤ absorption_max_delta_ratio  (balanced two-sided flow)
      - Price moved less than 2 ticks from that level during the candle
        (the engine checks this at close time)
    """

    def detect(
        self,
        levels: Dict[float, PriceLevelData],
        high: float,
        low: float,
    ) -> List[AbsorptionZone]:
        cfg    = get_config()
        zones: List[AbsorptionZone] = []
        price_range = high - low if high > low else float("inf")

        for price, lvl in levels.items():
            if lvl.total < cfg.absorption_min_volume:
                continue
            ratio = abs(lvl.delta) / lvl.total
            if ratio > cfg.absorption_max_delta_ratio:
                continue
            # Must be near the extreme of the candle (within 2 ticks)
            tick = cfg.tick_size
            near_high = abs(price - high) <= 2 * tick
            near_low  = abs(price - low)  <= 2 * tick
            if not (near_high or near_low):
                continue

            kind = "buy_absorption" if near_low else "sell_absorption"
            zones.append(AbsorptionZone(
                price     = price,
                total_vol = lvl.total,
                delta     = lvl.delta,
                kind      = kind,
            ))

        return zones


# ── In-progress candle accumulator ────────────────────────────────────────────

class _LiveCandle:
    """Mutable state for the currently-building candle."""

    def __init__(self, timestamp: float, tick: float, cvd_start: float) -> None:
        self.timestamp  = timestamp
        self.tick       = tick
        self.open:  Optional[float] = None
        self.high:  float = -math.inf
        self.low:   float =  math.inf
        self.close: float = 0.0
        self.levels: Dict[float, PriceLevelData] = defaultdict(PriceLevelData)
        self.total_bid  = 0.0
        self.total_ask  = 0.0
        self.cvd_open   = cvd_start
        self.trade_count = 0

    def _snap(self, price: float) -> float:
        """Round price to nearest tick."""
        return round(round(price / self.tick) * self.tick, 10)

    def add_trade(self, trade: Trade) -> None:
        p = self._snap(trade.price)
        if self.open is None:
            self.open = p
        self.close = p
        self.high  = max(self.high, p)
        self.low   = min(self.low,  p)
        self.trade_count += 1

        lvl = self.levels[p]
        if trade.side == "buy":
            lvl.ask_vol    += trade.size
            self.total_ask += trade.size
        else:
            lvl.bid_vol    += trade.size
            self.total_bid += trade.size

    def close_candle(self, cvd_end: float, absorptions: List[AbsorptionZone]) -> RawCandle:
        return RawCandle(
            timestamp   = self.timestamp,
            open        = self.open  or self.close,
            high        = self.high  if self.high  != -math.inf else self.close,
            low         = self.low   if self.low   !=  math.inf else self.close,
            close       = self.close,
            levels      = dict(self.levels),
            total_bid   = self.total_bid,
            total_ask   = self.total_ask,
            cvd_open    = self.cvd_open,
            cvd_close   = cvd_end,
            absorptions = absorptions,
            trade_count = self.trade_count,
        )


# ── Main engine ───────────────────────────────────────────────────────────────

CandleCallback = Callable[[RawCandle], None]
LiveCallback   = Callable[[_LiveCandle], None]


class AggregationEngine:
    """
    Stateful engine that accumulates trades into time-bucketed candles.

    Callbacks:
      on_candle_closed(RawCandle) — fired when a candle finalises
      on_live_update(_LiveCandle) — fired after every trade (for real-time UI)
    """

    def __init__(
        self,
        on_candle_closed: CandleCallback,
        on_live_update:   LiveCallback,
    ) -> None:
        self._on_closed = on_candle_closed
        self._on_live   = on_live_update
        self._detector  = AbsorptionDetector()

        self._cvd: float   = 0.0            # session cumulative delta
        self._current: Optional[_LiveCandle] = None

    # ── Public ────────────────────────────────────────────────────────────────

    def on_trade(self, trade: Trade) -> None:
        cfg = get_config()
        tf  = cfg.timeframe_seconds

        candle_ts = math.floor(trade.timestamp / tf) * tf

        # Update session CVD
        if trade.side == "buy":
            self._cvd += trade.size
        else:
            self._cvd -= trade.size

        # Initialise first candle
        if self._current is None:
            self._current = _LiveCandle(candle_ts, cfg.tick_size, self._cvd)

        # Roll candle if we've entered a new time bucket
        if candle_ts > self._current.timestamp:
            self._close_current()
            self._current = _LiveCandle(candle_ts, cfg.tick_size, self._cvd)

        self._current.add_trade(trade)
        self._on_live(self._current)

    def reset(self) -> None:
        self._cvd     = 0.0
        self._current = None

    @property
    def cvd(self) -> float:
        return self._cvd

    # ── Internal ──────────────────────────────────────────────────────────────

    def _close_current(self) -> None:
        c = self._current
        if c is None:
            return
        absorptions = self._detector.detect(c.levels, c.high, c.low)
        candle      = c.close_candle(self._cvd, absorptions)
        self._on_closed(candle)
