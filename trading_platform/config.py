"""
Application configuration — settings, colour palette, and runtime defaults.
All mutable runtime state lives in AppConfig; the singleton is accessed via
get_config() / update_config() so every module shares the same object.
"""

from __future__ import annotations
from dataclasses import dataclass, field


# ── Colour Palette ────────────────────────────────────────────────────────────

PALETTE = {
    # Base backgrounds
    "bg_deepest":   "#080a0e",   # window fill
    "bg_panel":     "#0d1117",   # panel fill
    "bg_cell":      "#111520",   # default footprint cell
    "bg_header":    "#141922",   # toolbar / header
    "border":       "#1c2232",   # dividers

    # Typography
    "text_primary":   "#dce3f0",
    "text_secondary": "#556270",
    "text_dim":       "#2e3a4a",

    # Order-flow signal colours
    "buy":          "#00c896",   # aggressive buyers  (ask side)
    "buy_light":    "#00e6aa",
    "buy_dark":     "#005a42",
    "sell":         "#ff3d6b",   # aggressive sellers (bid side)
    "sell_light":   "#ff6888",
    "sell_dark":    "#7a0f2e",

    # Neutral / high-interest
    "neutral":      "#8892a4",
    "absorption":   "#f0b429",   # absorption zone highlight
    "poc":          "#ffd700",   # Point of Control
    "vah":          "#82b4ff",   # Value Area High
    "val":          "#82b4ff",   # Value Area Low
    "imbalance":    "#a855f7",   # imbalance marker

    # CVD
    "cvd_pos":      "#00c896",
    "cvd_neg":      "#ff3d6b",
    "cvd_zero":     "#3b82f6",

    # Misc
    "crosshair":    "#4a5568",
    "price_label":  "#e2e8f0",
}


# ── Runtime Configuration ─────────────────────────────────────────────────────

@dataclass
class AppConfig:
    # ── Feed settings
    symbol: str             = "ES"
    feed_mode: str          = "mock"      # "mock" | "websocket" | "rest"
    ws_url: str             = "wss://feed.example.com/trades"
    rest_url: str           = "https://feed.example.com/trades"

    # ── Candle / aggregation
    timeframe_seconds: int  = 60          # seconds per candle
    tick_size: float        = 0.25        # minimum price increment

    # ── Imbalance thresholds
    imbalance_ratio: float  = 3.0         # ask/bid ratio to flag imbalance
    stacked_imbalance_min: int = 3        # consecutive imbalance levels

    # ── Absorption detection
    absorption_min_volume: float = 300    # total vol at level to test
    absorption_max_delta_ratio: float = 0.10  # |delta|/total must be below this

    # ── Volume thresholds (for bubble sizing / cell shading)
    volume_large: float     = 1_000
    volume_huge:  float     = 5_000

    # ── Display
    visible_candles: int    = 20
    cell_width:  int        = 90          # pixels per candle column
    cell_height: int        = 14          # pixels per tick row

    # ── Memory management
    max_candles: int        = 500         # rolling window

    # ── Volume Profile
    value_area_pct: float   = 0.70        # % of total volume inside value area

    # ── CVD
    cvd_window: int         = 100         # bars shown in CVD strip

    # ── Mock data generator
    mock_base_price: float  = 5_810.0
    mock_tick_hz: float     = 8.0         # synthetic trades per second


_cfg: AppConfig = AppConfig()


def get_config() -> AppConfig:
    return _cfg


def update_config(**kwargs: object) -> None:
    for k, v in kwargs.items():
        if hasattr(_cfg, k):
            setattr(_cfg, k, v)
        else:
            raise KeyError(f"Unknown config key: {k!r}")
