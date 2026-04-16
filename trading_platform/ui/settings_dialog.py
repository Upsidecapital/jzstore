"""
Settings Dialog
===============
Lets the user configure all runtime parameters from the AppConfig.
Changes are applied immediately via update_config() and take effect on the
next candle (feed-related settings require a restart of the data engine).
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QFormLayout,
    QLabel, QLineEdit, QPushButton, QComboBox,
    QDoubleSpinBox, QSpinBox, QGroupBox, QFrame,
    QDialogButtonBox, QTabWidget, QWidget, QCheckBox,
)

from ..config import get_config, update_config
from .theme import hex_color


class SettingsDialog(QDialog):
    """
    Modal settings panel.
    Emits `settings_changed` when the user clicks Apply or OK.
    """

    settings_changed = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(480)
        self.setStyleSheet(f"""
            QDialog {{
                background-color: {hex_color('bg_panel')};
            }}
        """)
        self._build_ui()
        self._load_current()

    # ── Build ─────────────────────────────────────────────────────────────────

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setSpacing(0)
        root.setContentsMargins(0, 0, 0, 0)

        tabs = QTabWidget()
        tabs.addTab(self._feed_tab(),     "Feed")
        tabs.addTab(self._candle_tab(),   "Candle")
        tabs.addTab(self._analysis_tab(), "Analysis")
        tabs.addTab(self._display_tab(),  "Display")
        root.addWidget(tabs)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok |
            QDialogButtonBox.StandardButton.Apply |
            QDialogButtonBox.StandardButton.Cancel
        )
        buttons.setStyleSheet(f"padding: 8px 12px;")
        buttons.accepted.connect(self._ok)
        buttons.rejected.connect(self.reject)
        buttons.button(QDialogButtonBox.StandardButton.Apply).clicked.connect(self._apply)
        root.addWidget(buttons)

    # ── Feed tab ──────────────────────────────────────────────────────────────

    def _feed_tab(self) -> QWidget:
        w = QWidget()
        form = QFormLayout(w)
        form.setContentsMargins(20, 16, 20, 16)
        form.setSpacing(12)

        self._symbol = QLineEdit()
        form.addRow("Symbol", self._symbol)

        self._feed_mode = QComboBox()
        self._feed_mode.addItems(["mock", "websocket", "rest"])
        form.addRow("Feed Mode", self._feed_mode)

        self._ws_url = QLineEdit()
        self._ws_url.setPlaceholderText("wss://feed.example.com/trades")
        form.addRow("WebSocket URL", self._ws_url)

        self._rest_url = QLineEdit()
        self._rest_url.setPlaceholderText("https://feed.example.com/trades")
        form.addRow("REST URL", self._rest_url)

        self._mock_hz = QDoubleSpinBox()
        self._mock_hz.setRange(0.5, 100.0)
        self._mock_hz.setSingleStep(1.0)
        self._mock_hz.setSuffix("  ticks/s")
        form.addRow("Mock Speed", self._mock_hz)

        note = QLabel("Feed mode changes require restarting the data engine.")
        note.setObjectName("sub")
        note.setWordWrap(True)
        form.addRow(note)

        return w

    # ── Candle tab ────────────────────────────────────────────────────────────

    def _candle_tab(self) -> QWidget:
        w = QWidget()
        form = QFormLayout(w)
        form.setContentsMargins(20, 16, 20, 16)
        form.setSpacing(12)

        self._timeframe = QComboBox()
        for label, val in [
            ("1 second", 1), ("5 seconds", 5), ("15 seconds", 15),
            ("30 seconds", 30), ("1 minute", 60), ("3 minutes", 180),
            ("5 minutes", 300), ("15 minutes", 900), ("1 hour", 3600),
        ]:
            self._timeframe.addItem(label, val)
        form.addRow("Timeframe", self._timeframe)

        self._tick_size = QDoubleSpinBox()
        self._tick_size.setRange(0.001, 100.0)
        self._tick_size.setDecimals(4)
        self._tick_size.setSingleStep(0.25)
        form.addRow("Tick Size", self._tick_size)

        self._max_candles = QSpinBox()
        self._max_candles.setRange(50, 2000)
        self._max_candles.setSingleStep(50)
        self._max_candles.setSuffix("  bars")
        form.addRow("Max Candles (memory)", self._max_candles)

        return w

    # ── Analysis tab ──────────────────────────────────────────────────────────

    def _analysis_tab(self) -> QWidget:
        w = QWidget()
        form = QFormLayout(w)
        form.setContentsMargins(20, 16, 20, 16)
        form.setSpacing(12)

        grp_imb = QGroupBox("Imbalance Detection")
        g_form  = QFormLayout(grp_imb)

        self._imbalance_ratio = QDoubleSpinBox()
        self._imbalance_ratio.setRange(1.5, 20.0)
        self._imbalance_ratio.setSingleStep(0.5)
        self._imbalance_ratio.setSuffix("x")
        g_form.addRow("Ask/Bid Ratio Threshold", self._imbalance_ratio)

        self._stacked_min = QSpinBox()
        self._stacked_min.setRange(2, 10)
        g_form.addRow("Stacked Imbalance Min Levels", self._stacked_min)

        form.addRow(grp_imb)

        grp_abs = QGroupBox("Absorption Detection")
        a_form  = QFormLayout(grp_abs)

        self._abs_min_vol = QDoubleSpinBox()
        self._abs_min_vol.setRange(10, 50_000)
        self._abs_min_vol.setSingleStep(50)
        a_form.addRow("Minimum Volume", self._abs_min_vol)

        self._abs_delta_ratio = QDoubleSpinBox()
        self._abs_delta_ratio.setRange(0.01, 0.5)
        self._abs_delta_ratio.setSingleStep(0.01)
        self._abs_delta_ratio.setSuffix("  max |delta|/total")
        a_form.addRow("Max Delta Ratio", self._abs_delta_ratio)

        form.addRow(grp_abs)

        grp_vp = QGroupBox("Volume Profile")
        vp_form = QFormLayout(grp_vp)

        self._va_pct = QDoubleSpinBox()
        self._va_pct.setRange(0.5, 0.99)
        self._va_pct.setSingleStep(0.01)
        self._va_pct.setSuffix("  (70 % standard)")
        vp_form.addRow("Value Area %", self._va_pct)

        form.addRow(grp_vp)
        return w

    # ── Display tab ───────────────────────────────────────────────────────────

    def _display_tab(self) -> QWidget:
        w = QWidget()
        form = QFormLayout(w)
        form.setContentsMargins(20, 16, 20, 16)
        form.setSpacing(12)

        self._visible_candles = QSpinBox()
        self._visible_candles.setRange(5, 100)
        self._visible_candles.setSuffix("  bars")
        form.addRow("Visible Candles", self._visible_candles)

        self._cell_width = QSpinBox()
        self._cell_width.setRange(40, 300)
        self._cell_width.setSuffix("  px")
        form.addRow("Cell Width", self._cell_width)

        self._cell_height = QSpinBox()
        self._cell_height.setRange(8, 40)
        self._cell_height.setSuffix("  px")
        form.addRow("Cell Height", self._cell_height)

        self._cvd_window = QSpinBox()
        self._cvd_window.setRange(10, 500)
        self._cvd_window.setSuffix("  bars")
        form.addRow("CVD Window", self._cvd_window)

        return w

    # ── Load / Save ───────────────────────────────────────────────────────────

    def _load_current(self):
        cfg = get_config()

        self._symbol.setText(cfg.symbol)
        idx = self._feed_mode.findText(cfg.feed_mode)
        if idx >= 0:
            self._feed_mode.setCurrentIndex(idx)
        self._ws_url.setText(cfg.ws_url)
        self._rest_url.setText(cfg.rest_url)
        self._mock_hz.setValue(cfg.mock_tick_hz)

        tf_val = cfg.timeframe_seconds
        for i in range(self._timeframe.count()):
            if self._timeframe.itemData(i) == tf_val:
                self._timeframe.setCurrentIndex(i)
                break
        self._tick_size.setValue(cfg.tick_size)
        self._max_candles.setValue(cfg.max_candles)

        self._imbalance_ratio.setValue(cfg.imbalance_ratio)
        self._stacked_min.setValue(cfg.stacked_imbalance_min)
        self._abs_min_vol.setValue(cfg.absorption_min_volume)
        self._abs_delta_ratio.setValue(cfg.absorption_max_delta_ratio)
        self._va_pct.setValue(cfg.value_area_pct)

        self._visible_candles.setValue(cfg.visible_candles)
        self._cell_width.setValue(cfg.cell_width)
        self._cell_height.setValue(cfg.cell_height)
        self._cvd_window.setValue(cfg.cvd_window)

    def _apply(self):
        update_config(
            symbol                    = self._symbol.text().strip(),
            feed_mode                 = self._feed_mode.currentText(),
            ws_url                    = self._ws_url.text().strip(),
            rest_url                  = self._rest_url.text().strip(),
            mock_tick_hz              = self._mock_hz.value(),
            timeframe_seconds         = self._timeframe.currentData(),
            tick_size                 = self._tick_size.value(),
            max_candles               = self._max_candles.value(),
            imbalance_ratio           = self._imbalance_ratio.value(),
            stacked_imbalance_min     = self._stacked_min.value(),
            absorption_min_volume     = self._abs_min_vol.value(),
            absorption_max_delta_ratio= self._abs_delta_ratio.value(),
            value_area_pct            = self._va_pct.value(),
            visible_candles           = self._visible_candles.value(),
            cell_width                = self._cell_width.value(),
            cell_height               = self._cell_height.value(),
            cvd_window                = self._cvd_window.value(),
        )
        self.settings_changed.emit()

    def _ok(self):
        self._apply()
        self.accept()
