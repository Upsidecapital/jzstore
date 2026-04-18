@echo off
title JZ Analytics — Setup
color 0A
echo.
echo  ============================================================
echo   JZ ANALYTICS — DEPENDENCY INSTALLER
echo  ============================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Download from https://python.org
    pause
    exit /b 1
)
python --version

echo.
echo  [1/3] Upgrading pip...
python -m pip install --upgrade pip --quiet

echo  [2/3] Installing core dependencies...
python -m pip install PySide6>=6.6.0 numpy>=1.26.0 --quiet
if errorlevel 1 (
    echo  [ERROR] Failed to install core dependencies.
    pause
    exit /b 1
)

echo  [3/3] Installing packaging tools...
python -m pip install pyinstaller>=6.0.0 --quiet

echo.
echo  ============================================================
echo   Setup complete! Run the app with:   run.bat
echo   Build the EXE with:                 build_exe.bat
echo  ============================================================
echo.
pause
