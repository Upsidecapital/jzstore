"""
Dark trading-platform theme for PySide6.
Provides:
  - apply_dark_theme(app)  — sets the global QApplication stylesheet
  - color(key)             — returns a QColor from the palette
  - hex_color(key)         — returns the hex string
  - make_font(size, bold)  — returns a monospace QFont suitable for chart labels
"""

from __future__ import annotations

from PySide6.QtGui import QColor, QFont, QPalette
from PySide6.QtWidgets import QApplication

from ..config import PALETTE


# ── Helpers ───────────────────────────────────────────────────────────────────

def color(key: str, alpha: int = 255) -> QColor:
    c = QColor(PALETTE[key])
    c.setAlpha(alpha)
    return c


def hex_color(key: str) -> str:
    return PALETTE[key]


def make_font(size: int = 9, bold: bool = False, family: str = "Consolas") -> QFont:
    f = QFont(family, size)
    f.setBold(bold)
    f.setHintingPreference(QFont.HintingPreference.PreferFullHinting)
    return f


# ── Global stylesheet ─────────────────────────────────────────────────────────

_QSS = """
/* ── Base ─────────────────────────────────────── */
QWidget {{
    background-color: {bg_deepest};
    color: {text_primary};
    font-family: "Segoe UI", "Inter", "Helvetica Neue", sans-serif;
    font-size: 11px;
}}

QMainWindow {{
    background-color: {bg_deepest};
}}

/* ── Toolbar ───────────────────────────────────── */
QToolBar {{
    background-color: {bg_header};
    border-bottom: 1px solid {border};
    spacing: 6px;
    padding: 4px 8px;
}}

QToolButton {{
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 4px 10px;
    color: {text_primary};
}}
QToolButton:hover {{
    background-color: {bg_panel};
    border-color: {border};
}}
QToolButton:pressed {{
    background-color: {bg_cell};
}}
QToolButton:checked {{
    background-color: {bg_panel};
    border-color: {buy};
    color: {buy};
}}

/* ── Buttons ───────────────────────────────────── */
QPushButton {{
    background-color: {bg_panel};
    border: 1px solid {border};
    border-radius: 5px;
    padding: 6px 16px;
    color: {text_primary};
    font-weight: 500;
}}
QPushButton:hover {{
    border-color: {buy};
    color: {buy};
}}
QPushButton:pressed {{
    background-color: {buy_dark};
}}
QPushButton#primary {{
    background-color: {buy};
    border-color: {buy};
    color: #000000;
    font-weight: 700;
}}
QPushButton#primary:hover {{
    background-color: {buy_light};
}}
QPushButton#danger {{
    background-color: {sell_dark};
    border-color: {sell};
    color: {sell_light};
}}

/* ── Line edits ────────────────────────────────── */
QLineEdit {{
    background-color: {bg_cell};
    border: 1px solid {border};
    border-radius: 4px;
    padding: 6px 10px;
    color: {text_primary};
    selection-background-color: {buy_dark};
}}
QLineEdit:focus {{
    border-color: {buy};
}}

/* ── Combo boxes ───────────────────────────────── */
QComboBox {{
    background-color: {bg_cell};
    border: 1px solid {border};
    border-radius: 4px;
    padding: 4px 10px;
    color: {text_primary};
    min-width: 80px;
}}
QComboBox::drop-down {{ border: none; width: 20px; }}
QComboBox QAbstractItemView {{
    background-color: {bg_panel};
    border: 1px solid {border};
    selection-background-color: {buy_dark};
}}

/* ── Spin boxes ────────────────────────────────── */
QDoubleSpinBox, QSpinBox {{
    background-color: {bg_cell};
    border: 1px solid {border};
    border-radius: 4px;
    padding: 4px 8px;
    color: {text_primary};
}}

/* ── Labels ────────────────────────────────────── */
QLabel {{
    background: transparent;
    color: {text_primary};
}}
QLabel#header {{
    font-size: 13px;
    font-weight: 700;
    color: {text_primary};
    letter-spacing: 2px;
}}
QLabel#sub {{
    color: {text_secondary};
    font-size: 10px;
}}

/* ── Scroll bars ───────────────────────────────── */
QScrollBar:vertical {{
    background: {bg_deepest};
    width: 8px;
    margin: 0;
}}
QScrollBar::handle:vertical {{
    background: {border};
    border-radius: 4px;
    min-height: 20px;
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
QScrollBar:horizontal {{
    background: {bg_deepest};
    height: 8px;
}}
QScrollBar::handle:horizontal {{
    background: {border};
    border-radius: 4px;
}}

/* ── Splitters ─────────────────────────────────── */
QSplitter::handle {{
    background-color: {border};
}}
QSplitter::handle:horizontal {{ width: 1px; }}
QSplitter::handle:vertical   {{ height: 1px; }}

/* ── Status bar ────────────────────────────────── */
QStatusBar {{
    background-color: {bg_header};
    border-top: 1px solid {border};
    color: {text_secondary};
    font-size: 10px;
}}

/* ── Dialogs ───────────────────────────────────── */
QDialog {{
    background-color: {bg_panel};
    border: 1px solid {border};
}}

/* ── Group boxes ───────────────────────────────── */
QGroupBox {{
    border: 1px solid {border};
    border-radius: 6px;
    margin-top: 10px;
    padding-top: 6px;
    font-weight: 600;
    color: {text_secondary};
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 4px;
}}

/* ── Check boxes ───────────────────────────────── */
QCheckBox {{
    spacing: 6px;
    color: {text_primary};
}}
QCheckBox::indicator {{
    width: 14px;
    height: 14px;
    border: 1px solid {border};
    border-radius: 3px;
    background: {bg_cell};
}}
QCheckBox::indicator:checked {{
    background-color: {buy};
    border-color: {buy};
}}
""".format(**PALETTE)


def apply_dark_theme(app: QApplication) -> None:
    """Apply the full dark palette and stylesheet to the QApplication."""
    app.setStyleSheet(_QSS)

    pal = QPalette()
    pal.setColor(QPalette.ColorRole.Window,          QColor(PALETTE["bg_deepest"]))
    pal.setColor(QPalette.ColorRole.WindowText,      QColor(PALETTE["text_primary"]))
    pal.setColor(QPalette.ColorRole.Base,            QColor(PALETTE["bg_panel"]))
    pal.setColor(QPalette.ColorRole.AlternateBase,   QColor(PALETTE["bg_cell"]))
    pal.setColor(QPalette.ColorRole.ToolTipBase,     QColor(PALETTE["bg_header"]))
    pal.setColor(QPalette.ColorRole.ToolTipText,     QColor(PALETTE["text_primary"]))
    pal.setColor(QPalette.ColorRole.Text,            QColor(PALETTE["text_primary"]))
    pal.setColor(QPalette.ColorRole.Button,          QColor(PALETTE["bg_panel"]))
    pal.setColor(QPalette.ColorRole.ButtonText,      QColor(PALETTE["text_primary"]))
    pal.setColor(QPalette.ColorRole.BrightText,      QColor(PALETTE["buy_light"]))
    pal.setColor(QPalette.ColorRole.Highlight,       QColor(PALETTE["buy_dark"]))
    pal.setColor(QPalette.ColorRole.HighlightedText, QColor(PALETTE["text_primary"]))
    app.setPalette(pal)
