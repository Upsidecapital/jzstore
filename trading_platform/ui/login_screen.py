"""
Login / License Gate Screen
============================
Shown at startup if no valid saved session is found.
Supports two auth methods (tabs):
  1. Username + Password
  2. License Key

On success emits `login_success(UserSession)` and closes itself.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QPixmap, QPainter, QColor, QLinearGradient
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QTabWidget, QWidget,
    QFormLayout, QFrame, QSizePolicy, QMessageBox,
    QCheckBox, QSpacerItem,
)

from ..license_manager import UserSession, validate_credentials, validate_license
from .theme import color, hex_color


# ── Logo banner ───────────────────────────────────────────────────────────────

class _LogoBanner(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(90)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        grad = QLinearGradient(0, 0, self.width(), self.height())
        grad.setColorAt(0.0, QColor(hex_color("buy_dark")))
        grad.setColorAt(1.0, QColor(hex_color("bg_deepest")))
        p.fillRect(self.rect(), grad)

        p.setPen(color("buy"))
        f = QFont("Consolas", 22, QFont.Weight.Bold)
        f.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 4)
        p.setFont(f)
        p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "UPSIDE ANALYTICS")

        p.setPen(color("text_secondary"))
        sub = QFont("Segoe UI", 9)
        p.setFont(sub)
        p.drawText(
            self.rect().adjusted(0, 46, 0, 0),
            Qt.AlignmentFlag.AlignCenter,
            "Professional Order Flow & Volume Analytics",
        )
        p.end()


# ── Credentials tab ───────────────────────────────────────────────────────────

class _CredTab(QWidget):
    submitted = Signal(str, str)   # username, password

    def __init__(self):
        super().__init__()
        layout = QFormLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        self._user = QLineEdit()
        self._user.setPlaceholderText("trader")
        layout.addRow("Username", self._user)

        self._pass = QLineEdit()
        self._pass.setPlaceholderText("••••••••")
        self._pass.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addRow("Password", self._pass)

        self._show = QCheckBox("Show password")
        self._show.toggled.connect(
            lambda on: self._pass.setEchoMode(
                QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password
            )
        )
        layout.addRow("", self._show)

        btn = QPushButton("Sign In")
        btn.setObjectName("primary")
        btn.clicked.connect(self._submit)
        self._pass.returnPressed.connect(self._submit)
        layout.addRow("", btn)

        hint = QLabel("Demo: trader / trade2024")
        hint.setObjectName("sub")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addRow(hint)

    def _submit(self):
        self.submitted.emit(self._user.text().strip(), self._pass.text())


# ── License key tab ───────────────────────────────────────────────────────────

class _KeyTab(QWidget):
    submitted = Signal(str)   # key

    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        lbl = QLabel("Enter your license key:")
        layout.addWidget(lbl)

        self._key = QLineEdit()
        self._key.setPlaceholderText("JZST-XXXX-XXXX-XXXX-XXXX")
        font = QFont("Consolas", 12)
        self._key.setFont(font)
        self._key.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._key)

        btn = QPushButton("Activate License")
        btn.setObjectName("primary")
        btn.clicked.connect(self._submit)
        self._key.returnPressed.connect(self._submit)
        layout.addWidget(btn)

        hint = QLabel("Demo key: JZST-PRO1-FULL-ACCS-2024")
        hint.setObjectName("sub")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(hint)

        layout.addStretch()

    def _submit(self):
        self.submitted.emit(self._key.text().strip())


# ── Main dialog ───────────────────────────────────────────────────────────────

class LoginScreen(QDialog):
    """
    Modal login / license dialog.
    Emits `login_success(UserSession)` on successful auth and auto-closes.
    """

    login_success = Signal(object)   # UserSession

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Upside Analytics — Sign In")
        self.setFixedSize(420, 480)
        self.setWindowFlags(
            Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self._build_ui()

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Card frame
        card = QFrame()
        card.setObjectName("card")
        card.setStyleSheet(f"""
            QFrame#card {{
                background-color: {hex_color('bg_panel')};
                border: 1px solid {hex_color('border')};
                border-radius: 10px;
            }}
        """)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(0, 0, 0, 20)
        card_layout.setSpacing(0)

        # Logo
        card_layout.addWidget(_LogoBanner())

        # Divider
        div = QFrame()
        div.setFrameShape(QFrame.Shape.HLine)
        div.setStyleSheet(f"background:{hex_color('border')};")
        div.setFixedHeight(1)
        card_layout.addWidget(div)

        # Tabs
        tabs = QTabWidget()
        tabs.setStyleSheet(f"""
            QTabWidget::pane {{
                border: none;
                background: {hex_color('bg_panel')};
            }}
            QTabBar::tab {{
                background: {hex_color('bg_deepest')};
                color: {hex_color('text_secondary')};
                border: none;
                padding: 10px 24px;
                font-size: 11px;
            }}
            QTabBar::tab:selected {{
                background: {hex_color('bg_panel')};
                color: {hex_color('buy')};
                border-bottom: 2px solid {hex_color('buy')};
            }}
        """)

        cred_tab = _CredTab()
        cred_tab.submitted.connect(self._on_credentials)
        tabs.addTab(cred_tab, "Sign In")

        key_tab = _KeyTab()
        key_tab.submitted.connect(self._on_license_key)
        tabs.addTab(key_tab, "License Key")

        card_layout.addWidget(tabs)

        # Version footer
        ver = QLabel("v1.0.0  •  © 2024 Upside Capital")
        ver.setObjectName("sub")
        ver.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(ver)

        root.addWidget(card)

    # ── Auth handlers ─────────────────────────────────────────────────────────

    def _on_credentials(self, username: str, password: str) -> None:
        ok, msg, session = validate_credentials(username, password)
        self._handle_result(ok, msg, session)

    def _on_license_key(self, key: str) -> None:
        ok, msg, session = validate_license(key)
        self._handle_result(ok, msg, session)

    def _handle_result(self, ok: bool, msg: str, session) -> None:
        if ok and session:
            self.login_success.emit(session)
            self.accept()
        else:
            box = QMessageBox(self)
            box.setWindowTitle("Authentication Failed")
            box.setText(msg)
            box.setIcon(QMessageBox.Icon.Warning)
            box.exec()
