"""
Footprint Engine
================
Transforms RawCandle objects from the AggregationEngine into FootprintCandle
objects ready for rendering.

Key computations
----------------
  • Imbalance detection
      A bid/ask imbalance at price P exists when the ratio of one side to the
      opposing side at the *adjacent* price level exceeds the configured
      threshold.

      Buy  imbalance at P : ask_vol[P] / bid_vol[P - tick]  ≥ ratio
      Sell imbalance at P : bid_vol[P] / ask_vol[P + tick]  ≥ ratio

  • Stacked imbalances
      Three or more consecutive imbalance levels in the same direction.

  • Candle delta bars (used by the chart header)
      Total delta, normalised delta ratio, delta color.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from .aggregation_engine import PriceLevelData, RawCandle, AbsorptionZone
from .config import get_config


# ── Enriched footprint candle ─────────────────────────────────────────────────

@dataclass
class FootprintCandle:
    # Core OHLC
    timestamp:    float
    open:         float
    high:         float
    low:          float
    close:        float

    # Volume data
    levels:       Dict[float, PriceLevelData]
    total_bid:    float
    total_ask:    float
    trade_count:  int

    # Order-flow analytics
    cvd_open:         float
    cvd_close:        float
    absorptions:      List[AbsorptionZone]
    buy_imbalances:   Set[float]     # prices with buy imbalance
    sell_imbalances:  Set[float]     # prices with sell imbalance
    stacked_buy_imbalances:  List[List[float]]   # groups of consecutive buy imbal.
    stacked_sell_imbalances: List[List[float]]

    # Per-candle maxima (used for cell normalisation in the renderer)
    max_bid_vol:  float = 0.0
    max_ask_vol:  float = 0.0
    max_total_vol: float = 0.0
    poc_price:    Optional[float] = None  # price with highest total volume

    @property
    def delta(self) -> float:
        return self.total_ask - self.total_bid

    @property
    def total_volume(self) -> float:
        return self.total_bid + self.total_ask

    @property
    def delta_ratio(self) -> float:
        """Normalised delta in [-1, 1]."""
        tv = self.total_volume
        if tv == 0:
            return 0.0
        return self.delta / tv

    @property
    def sorted_prices(self) -> List[float]:
        return sorted(self.levels.keys())

    def is_absorption(self, price: float) -> bool:
        return any(abs(a.price - price) < 1e-9 for a in self.absorptions)

    def absorption_kind(self, price: float) -> Optional[str]:
        for a in self.absorptions:
            if abs(a.price - price) < 1e-9:
                return a.kind
        return None


# ── Engine ────────────────────────────────────────────────────────────────────

class FootprintEngine:
    """
    Converts a RawCandle → FootprintCandle.
    Stateless: each call is independent.
    """

    def process(self, raw: RawCandle) -> FootprintCandle:
        cfg  = get_config()
        tick = cfg.tick_size

        levels   = raw.levels
        prices   = sorted(levels.keys())
        price_ix = {p: i for i, p in enumerate(prices)}

        # ── POC ──────────────────────────────────────────────────────────────
        poc = max(levels.keys(), key=lambda p: levels[p].total, default=None)

        # ── Per-candle volume maxima ──────────────────────────────────────────
        max_bid   = max((lvl.bid_vol for lvl in levels.values()), default=0.0)
        max_ask   = max((lvl.ask_vol for lvl in levels.values()), default=0.0)
        max_total = max((lvl.total   for lvl in levels.values()), default=0.0)

        # ── Imbalances ────────────────────────────────────────────────────────
        ratio = cfg.imbalance_ratio
        buy_imb:  Set[float] = set()
        sell_imb: Set[float] = set()

        for p in prices:
            lvl = levels[p]

            # Buy imbalance: ask[p] vs bid[p - tick]
            lower = round(p - tick, 10)
            if lower in levels:
                lower_bid = levels[lower].bid_vol
                if lower_bid > 0 and lvl.ask_vol / lower_bid >= ratio:
                    buy_imb.add(p)
                elif lower_bid == 0 and lvl.ask_vol > 0:
                    buy_imb.add(p)

            # Sell imbalance: bid[p] vs ask[p + tick]
            upper = round(p + tick, 10)
            if upper in levels:
                upper_ask = levels[upper].ask_vol
                if upper_ask > 0 and lvl.bid_vol / upper_ask >= ratio:
                    sell_imb.add(p)
                elif upper_ask == 0 and lvl.bid_vol > 0:
                    sell_imb.add(p)

        # ── Stacked imbalances ────────────────────────────────────────────────
        stacked_buy  = self._find_stacks(prices, buy_imb,  tick, cfg.stacked_imbalance_min)
        stacked_sell = self._find_stacks(prices, sell_imb, tick, cfg.stacked_imbalance_min)

        return FootprintCandle(
            timestamp    = raw.timestamp,
            open         = raw.open,
            high         = raw.high,
            low          = raw.low,
            close        = raw.close,
            levels       = levels,
            total_bid    = raw.total_bid,
            total_ask    = raw.total_ask,
            trade_count  = raw.trade_count,
            cvd_open     = raw.cvd_open,
            cvd_close    = raw.cvd_close,
            absorptions  = raw.absorptions,
            buy_imbalances   = buy_imb,
            sell_imbalances  = sell_imb,
            stacked_buy_imbalances  = stacked_buy,
            stacked_sell_imbalances = stacked_sell,
            max_bid_vol  = max_bid,
            max_ask_vol  = max_ask,
            max_total_vol = max_total,
            poc_price    = poc,
        )

    @staticmethod
    def _find_stacks(
        prices:  List[float],
        imb_set: Set[float],
        tick:    float,
        min_len: int,
    ) -> List[List[float]]:
        """Group consecutive imbalance prices into stacks of ≥ min_len."""
        if not imb_set:
            return []

        sorted_imb = sorted(imb_set)
        groups: List[List[float]] = []
        current: List[float] = [sorted_imb[0]]

        for p in sorted_imb[1:]:
            if abs(p - current[-1] - tick) < 1e-9:
                current.append(p)
            else:
                if len(current) >= min_len:
                    groups.append(current)
                current = [p]

        if len(current) >= min_len:
            groups.append(current)

        return groups
