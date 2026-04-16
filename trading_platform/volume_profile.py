"""
Volume Profile Engine
=====================
Aggregates volume across candles and derives:

  POC  — Point of Control (price level with highest total volume)
  VAH  — Value Area High  (upper boundary of 70 % value area)
  VAL  — Value Area Low   (lower boundary of 70 % value area)

Two profile modes are maintained simultaneously:

  SessionProfile  — full session (resets on new trading day)
  VisibleProfile  — only the candles currently visible in the chart viewport

Both expose the same VolumeProfile interface.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .config import get_config
from .footprint_engine import FootprintCandle


# ── Domain object ─────────────────────────────────────────────────────────────

@dataclass
class VolumeProfile:
    levels:   Dict[float, float]   # price → total volume
    poc:      Optional[float]       # Point of Control price
    vah:      Optional[float]       # Value Area High
    val:      Optional[float]       # Value Area Low
    tick:     float
    max_vol:  float                 # max volume at any level (for bar scaling)
    total_vol: float

    @property
    def sorted_prices(self) -> List[float]:
        return sorted(self.levels.keys())

    @property
    def value_area_prices(self) -> List[float]:
        if self.vah is None or self.val is None:
            return []
        return [p for p in self.levels if self.val <= p <= self.vah]

    def bar_ratio(self, price: float) -> float:
        """Fraction of the max bar width this level should occupy [0, 1]."""
        if self.max_vol == 0:
            return 0.0
        return self.levels.get(price, 0.0) / self.max_vol


# ── Calculation helpers ────────────────────────────────────────────────────────

def _compute_profile(
    raw_levels: Dict[float, float],
    tick:       float,
    va_pct:     float,
) -> VolumeProfile:
    """
    Given a mapping {price → volume}, compute POC, VAH, VAL.

    Value Area algorithm (standard TPO / volume profile convention):
      Starting from POC, expand upward and downward tick-by-tick, always
      adding the side whose next level has higher volume, until the
      accumulated volume reaches va_pct of total.
    """
    if not raw_levels:
        return VolumeProfile(
            levels={}, poc=None, vah=None, val=None,
            tick=tick, max_vol=0.0, total_vol=0.0,
        )

    total_vol = sum(raw_levels.values())
    max_vol   = max(raw_levels.values())
    poc       = max(raw_levels, key=raw_levels.get)

    if total_vol == 0:
        return VolumeProfile(
            levels=raw_levels, poc=poc, vah=poc, val=poc,
            tick=tick, max_vol=max_vol, total_vol=total_vol,
        )

    target  = total_vol * va_pct
    prices  = sorted(raw_levels.keys())

    # Find POC index
    poc_idx = prices.index(poc)
    va_vol  = raw_levels[poc]
    lo_idx  = poc_idx
    hi_idx  = poc_idx

    while va_vol < target:
        can_go_up   = hi_idx + 1 < len(prices)
        can_go_down = lo_idx - 1 >= 0

        if not can_go_up and not can_go_down:
            break

        up_vol   = raw_levels[prices[hi_idx + 1]] if can_go_up   else -1
        down_vol = raw_levels[prices[lo_idx - 1]] if can_go_down else -1

        if up_vol >= down_vol:
            hi_idx += 1
            va_vol += raw_levels[prices[hi_idx]]
        else:
            lo_idx -= 1
            va_vol += raw_levels[prices[lo_idx]]

    return VolumeProfile(
        levels    = raw_levels,
        poc       = poc,
        vah       = prices[hi_idx],
        val       = prices[lo_idx],
        tick      = tick,
        max_vol   = max_vol,
        total_vol = total_vol,
    )


# ── Session profile (full day) ────────────────────────────────────────────────

class SessionProfile:
    """
    Accumulates volume for the entire session.
    Resets when `reset()` is called (e.g. new trading day).
    """

    def __init__(self) -> None:
        self._levels: Dict[float, float] = defaultdict(float)

    def add_candle(self, candle: FootprintCandle) -> None:
        for price, lvl in candle.levels.items():
            self._levels[price] += lvl.total

    def compute(self) -> VolumeProfile:
        cfg = get_config()
        return _compute_profile(
            dict(self._levels), cfg.tick_size, cfg.value_area_pct
        )

    def reset(self) -> None:
        self._levels.clear()


# ── Visible-range profile ─────────────────────────────────────────────────────

class VisibleProfile:
    """
    Computes a volume profile restricted to whichever candles are currently
    visible in the chart viewport.  Recomputed on every viewport change.
    """

    def compute(self, candles: List[FootprintCandle]) -> VolumeProfile:
        cfg    = get_config()
        merged: Dict[float, float] = defaultdict(float)
        for c in candles:
            for price, lvl in c.levels.items():
                merged[price] += lvl.total
        return _compute_profile(dict(merged), cfg.tick_size, cfg.value_area_pct)


# ── Composite manager (used by ui_main) ───────────────────────────────────────

class VolumeProfileManager:
    """
    Manages both session and visible-range profiles.
    Exposes a simple API that the main window calls after each candle close.
    """

    def __init__(self) -> None:
        self._session = SessionProfile()
        self._visible = VisibleProfile()

    def on_candle_closed(self, candle: FootprintCandle) -> None:
        self._session.add_candle(candle)

    def get_session_profile(self) -> VolumeProfile:
        return self._session.compute()

    def get_visible_profile(self, visible_candles: List[FootprintCandle]) -> VolumeProfile:
        return self._visible.compute(visible_candles)

    def reset_session(self) -> None:
        self._session.reset()
