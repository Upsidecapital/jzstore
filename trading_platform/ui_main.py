"""
Main Application Window
=======================
Orchestrates the full dashboard:

  ┌──────────────────────── toolbar ──────────────────────────┐
  │ FootprintChart (expanding) │ VolumeProfileWidget (fixed)  │
  ├────────────────────────────┴──────────────────────────────┤
  │                 CVD Panel (fixed height)                   │
  └────────────────────────────────────────────────────────────┘

Threading model
  - Qt main thread owns all UI
  - DataWorker (QThread) runs a dedicated asyncio event loop
  - Data flows from DataWorker → Qt signals → aggregation → UI updates

Data pipeline (main thread, called via Qt signal)
  Trade → AggregationEngine.on_trade()
        → on_live_update(LiveCandle) → FootprintEngine → chart.update_live()
        → on_candle_closed(RawCandle) → FootprintEngine → chart.add_candle()
                                      → VolumeProfileManager → profile widget
                                      → CVD panel
"""

from __future__ import annotations

import asyncio
import threading
from collections import deque
from typing import Deque, List, Optional

from PySide6.QtCore import (
    Qt, QThread, Signal, QObject, Slot, QTimer,
)
from PySide6.QtGui import QAction, QFont, QIcon
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QSplitter, QToolBar, QLabel, QStatusBar,
    QComboBox, QSizePolicy, QFrame,
)

from .config import get_config, update_config
from .aggregation_engine import AggregationEngine, RawCandle, _LiveCandle
from .data_engine import DataEngine, Trade
from .footprint_engine import FootprintEngine, FootprintCandle
from .license_manager import UserSession
from .volume_profile import VolumeProfileManager

from .ui.footprint_chart import FootprintChart
from .ui.volume_profile_widget import VolumeProfileWidget
from .ui.cvd_panel import CVDPanel
from .ui.settings_dialog import SettingsDialog
from .ui.theme import color, hex_color


# ── Background worker ─────────────────────────────────────────────────────────

class _DataWorker(QObject):
    """Runs a DataEngine in a background thread with its own asyncio loop."""

    trade_ready = Signal(object)    # Trade

    def __init__(self):
        super().__init__()
        self._engine: Optional[DataEngine] = None
        self._loop:   Optional[asyncio.AbstractEventLoop] = None

    @Slot()
    def start(self) -> None:
        self._loop   = asyncio.new_event_loop()
        self._engine = DataEngine(self._on_trade)
        self._engine.start(self._loop)     # blocks until stop() called

    @Slot()
    def stop(self) -> None:
        if self._engine:
            self._engine.stop()

    def _on_trade(self, trade: Trade) -> None:
        self.trade_ready.emit(trade)


# ── Ticker label ──────────────────────────────────────────────────────────────

class _PriceLabel(QLabel):
    """Colour-coded live price label in the toolbar."""

    def __init__(self):
        super().__init__("—")
        self.setFont(QFont("Consolas", 13, QFont.Weight.Bold))
        self.setMinimumWidth(120)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._last = 0.0

    def update_price(self, price: float) -> None:
        if price > self._last:
            self.setStyleSheet(f"color: {hex_color('buy')}; background: transparent;")
        elif price < self._last:
            self.setStyleSheet(f"color: {hex_color('sell')}; background: transparent;")
        self._last = price
        self.setText(f"{price:.2f}")


# ── Main window ───────────────────────────────────────────────────────────────

class MainWindow(QMainWindow):

    def __init__(self, session: UserSession):
        super().__init__()
        self._session    = session
        self._fp_engine  = FootprintEngine()
        self._vp_manager = VolumeProfileManager()
        self._candles:   Deque[FootprintCandle] = deque(maxlen=500)

        self._worker_thread = QThread()
        self._worker        = _DataWorker()
        self._worker.moveToThread(self._worker_thread)

        self._agg_engine = AggregationEngine(
            on_candle_closed = self._on_candle_closed,
            on_live_update   = self._on_live_update,
        )

        self._build_ui()
        self._build_toolbar()
        self._build_statusbar()
        self._wire_signals()
        self._start_feed()

        self.setWindowTitle(f"JZ Analytics  –  {get_config().symbol}  [{session.username}]")
        self.resize(1440, 900)

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Main horizontal splitter: chart | volume profile
        h_split = QSplitter(Qt.Orientation.Horizontal)
        h_split.setHandleWidth(1)

        self._fp_chart = FootprintChart()
        self._vp_widget = VolumeProfileWidget()

        h_split.addWidget(self._fp_chart)
        h_split.addWidget(self._vp_widget)
        h_split.setStretchFactor(0, 1)
        h_split.setStretchFactor(1, 0)
        h_split.setSizes([1200, 130])

        # Vertical splitter: chart area | CVD panel
        v_split = QSplitter(Qt.Orientation.Vertical)
        v_split.setHandleWidth(1)
        v_split.addWidget(h_split)

        self._cvd_panel = CVDPanel()
        self._cvd_panel.setFixedHeight(110)
        v_split.addWidget(self._cvd_panel)
        v_split.setStretchFactor(0, 1)
        v_split.setStretchFactor(1, 0)

        root.addWidget(v_split)

    def _build_toolbar(self) -> None:
        tb = QToolBar("Main")
        tb.setMovable(False)
        tb.setFloatable(False)
        tb.setIconSize(__import__("PySide6.QtCore", fromlist=["QSize"]).QSize(16, 16))
        self.addToolBar(tb)

        # Symbol label
        sym_lbl = QLabel(f"  {get_config().symbol}  ")
        sym_lbl.setStyleSheet(
            f"color:{hex_color('text_secondary')}; font-size:10px; letter-spacing:2px;"
        )
        tb.addWidget(sym_lbl)

        # Live price
        self._price_label = _PriceLabel()
        tb.addWidget(self._price_label)

        tb.addSeparator()

        # Timeframe selector
        tf_lbl = QLabel("  Timeframe ")
        tf_lbl.setStyleSheet(f"color:{hex_color('text_secondary')};")
        tb.addWidget(tf_lbl)

        self._tf_combo = QComboBox()
        for label, val in [
            ("1s", 1), ("5s", 5), ("15s", 15), ("30s", 30),
            ("1m", 60), ("3m", 180), ("5m", 300), ("15m", 900), ("1h", 3600),
        ]:
            self._tf_combo.addItem(label, val)
        self._tf_combo.setCurrentIndex(4)   # default 1m
        self._tf_combo.currentIndexChanged.connect(self._on_tf_changed)
        tb.addWidget(self._tf_combo)

        tb.addSeparator()

        # CVD label (session)
        self._cvd_label = QLabel("  CVD  +0")
        self._cvd_label.setStyleSheet(
            f"color:{hex_color('buy')}; font-family:Consolas; font-size:11px; font-weight:bold;"
        )
        tb.addWidget(self._cvd_label)

        # Spacer
        spacer = QWidget()
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        tb.addWidget(spacer)

        # Feed mode indicator
        self._feed_lbl = QLabel(f"  FEED: {get_config().feed_mode.upper()}  ")
        self._feed_lbl.setStyleSheet(
            f"color:{hex_color('absorption')}; font-size:10px; letter-spacing:1px;"
        )
        tb.addWidget(self._feed_lbl)

        # Settings button
        settings_act = QAction("⚙  Settings", self)
        settings_act.triggered.connect(self._open_settings)
        tb.addAction(settings_act)

        # Logout
        logout_act = QAction("⏏  Logout", self)
        logout_act.triggered.connect(self._logout)
        tb.addAction(logout_act)

    def _build_statusbar(self) -> None:
        sb = QStatusBar()
        self.setStatusBar(sb)

        self._status_trades = QLabel("Trades: 0")
        self._status_candles = QLabel("Candles: 0")
        self._status_tier    = QLabel(
            f"  {self._session.username}  [{self._session.tier.upper()}]  "
        )
        self._status_tier.setStyleSheet(f"color:{hex_color('buy')};")

        sb.addWidget(self._status_trades)
        sb.addWidget(self._make_sep())
        sb.addWidget(self._status_candles)
        sb.addPermanentWidget(self._status_tier)

        self._trade_count  = 0
        self._candle_count = 0

    @staticmethod
    def _make_sep() -> QFrame:
        f = QFrame()
        f.setFrameShape(QFrame.Shape.VLine)
        f.setStyleSheet(f"color:{hex_color('border')};")
        return f

    # ── Signal wiring ──────────────────────────────────────────────────────────

    def _wire_signals(self) -> None:
        self._worker.trade_ready.connect(self._on_trade_signal, Qt.ConnectionType.QueuedConnection)
        self._worker_thread.started.connect(self._worker.start)
        self._fp_chart.price_range_changed.connect(self._on_price_range_changed)

    # ── Feed lifecycle ─────────────────────────────────────────────────────────

    def _start_feed(self) -> None:
        self._worker_thread.start()

    def _stop_feed(self) -> None:
        self._worker.stop()
        self._worker_thread.quit()
        self._worker_thread.wait(3000)

    # ── Data pipeline (main thread) ────────────────────────────────────────────

    @Slot(object)
    def _on_trade_signal(self, trade: Trade) -> None:
        self._trade_count += 1
        self._price_label.update_price(trade.price)
        self._agg_engine.on_trade(trade)

        # Update status every 50 trades
        if self._trade_count % 50 == 0:
            self._status_trades.setText(f"Trades: {self._trade_count:,}")
            cvd = self._agg_engine.cvd
            sign = "+" if cvd >= 0 else ""
            cvd_col = hex_color("buy") if cvd >= 0 else hex_color("sell")
            self._cvd_label.setText(f"  CVD  {sign}{cvd:,.0f}")
            self._cvd_label.setStyleSheet(
                f"color:{cvd_col}; font-family:Consolas; font-size:11px; font-weight:bold;"
            )

    def _on_live_update(self, live: _LiveCandle) -> None:
        """Called from asyncio thread — but AggregationEngine fires this synchronously
        from _on_trade_signal which is already on the main thread via QueuedConnection."""
        if live.open is None:
            return
        from .aggregation_engine import RawCandle, AbsorptionZone
        raw = live.close_candle(self._agg_engine.cvd, [])
        fp  = self._fp_engine.process(raw)
        self._fp_chart.update_live(fp)
        self._cvd_panel.update_live(fp)

    def _on_candle_closed(self, raw: RawCandle) -> None:
        fp = self._fp_engine.process(raw)
        self._candles.append(fp)
        self._vp_manager.on_candle_closed(fp)

        self._fp_chart.add_candle(fp)
        self._cvd_panel.add_candle(fp)

        self._candle_count += 1
        self._status_candles.setText(f"Candles: {self._candle_count:,}")

        # Update volume profile
        vis = list(self._candles)[-get_config().visible_candles:]
        prof = self._vp_manager.get_visible_profile(vis)
        if self._vp_widget._price_min != 0 or self._vp_widget._price_max != 0:
            self._vp_widget.set_profile(
                prof,
                self._vp_widget._price_min,
                self._vp_widget._price_max,
            )

    @Slot(float, float)
    def _on_price_range_changed(self, p_min: float, p_max: float) -> None:
        """Sync volume profile widget to footprint chart price range."""
        if self._vp_widget._profile:
            self._vp_widget.set_price_range(p_min, p_max)
        else:
            vis  = list(self._candles)[-get_config().visible_candles:]
            if vis:
                prof = self._vp_manager.get_visible_profile(vis)
                self._vp_widget.set_profile(prof, p_min, p_max)

    # ── UI event handlers ─────────────────────────────────────────────────────

    def _on_tf_changed(self, idx: int) -> None:
        val = self._tf_combo.itemData(idx)
        update_config(timeframe_seconds=val)
        self._agg_engine.reset()
        self._fp_chart.clear()
        self._cvd_panel.clear()
        self._candles.clear()
        self._vp_manager.reset_session()

    def _open_settings(self) -> None:
        dlg = SettingsDialog(self)
        dlg.settings_changed.connect(self._on_settings_changed)
        dlg.exec()

    def _on_settings_changed(self) -> None:
        cfg = get_config()
        self.setWindowTitle(f"JZ Analytics  –  {cfg.symbol}  [{self._session.username}]")
        self._feed_lbl.setText(f"  FEED: {cfg.feed_mode.upper()}  ")

    def _logout(self) -> None:
        from .license_manager import logout
        logout()
        self._stop_feed()
        self.close()

    # ── Close ──────────────────────────────────────────────────────────────────

    def closeEvent(self, event) -> None:
        self._stop_feed()
        event.accept()
