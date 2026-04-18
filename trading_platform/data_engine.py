"""
Data Feed Layer — Upside Analytics
====================================
Unified async interface over four feed modes:

  BinanceFeed   — Real crypto trades via Binance WebSocket  (FREE, no key needed)
                  Provides true footprint data: price, size, aggressor side
                  Pairs: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT …

  PolygonFeed   — Real FX + metals via Polygon.io WebSocket ($29/mo Starter plan)
                  Provides quote ticks: bid, ask, size. Side inferred from delta.
                  Pairs: EURUSD, AUDUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD …
                  Sign up: https://polygon.io  (need "Forex Starter" plan)

  OANDAFeed     — Real FX streaming via OANDA REST API      (FREE with account)
                  Provides bid/ask stream. Side inferred from mid-price movement.
                  Sign up: https://www.oanda.com  → get practice/live API key
                  Pairs: EUR_USD, AUD_USD, GBP_USD, XAU_USD …

  MockFeed      — Deterministic synthetic generator (always available, no key)
                  Uses Ornstein-Uhlenbeck price process + log-normal volume.

All feeds normalise each event into a Trade and push to a shared asyncio.Queue.
The DataEngine selects the feed and dispatches trades via a callback to the UI.
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import time
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np

from .config import get_config, SYMBOLS, active_provider


# ── Domain model ──────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Trade:
    timestamp: float   # Unix epoch (seconds)
    price:     float
    size:      float
    side:      str     # "buy" | "sell"
    bid:       float
    ask:       float


# ── Mock feed ─────────────────────────────────────────────────────────────────

class MockFeed:
    """
    Synthetic tick generator. Works for ANY symbol — reads base price and
    tick size from config so candles look realistic for each instrument.
    """

    def __init__(self, queue: asyncio.Queue) -> None:
        self._q    = queue
        cfg        = get_config()
        self._tick = cfg.tick_size
        self._hz   = cfg.mock_tick_hz
        self._price = cfg.mock_base_price
        self._mu    = self._price
        self._spread = self._tick
        self._theta = 0.02
        self._sigma = max(self._tick * 2, self._price * 0.0003)
        self._momentum: float = 0.0
        self._rng = np.random.default_rng(int(time.time()))

    def _next_price(self, dt: float) -> float:
        dW  = self._rng.standard_normal() * math.sqrt(dt)
        dp  = self._theta * (self._mu - self._price) * dt + self._sigma * dW
        raw = self._price + dp
        return round(round(raw / self._tick) * self._tick, 10)

    def _next_size(self) -> float:
        if self._rng.random() < 0.05:
            return float(self._rng.integers(200, 800))
        return max(1.0, float(self._rng.lognormal(mean=3.5, sigma=0.9)))

    def _next_side(self, new_price: float) -> str:
        if new_price > self._price:
            self._momentum = min(1.0, self._momentum + 0.15)
        elif new_price < self._price:
            self._momentum = max(-1.0, self._momentum - 0.15)
        else:
            self._momentum *= 0.95
        p_buy = 0.50 + 0.25 * self._momentum
        return "buy" if self._rng.random() < p_buy else "sell"

    async def run(self) -> None:
        dt = 1.0 / max(1.0, get_config().mock_tick_hz)
        while True:
            t0        = time.perf_counter()
            new_price = self._next_price(dt)
            side      = self._next_side(new_price)
            size      = self._next_size()
            half      = self._spread / 2
            trade     = Trade(
                timestamp = time.time(),
                price     = new_price,
                size      = round(size, 2),
                side      = side,
                bid       = round(new_price - half, 10),
                ask       = round(new_price + half, 10),
            )
            await self._q.put(trade)
            self._price = new_price
            if self._rng.random() < 0.001:
                drift   = self._rng.choice([-1, 1]) * self._tick * self._rng.integers(1, 5)
                self._mu = round(self._mu + drift, 10)
            elapsed = time.perf_counter() - t0
            await asyncio.sleep(max(0.0, dt - elapsed))


# ── Binance feed (FREE — crypto, real footprint data) ─────────────────────────

class BinanceFeed:
    """
    Streams individual trade events from Binance.

    Data quality: EXCELLENT for footprint — each message is a real executed
    trade with exact price, quantity, and aggressor side.

    No API key required.  Works for: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, etc.

    WebSocket URL: wss://stream.binance.com:9443/ws/<symbol>@trade
    Message keys:
      p  price (str)
      q  quantity (str)
      m  is_buyer_market_maker (bool)
         False → buyer is the aggressor  → side = "buy"
         True  → seller is the aggressor → side = "sell"
      T  trade time (ms)
    """

    WS_BASE = "wss://stream.binance.com:9443/ws"
    RECONNECT_DELAYS = [2, 4, 8, 16, 32]

    def __init__(self, queue: asyncio.Queue, symbol: str) -> None:
        self._q      = queue
        self._symbol = symbol.lower()   # Binance wants lowercase
        self._url    = f"{self.WS_BASE}/{self._symbol}@trade"

    async def run(self) -> None:
        try:
            import websockets
        except ImportError:
            raise RuntimeError("pip install websockets")

        attempt = 0
        while True:
            try:
                async with websockets.connect(
                    self._url,
                    ping_interval=20,
                    close_timeout=5,
                ) as ws:
                    attempt = 0
                    async for raw in ws:
                        trade = self._parse(raw)
                        if trade:
                            await self._q.put(trade)
            except Exception:
                delay = self.RECONNECT_DELAYS[min(attempt, len(self.RECONNECT_DELAYS) - 1)]
                attempt += 1
                await asyncio.sleep(delay)

    @staticmethod
    def _parse(raw: str) -> Optional[Trade]:
        try:
            d     = json.loads(raw)
            if d.get("e") != "trade":
                return None
            price = float(d["p"])
            size  = float(d["q"])
            # m=False → buyer is taker (aggressive buyer) → "buy"
            side  = "sell" if d["m"] else "buy"
            ts    = d["T"] / 1000.0
            tick  = get_config().tick_size
            return Trade(
                timestamp = ts,
                price     = price,
                size      = size,
                side      = side,
                bid       = price - tick / 2,
                ask       = price + tick / 2,
            )
        except Exception:
            return None


# ── Polygon.io feed (FX + metals, $29/month) ─────────────────────────────────

class PolygonFeed:
    """
    Streams forex quote ticks from Polygon.io.

    Data quality: GOOD for FX — each message is a quote update with bid/ask
    and size.  Side is inferred from mid-price movement (not exact trade data,
    but standard practice for OTC FX).

    Requires a Polygon.io account with "Forex Starter" plan ($29/month).
    Get your API key at: https://polygon.io

    Works for: EURUSD, AUDUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD, etc.

    Auth flow:
      1. Connect to wss://socket.polygon.io/forex
      2. Send {"action":"auth","params":"<API_KEY>"}
      3. Send {"action":"subscribe","params":"C.<SYMBOL>"}
    Message type "C" (forex quote):
      a  ask price
      b  bid price
      s  size (units)
      t  timestamp (ms)
    """

    WS_URL = "wss://socket.polygon.io/forex"
    RECONNECT_DELAYS = [2, 4, 8, 16, 32]

    def __init__(self, queue: asyncio.Queue, symbol: str, api_key: str) -> None:
        self._q       = queue
        self._symbol  = symbol          # e.g. "C:EURUSD"
        self._api_key = api_key
        self._last_mid: Optional[float] = None

    async def run(self) -> None:
        try:
            import websockets
        except ImportError:
            raise RuntimeError("pip install websockets")

        if not self._api_key:
            raise RuntimeError(
                "Polygon.io API key is required for FX/metals data.\n"
                "Sign up at polygon.io (Forex Starter plan, $29/month)\n"
                "then enter your key in Settings → API Keys."
            )

        attempt = 0
        while True:
            try:
                async with websockets.connect(
                    self.WS_URL, ping_interval=20, close_timeout=5
                ) as ws:
                    attempt = 0
                    # Auth
                    await ws.send(json.dumps({"action": "auth", "params": self._api_key}))
                    # Subscribe to per-second aggregates ("CA") and quotes ("C")
                    await ws.send(json.dumps({
                        "action": "subscribe",
                        "params": f"{self._symbol},CA.{self._symbol[2:]}"
                    }))

                    async for raw in ws:
                        msgs = json.loads(raw)
                        if not isinstance(msgs, list):
                            msgs = [msgs]
                        for msg in msgs:
                            trade = self._parse(msg)
                            if trade:
                                await self._q.put(trade)
            except Exception:
                delay = self.RECONNECT_DELAYS[min(attempt, len(self.RECONNECT_DELAYS) - 1)]
                attempt += 1
                await asyncio.sleep(delay)

    def _parse(self, msg: dict) -> Optional[Trade]:
        try:
            ev = msg.get("ev", "")

            if ev == "C":
                # Individual forex quote: a=ask, b=bid, s=size, t=timestamp_ms
                ask  = float(msg["a"])
                bid  = float(msg["b"])
                size = float(msg.get("s", 1.0))
                ts   = msg["t"] / 1000.0
                mid  = (ask + bid) / 2.0

                if self._last_mid is None:
                    self._last_mid = mid
                    return None
                side = "buy" if mid >= self._last_mid else "sell"
                self._last_mid = mid

                return Trade(
                    timestamp = ts,
                    price     = mid,
                    size      = size,
                    side      = side,
                    bid       = bid,
                    ask       = ask,
                )

            if ev == "CA":
                # Second aggregate: o=open, c=close, h=high, l=low, v=volume
                close = float(msg["c"])
                open_ = float(msg["o"])
                vol   = float(msg.get("v", 1.0))
                ts    = msg["s"] / 1000.0
                tick  = get_config().tick_size
                side  = "buy" if close >= open_ else "sell"
                return Trade(
                    timestamp = ts,
                    price     = close,
                    size      = vol,
                    side      = side,
                    bid       = close - tick / 2,
                    ask       = close + tick / 2,
                )

        except Exception:
            return None
        return None


# ── OANDA feed (FX, FREE with practice account) ───────────────────────────────

class OANDAFeed:
    """
    Streams FX rates from the OANDA v20 streaming REST API.

    Data quality: GOOD for FX — real-time bid/ask stream.  Side inferred from
    mid-price direction (same as Polygon approach, standard for OTC FX).

    FREE with an OANDA practice or live account.
    Sign up at: https://www.oanda.com
    Get API key:  My Account → Manage API Access

    Works for: EUR_USD, AUD_USD, GBP_USD, USD_JPY, XAU_USD, XAG_USD, etc.

    Note: OANDA uses underscore notation (EUR_USD not EURUSD).
    """

    BASE_PRACTICE = "https://stream-fxtrade.oanda.com"
    BASE_LIVE     = "https://stream-fxtrade.oanda.com"

    RECONNECT_DELAYS = [2, 4, 8, 16, 32]

    def __init__(
        self,
        queue:       asyncio.Queue,
        instrument:  str,    # e.g. "EUR_USD"
        api_key:     str,
        account_id:  str,
        practice:    bool = True,
    ) -> None:
        self._q          = queue
        self._instrument = instrument
        self._api_key    = api_key
        self._account_id = account_id
        base = "https://stream-fxpractice.oanda.com" if practice else self.BASE_LIVE
        self._url = (
            f"{base}/v3/accounts/{account_id}/pricing/stream"
            f"?instruments={instrument}"
        )
        self._last_mid: Optional[float] = None

    async def run(self) -> None:
        try:
            import aiohttp
        except ImportError:
            raise RuntimeError("pip install aiohttp")

        if not self._api_key or not self._account_id:
            raise RuntimeError(
                "OANDA API key and Account ID are required.\n"
                "Sign up free at oanda.com → practice account.\n"
                "Enter your credentials in Settings → API Keys."
            )

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type":  "application/json",
        }
        attempt = 0
        while True:
            try:
                async with aiohttp.ClientSession(headers=headers) as session:
                    async with session.get(
                        self._url,
                        timeout=aiohttp.ClientTimeout(connect=10, sock_read=None),
                    ) as resp:
                        resp.raise_for_status()
                        attempt = 0
                        async for line in resp.content:
                            text = line.decode("utf-8").strip()
                            if not text:
                                continue
                            trade = self._parse(text)
                            if trade:
                                await self._q.put(trade)
            except Exception:
                delay = self.RECONNECT_DELAYS[min(attempt, len(self.RECONNECT_DELAYS) - 1)]
                attempt += 1
                await asyncio.sleep(delay)

    def _parse(self, raw: str) -> Optional[Trade]:
        try:
            d = json.loads(raw)
            if d.get("type") != "PRICE":
                return None
            bids = d.get("bids", [])
            asks = d.get("asks", [])
            if not bids or not asks:
                return None

            bid   = float(bids[0]["price"])
            ask   = float(asks[0]["price"])
            # OANDA uses ISO timestamp
            ts    = time.time()
            mid   = (bid + ask) / 2.0
            size  = float(bids[0].get("liquidity", 1_000_000)) / 1_000_000.0  # normalise to units

            if self._last_mid is None:
                self._last_mid = mid
                return None
            side = "buy" if mid >= self._last_mid else "sell"
            self._last_mid = mid

            return Trade(
                timestamp = ts,
                price     = mid,
                size      = max(size, 0.01),
                side      = side,
                bid       = bid,
                ask       = ask,
            )
        except Exception:
            return None


# ── Engine orchestrator ────────────────────────────────────────────────────────

TradeCallback = Callable[[Trade], None]


class DataEngine:
    """
    Owns the asyncio event loop (runs in a background QThread).
    Auto-selects the correct feed for the active symbol.
    Call start(loop) from a background thread; it blocks until stop() is called.
    """

    def __init__(self, callback: TradeCallback) -> None:
        self._callback   = callback
        self._queue: asyncio.Queue[Trade] = asyncio.Queue(maxsize=50_000)
        self._stop_event: Optional[asyncio.Event] = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._run())

    def stop(self) -> None:
        if self._stop_event:
            self._stop_event.set()

    async def _run(self) -> None:
        self._stop_event = asyncio.Event()
        feed = self._make_feed()

        producer = asyncio.create_task(feed.run())
        consumer = asyncio.create_task(self._consume())
        stopper  = asyncio.create_task(self._stop_event.wait())

        done, pending = await asyncio.wait(
            [producer, consumer, stopper],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    def _make_feed(self):
        cfg      = get_config()
        provider = active_provider()
        meta     = SYMBOLS.get(cfg.symbol, {})

        if provider == "binance":
            feed_sym = meta.get("feed_symbol", cfg.symbol.lower())
            return BinanceFeed(self._queue, feed_sym)

        if provider == "polygon":
            if not cfg.polygon_api_key:
                print(
                    "[Upside] No Polygon API key — falling back to mock.\n"
                    "         Enter your key in Settings → API Keys."
                )
                return MockFeed(self._queue)
            feed_sym = meta.get("feed_symbol", f"C:{cfg.symbol}")
            return PolygonFeed(self._queue, feed_sym, cfg.polygon_api_key)

        if provider == "oanda":
            if not cfg.oanda_api_key or not cfg.oanda_account_id:
                print(
                    "[Upside] No OANDA credentials — falling back to mock.\n"
                    "         Enter your key in Settings → API Keys."
                )
                return MockFeed(self._queue)
            oanda_sym = meta.get("oanda_symbol", cfg.symbol[:3] + "_" + cfg.symbol[3:])
            return OANDAFeed(
                self._queue, oanda_sym,
                cfg.oanda_api_key, cfg.oanda_account_id,
            )

        return MockFeed(self._queue)

    async def _consume(self) -> None:
        while True:
            trade = await self._queue.get()
            try:
                self._callback(trade)
            except Exception:
                pass
