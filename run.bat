@echo off
title JZ Analytics — Running
color 0A
echo.
echo  Starting JZ Analytics Platform...
echo.
python -m trading_platform.main
if errorlevel 1 (
    echo.
    echo  [ERROR] App crashed. Check output above for details.
    pause
)
