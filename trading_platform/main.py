"""
Entry Point
===========
  1. Initialise Qt application with dark theme
  2. Check for a saved session (skip login if valid)
  3. Show login screen if needed
  4. Launch the main trading window

Usage
-----
  python -m trading_platform.main           # run from repo root
  python trading_platform/main.py           # direct

Packaging
---------
  See trading_platform.spec for PyInstaller configuration.
  Build: pyinstaller trading_platform.spec
"""

from __future__ import annotations

import sys
import os

# Ensure the repo root is on sys.path when running directly
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QMessageBox

from trading_platform.license_manager import UserSession, load_saved_session
from trading_platform.ui.theme import apply_dark_theme
from trading_platform.ui.login_screen import LoginScreen
from trading_platform.ui_main import MainWindow


def _show_login(app: QApplication) -> "UserSession | None":
    """Show the login dialog and return a UserSession, or None if cancelled."""
    dlg     = LoginScreen()
    result  = [None]

    def on_success(session: UserSession):
        result[0] = session

    dlg.login_success.connect(on_success)
    dlg.exec()
    return result[0]


def main() -> int:
    # ── High-DPI support ─────────────────────────────────────────────────────
    os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")

    app = QApplication(sys.argv)
    app.setApplicationName("JZ Analytics")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("JZ Store")

    apply_dark_theme(app)

    # ── Auth gate ─────────────────────────────────────────────────────────────
    session = load_saved_session()

    if session is None:
        session = _show_login(app)

    if session is None:
        # User cancelled login
        return 0

    # ── Launch main window ────────────────────────────────────────────────────
    win = MainWindow(session)
    win.show()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
