"""
Entry Point — Upside Analytics Trading Platform
============================================
Startup sequence:
  1. Qt app + dark theme
  2. Splash screen (2 s)
  3. Check for saved session → skip login if valid
  4. Login / license gate
  5. Main trading window
"""

from __future__ import annotations

import sys
import os
import time

# Ensure the repo root is on sys.path when run directly or via PyInstaller
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPainter, QColor, QLinearGradient, QFont
from PySide6.QtWidgets import (
    QApplication, QSplashScreen, QMessageBox,
)

from trading_platform.license_manager import UserSession, load_saved_session
from trading_platform.ui.theme import apply_dark_theme
from trading_platform.ui.login_screen import LoginScreen
from trading_platform.ui_main import MainWindow


# ── Splash screen ─────────────────────────────────────────────────────────────

class _Splash(QSplashScreen):
    """Custom dark splash screen shown during startup."""

    def __init__(self):
        from PySide6.QtGui import QPixmap
        px = QPixmap(520, 300)
        px.fill(QColor("#080a0e"))
        super().__init__(px, Qt.WindowType.WindowStaysOnTopHint)
        self.setWindowFlag(Qt.WindowType.FramelessWindowHint)

    def drawContents(self, painter: QPainter):
        W, H = self.width(), self.height()

        # Gradient background
        grad = QLinearGradient(0, 0, W, H)
        grad.setColorAt(0.0, QColor("#080a0e"))
        grad.setColorAt(1.0, QColor("#0d1117"))
        painter.fillRect(0, 0, W, H, grad)

        # Green accent line at top
        painter.fillRect(0, 0, W, 3, QColor("#00c896"))

        # Title
        f = QFont("Consolas", 28, QFont.Weight.Bold)
        f.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 5)
        painter.setFont(f)
        painter.setPen(QColor("#00c896"))
        painter.drawText(0, 0, W, H - 60, Qt.AlignmentFlag.AlignCenter, "UPSIDE ANALYTICS")

        # Subtitle
        f2 = QFont("Segoe UI", 11)
        painter.setFont(f2)
        painter.setPen(QColor("#556270"))
        painter.drawText(0, 70, W, H - 20, Qt.AlignmentFlag.AlignCenter,
                         "Professional Order Flow  &  Volume Analytics")

        # Version
        f3 = QFont("Consolas", 8)
        painter.setFont(f3)
        painter.setPen(QColor("#2e3a4a"))
        painter.drawText(0, H - 24, W - 10, 20,
                         Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
                         "v1.0.0  —  © 2024 Upside Capital")

        # Loading message (uses Qt's built-in message system)
        msg = self.message()
        if msg:
            f4 = QFont("Segoe UI", 9)
            painter.setFont(f4)
            painter.setPen(QColor("#00c896"))
            painter.drawText(10, H - 24, W - 20, 20,
                             Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                             msg)


# ── Login helper ───────────────────────────────────────────────────────────────

def _show_login(app: QApplication) -> "UserSession | None":
    dlg    = LoginScreen()
    result = [None]

    def on_success(session: UserSession):
        result[0] = session

    dlg.login_success.connect(on_success)
    dlg.exec()
    return result[0]


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")

    app = QApplication(sys.argv)
    app.setApplicationName("Upside Analytics")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("Upside Capital")

    apply_dark_theme(app)

    # ── Splash ────────────────────────────────────────────────────────────────
    splash = _Splash()
    splash.show()
    splash.showMessage("Initialising…")
    app.processEvents()
    time.sleep(0.6)

    splash.showMessage("Loading engines…")
    app.processEvents()
    time.sleep(0.5)

    # ── Auth gate ─────────────────────────────────────────────────────────────
    splash.showMessage("Checking session…")
    app.processEvents()
    session = load_saved_session()

    splash.finish(None)   # close splash before login dialog

    if session is None:
        session = _show_login(app)

    if session is None:
        return 0   # user cancelled login

    # ── Launch ────────────────────────────────────────────────────────────────
    win = MainWindow(session)
    win.show()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
