@echo off
title JZ Analytics — Build EXE
color 0A
echo.
echo  ============================================================
echo   JZ ANALYTICS — WINDOWS EXE BUILDER
echo  ============================================================
echo.

:: Ensure we are in the right directory (repo root)
if not exist "trading_platform\main.py" (
    echo  [ERROR] Run this script from the jzstore folder.
    echo          It must be in the same folder as the trading_platform\ directory.
    pause
    exit /b 1
)

:: Clean previous build
echo  [1/4] Cleaning previous build...
if exist "build"  rmdir /s /q build
if exist "dist"   rmdir /s /q dist

:: Install deps if needed
echo  [2/4] Checking dependencies...
python -m pip install PySide6 numpy pyinstaller --quiet

:: Build
echo  [3/4] Building EXE (this takes 2-4 minutes)...
echo.

pyinstaller ^
    --noconfirm ^
    --windowed ^
    --onedir ^
    --name "JZAnalytics" ^
    --collect-all PySide6 ^
    --hidden-import numpy ^
    --hidden-import trading_platform ^
    --hidden-import trading_platform.config ^
    --hidden-import trading_platform.license_manager ^
    --hidden-import trading_platform.data_engine ^
    --hidden-import trading_platform.aggregation_engine ^
    --hidden-import trading_platform.footprint_engine ^
    --hidden-import trading_platform.volume_profile ^
    --hidden-import trading_platform.ui_main ^
    --hidden-import trading_platform.ui.theme ^
    --hidden-import trading_platform.ui.login_screen ^
    --hidden-import trading_platform.ui.settings_dialog ^
    --hidden-import trading_platform.ui.footprint_chart ^
    --hidden-import trading_platform.ui.volume_profile_widget ^
    --hidden-import trading_platform.ui.cvd_panel ^
    trading_platform\main.py

if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. See output above.
    pause
    exit /b 1
)

echo.
echo  [4/4] Build complete!
echo.
echo  ============================================================
echo   EXE location:  dist\JZAnalytics\JZAnalytics.exe
echo   Share the entire  dist\JZAnalytics\  folder with customers.
echo  ============================================================
echo.
explorer dist\JZAnalytics
pause
