"""
Application configuration — settings, colour palette, and runtime defaults.
All mutable runtime state lives in AppConfig; the singleton is accessed via
get_config() / update_config() so every module shares the same object.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict


# ── Colour Palette ────────────────────────────────────────────────────────────

PALETTE = {
    "bg_deepest":   "#080a0e",
    "bg_panel":     "#0d1117",
    "bg_cell":      "#111520",
    "bg_header":    "#141922",
    "border":       "#1c2232",
    "text_primary":   "#dce3f0",
    "text_secondary": "#556270",
    "text_dim":       "#2e3a4a",
    "buy":          "#00c896",
    "buy_light":    "#00e6aa",
    "buy_dark":     "#005a42",
    "sell":         "#ff3d6b",
    "sell_light":   "#ff6888",
    "sell_dark":    "#7a0f2e",
    "neutral":      "#8892a4",
    "absorption":   "#f0b429",
    "poc":          "#ffd700",
    "vah":          "#82b4ff",
    "val":          "#82b4ff",
    "imbalance":    "#a855f7",
    "cvd_pos":      "#00c896",
    "cvd_neg":      "#ff3d6b",
    "cvd_zero":     "#3b82f6",
    "crosshair":    "#4a5568",
    "price_label":  "#e2e8f0",
}


# ── Symbol catalogue ──────────────────────────────────────────────────────────
# Each entry: (display_name, tick_size, mock_base_price, feed_provider, feed_symbol)
#
# feed_provider:
#   "binance"  — free, crypto WebSocket  (no API key needed)
#   "polygon"  — FX + metals, $29/month  (needs POLYGON_API_KEY)
#   "oanda"    — FX pairs, free w/ account (needs OANDA_API_KEY + OANDA_ACCOUNT_ID)
#   "mock"     — built-in synthetic feed (always available)

SYMBOLS: Dict[str, dict] = {
    # ── Crypto (Binance — FREE, real footprint data) ───────────────────────
    "BTCUSDT": {
        "display":      "BTC/USDT",
        "tick_size":    0.10,
        "mock_price":   65_000.0,
        "provider":     "binance",
        "feed_symbol":  "btcusdt",
    },
    "ETHUSDT": {
        "display":      "ETH/USDT",
        "tick_size":    0.01,
        "mock_price":   3_500.0,
        "provider":     "binance",
        "feed_symbol":  "ethusdt",
    },
    "SOLUSDT": {
        "display":      "SOL/USDT",
        "tick_size":    0.01,
        "mock_price":   180.0,
        "provider":     "binance",
        "feed_symbol":  "solusdt",
    },
    "BNBUSDT": {
        "display":      "BNB/USDT",
        "tick_size":    0.01,
        "mock_price":   580.0,
        "provider":     "binance",
        "feed_symbol":  "bnbusdt",
    },

    # ── FX Pairs (Polygon.io — $29/month) or OANDA (free w/ account) ──────
    "EURUSD": {
        "display":      "EUR/USD",
        "tick_size":    0.00001,
        "mock_price":   1.0820,
        "provider":     "polygon",
        "feed_symbol":  "C:EURUSD",
        "oanda_symbol": "EUR_USD",
    },
    "AUDUSD": {
        "display":      "AUD/USD",
        "tick_size":    0.00001,
        "mock_price":   0.6550,
        "provider":     "polygon",
        "feed_symbol":  "C:AUDUSD",
        "oanda_symbol": "AUD_USD",
    },
    "GBPUSD": {
        "display":      "GBP/USD",
        "tick_size":    0.00001,
        "mock_price":   1.2650,
        "provider":     "polygon",
        "feed_symbol":  "C:GBPUSD",
        "oanda_symbol": "GBP_USD",
    },
    "USDJPY": {
        "display":      "USD/JPY",
        "tick_size":    0.001,
        "mock_price":   151.50,
        "provider":     "polygon",
        "feed_symbol":  "C:USDJPY",
        "oanda_symbol": "USD_JPY",
    },
    "USDCAD": {
        "display":      "USD/CAD",
        "tick_size":    0.00001,
        "mock_price":   1.3600,
        "provider":     "polygon",
        "feed_symbol":  "C:USDCAD",
        "oanda_symbol": "USD_CAD",
    },
    "USDCHF": {
        "display":      "USD/CHF",
        "tick_size":    0.00001,
        "mock_price":   0.9050,
        "provider":     "polygon",
        "feed_symbol":  "C:USDCHF",
        "oanda_symbol": "USD_CHF",
    },

    # ── Metals (Polygon.io) ────────────────────────────────────────────────
    "XAUUSD": {
        "display":      "XAU/USD  (Gold)",
        "tick_size":    0.01,
        "mock_price":   2_320.0,
        "provider":     "polygon",
        "feed_symbol":  "C:XAUUSD",
        "oanda_symbol": "XAU_USD",
    },
    "XAGUSD": {
        "display":      "XAG/USD  (Silver)",
        "tick_size":    0.001,
        "mock_price":   27.50,
        "provider":     "polygon",
        "feed_symbol":  "C:XAGUSD",
        "oanda_symbol": "XAG_USD",
    },

    # ── Always-available mock instruments ─────────────────────────────────
    "MOCK_ES": {
        "display":      "ES (Mock futures)",
        "tick_size":    0.25,
        "mock_price":   5_810.0,
        "provider":     "mock",
        "feed_symbol":  "MOCK_ES",
    },
}

DEFAULT_SYMBOL = "BTCUSDT"   # free, works with no API key


# ── Runtime Configuration ─────────────────────────────────────────────────────

@dataclass
class AppConfig:
    # ── Active symbol
    symbol: str             = DEFAULT_SYMBOL

    # ── Feed mode — overrides the per-symbol provider when set explicitly
    #   "auto"      — use the provider defined in SYMBOLS[symbol]
    #   "mock"      — force mock regardless of symbol
    #   "binance"   — force Binance (crypto)
    #   "polygon"   — force Polygon.io
    #   "oanda"     — force OANDA
    feed_mode: str          = "auto"

    # ── API keys (filled in via Settings → API Keys tab)
    polygon_api_key: str    = ""       # sign up free at polygon.io → $29/mo Starter
    oanda_api_key: str      = ""       # free at oanda.com → practice account
    oanda_account_id: str   = ""

    # ── Candle / aggregation
    timeframe_seconds: int  = 60
    tick_size: float        = 0.25     # overridden automatically when symbol changes

    # ── Imbalance thresholds
    imbalance_ratio: float  = 3.0
    stacked_imbalance_min: int = 3

    # ── Absorption detection
    absorption_min_volume: float = 300
    absorption_max_delta_ratio: float = 0.10

    # ── Volume thresholds
    volume_large: float     = 1_000
    volume_huge:  float     = 5_000

    # ── Display
    visible_candles: int    = 20
    cell_width:  int        = 90
    cell_height: int        = 14

    # ── Memory
    max_candles: int        = 500

    # ── Volume Profile
    value_area_pct: float   = 0.70

    # ── CVD
    cvd_window: int         = 100

    # ── Mock generator
    mock_base_price: float  = 5_810.0
    mock_tick_hz: float     = 8.0


_cfg: AppConfig = AppConfig()


def get_config() -> AppConfig:
    return _cfg


def update_config(**kwargs: object) -> None:
    for k, v in kwargs.items():
        if hasattr(_cfg, k):
            setattr(_cfg, k, v)
        else:
            raise KeyError(f"Unknown config key: {k!r}")


def apply_symbol(symbol: str) -> None:
    """Switch the active symbol and auto-configure tick_size and mock_base_price."""
    meta = SYMBOLS.get(symbol)
    if meta is None:
        return
    _cfg.symbol          = symbol
    _cfg.tick_size       = meta["tick_size"]
    _cfg.mock_base_price = meta["mock_price"]


def active_provider() -> str:
    """Return the effective feed provider for the current symbol."""
    if _cfg.feed_mode != "auto":
        return _cfg.feed_mode
    meta = SYMBOLS.get(_cfg.symbol, {})
    return meta.get("provider", "mock")
