# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for JZ Analytics Trading Platform
===================================================
Build (Windows):
    pyinstaller trading_platform.spec

Output:
    dist/JZAnalytics/JZAnalytics.exe   (one-folder mode — faster startup)
    dist/JZAnalytics.exe               (one-file mode — use --onefile flag)

To build a single .exe:
    pyinstaller --clean --onefile trading_platform.spec
"""

import sys
from pathlib import Path

ROOT = Path(SPECPATH)         # repo root

block_cipher = None

a = Analysis(
    [str(ROOT / "trading_platform" / "main.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        # Include any future assets (icons, fonts) here:
        # (str(ROOT / "trading_platform" / "assets"), "assets"),
    ],
    hiddenimports=[
        # PySide6 modules that PyInstaller may miss
        "PySide6.QtCore",
        "PySide6.QtGui",
        "PySide6.QtWidgets",
        "PySide6.QtNetwork",
        # Standard library
        "asyncio",
        "threading",
        "json",
        "hashlib",
        "hmac",
        # Optional feed dependencies
        "websockets",
        "aiohttp",
        # Our own package
        "trading_platform",
        "trading_platform.config",
        "trading_platform.license_manager",
        "trading_platform.data_engine",
        "trading_platform.aggregation_engine",
        "trading_platform.footprint_engine",
        "trading_platform.volume_profile",
        "trading_platform.ui_main",
        "trading_platform.ui.theme",
        "trading_platform.ui.login_screen",
        "trading_platform.ui.settings_dialog",
        "trading_platform.ui.footprint_chart",
        "trading_platform.ui.volume_profile_widget",
        "trading_platform.ui.cvd_panel",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "matplotlib",
        "tkinter",
        "test",
        "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="JZAnalytics",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,              # no console window (GUI app)
    icon=None,                  # replace with: str(ROOT / "assets" / "icon.ico")
    version=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="JZAnalytics",
)
