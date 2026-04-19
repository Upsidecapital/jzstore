@echo off
cd /d "%~dp0"
title Upside Orderflow — Dev Preview
echo.
echo  ============================================================
echo   Upside Orderflow  ^|  Dev Preview
echo  ============================================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo  node_modules not found. Running npm install first...
    call npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

if not exist vendor\react.development.js (
    echo  [ERROR] vendor\ files missing.
    echo  Run build_electron.bat first to download them.
    echo.
    pause
    exit /b 1
)

echo  Starting Upside Orderflow...
echo  Close this window or press Ctrl+C to quit.
echo.
npx electron .
