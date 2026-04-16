"""
Data Feed Layer
===============
Provides a unified async interface over three feed modes:

  1. MockFeed        — deterministic synthetic tick generator for testing/demo
  2. WebSocketFeed   — live tick stream over WebSocket (asyncio-native)
  3. RESTFeed        — polling-based REST fallback

All feeds normalise each trade into a Trade namedtuple and push it to a shared
asyncio.Queue.  The DataEngine selects the active feed and exposes a single
`start()` coroutine that the background worker thread runs.

Thread-safety note
------------------
The background thread owns the asyncio event loop.  Communication back to the
Qt main thread is done exclusively via Qt signals; never touch Qt objects from
inside this module.
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import time
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Optional

import numpy as np

from .config import get_config


# ── Domain model ──────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Trade:
    timestamp: float   # Unix epoch seconds (float)
    price:     float   # execution price
    size:      float   # number of contracts / shares
    side:      str     # "buy" (aggressor lifted ask) | "sell" (aggressor hit bid)
    bid:       float   # best bid at time of trade
    ask:       float   # best ask at time of trade


# ── Mock feed ─────────────────────────────────────────────────────────────────

class MockFeed:
    """
    Synthetic tick generator that produces realistic-looking order flow.

    Price follows a mean-reverting Ornstein-Uhlenbeck process.  Volume is
    drawn from a log-normal distribution with occasional large prints to
    simulate institutional activity.  Side is correlated with short-term
    momentum so the footprint shows plausible delta patterns.
    """

    def __init__(self, queue: asyncio.Queue) -> None:
        self._q    = queue
        cfg        = get_config()
        self._tick = cfg.tick_size
        self._hz   = cfg.mock_tick_hz
        self._price = cfg.mock_base_price

        # OU parameters
        self._theta = 0.02    # mean reversion speed
        self._sigma = 0.8     # volatility (in ticks per sqrt-second)
        self._mu    = self._price

        # Running bid-ask spread (1 tick wide for ES-like instrument)
        self._spread = self._tick

        # Short-term momentum for side bias
        self._momentum: float = 0.0

        self._rng = np.random.default_rng(int(time.time()))

    def _next_price(self, dt: float) -> float:
        """Tick the OU process forward by dt seconds."""
        dW = self._rng.standard_normal() * math.sqrt(dt)
        dp = self._theta * (self._mu - self._price) * dt + self._sigma * dW
        # Snap to nearest tick
        raw = self._price + dp
        return round(round(raw / self._tick) * self._tick, 10)

    def _next_size(self) -> float:
        """Log-normal volume; 5 % chance of large print."""
        if self._rng.random() < 0.05:
            return float(self._rng.integers(200, 800))
        return max(1.0, float(self._rng.lognormal(mean=3.5, sigma=0.9)))

    def _next_side(self, new_price: float) -> str:
        """Side is biased toward momentum; price move updates momentum."""
        if new_price > self._price:
            self._momentum = min(1.0, self._momentum + 0.15)
        elif new_price < self._price:
            self._momentum = max(-1.0, self._momentum - 0.15)
        else:
            self._momentum *= 0.95

        # P(buy) ranges from 0.25 to 0.75 depending on momentum
        p_buy = 0.50 + 0.25 * self._momentum
        return "buy" if self._rng.random() < p_buy else "sell"

    async def run(self) -> None:
        dt = 1.0 / self._hz
        while True:
            t0 = time.perf_counter()

            new_price = self._next_price(dt)
            side      = self._next_side(new_price)
            size      = self._next_size()

            half_spread = self._spread / 2
            bid = round(new_price - half_spread, 10)
            ask = round(new_price + half_spread, 10)

            trade = Trade(
                timestamp = time.time(),
                price     = new_price,
                size      = round(size, 2),
                side      = side,
                bid       = bid,
                ask       = ask,
            )
            await self._q.put(trade)
            self._price = new_price

            # Drift mu slowly so price wanders
            if self._rng.random() < 0.001:
                drift = self._rng.choice([-1, 1]) * self._tick * self._rng.integers(1, 5)
                self._mu = round(self._mu + drift, 10)

            elapsed = time.perf_counter() - t0
            await asyncio.sleep(max(0.0, dt - elapsed))


# ── WebSocket feed ─────────────────────────────────────────────────────────────

class WebSocketFeed:
    """
    Connects to a WebSocket endpoint that streams trade messages as JSON.

    Expected message format (configurable via _parse):
      {"t": 1710000000.123, "p": 5810.25, "s": 12.0, "side": "buy",
       "bid": 5810.0, "ask": 5810.25}
    """

    RECONNECT_DELAYS = [2, 4, 8, 16, 30]   # exponential back-off caps at 30 s

    def __init__(self, queue: asyncio.Queue, url: str) -> None:
        self._q   = queue
        self._url = url

    @staticmethod
    def _parse(raw: str) -> Optional[Trade]:
        try:
            d = json.loads(raw)
            return Trade(
                timestamp = float(d["t"]),
                price     = float(d["p"]),
                size      = float(d["s"]),
                side      = str(d["side"]).lower(),
                bid       = float(d.get("bid", d["p"])),
                ask       = float(d.get("ask", d["p"])),
            )
        except Exception:
            return None

    async def run(self) -> None:
        try:
            import websockets  # optional dependency
        except ImportError:
            raise RuntimeError(
                "websockets package not installed. "
                "Run: pip install websockets"
            )

        attempt = 0
        while True:
            try:
                async with websockets.connect(self._url, ping_interval=20) as ws:
                    attempt = 0
                    async for raw in ws:
                        trade = self._parse(raw)
                        if trade:
                            await self._q.put(trade)
            except Exception as exc:
                delay = self.RECONNECT_DELAYS[min(attempt, len(self.RECONNECT_DELAYS) - 1)]
                attempt += 1
                await asyncio.sleep(delay)


# ── REST feed (polling) ────────────────────────────────────────────────────────

class RESTFeed:
    """
    Polls a REST endpoint for recent trades.  Deduplicates by timestamp.
    Useful when a WebSocket is unavailable.
    """

    def __init__(self, queue: asyncio.Queue, url: str, poll_interval: float = 1.0) -> None:
        self._q        = queue
        self._url      = url
        self._interval = poll_interval
        self._seen: set[float] = set()

    async def run(self) -> None:
        try:
            import aiohttp
        except ImportError:
            raise RuntimeError(
                "aiohttp package not installed. "
                "Run: pip install aiohttp"
            )

        async with aiohttp.ClientSession() as session:
            while True:
                t0 = time.perf_counter()
                try:
                    async with session.get(self._url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        data = await resp.json()
                        for item in data.get("trades", []):
                            ts = float(item.get("t", 0))
                            if ts in self._seen:
                                continue
                            self._seen.add(ts)
                            # Keep seen set bounded
                            if len(self._seen) > 10_000:
                                self._seen = set(list(self._seen)[-5_000:])
                            trade = Trade(
                                timestamp = ts,
                                price     = float(item["p"]),
                                size      = float(item["s"]),
                                side      = str(item["side"]).lower(),
                                bid       = float(item.get("bid", item["p"])),
                                ask       = float(item.get("ask", item["p"])),
                            )
                            await self._q.put(trade)
                except Exception:
                    pass
                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.0, self._interval - elapsed))


# ── Engine orchestrator ────────────────────────────────────────────────────────

TradeCallback = Callable[[Trade], None]


class DataEngine:
    """
    Owns the asyncio event loop (runs in a background thread).
    Selects the appropriate feed and dispatches each Trade to *callback*.

    Usage (from a QThread or threading.Thread):

        engine   = DataEngine(on_trade_fn)
        loop     = asyncio.new_event_loop()
        engine.start(loop)          # blocks until stop() is called
    """

    def __init__(self, callback: TradeCallback) -> None:
        self._callback = callback
        self._queue: asyncio.Queue[Trade] = asyncio.Queue(maxsize=50_000)
        self._stop_event: Optional[asyncio.Event] = None

    # ── Public API ────────────────────────────────────────────────────────────

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Blocking call — run this from a background thread."""
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._run())

    def stop(self) -> None:
        if self._stop_event:
            self._stop_event.set()

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _run(self) -> None:
        self._stop_event = asyncio.Event()
        cfg  = get_config()
        feed = self._make_feed(cfg.feed_mode)

        producer = asyncio.create_task(feed.run())
        consumer = asyncio.create_task(self._consume())
        stopper  = asyncio.create_task(self._stop_event.wait())

        done, pending = await asyncio.wait(
            [producer, consumer, stopper],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    def _make_feed(self, mode: str):
        cfg = get_config()
        if mode == "mock":
            return MockFeed(self._queue)
        if mode == "websocket":
            return WebSocketFeed(self._queue, cfg.ws_url)
        if mode == "rest":
            return RESTFeed(self._queue, cfg.rest_url)
        raise ValueError(f"Unknown feed mode: {mode!r}")

    async def _consume(self) -> None:
        while True:
            trade = await self._queue.get()
            try:
                self._callback(trade)
            except Exception:
                pass
