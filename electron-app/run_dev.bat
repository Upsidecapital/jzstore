@echo off
title Upside Orderflow — Dev Preview
echo.
echo  Starting Upside Orderflow (dev mode)...
echo  Close this window or press Ctrl+C to quit.
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Run build_electron.bat first.
    pause & exit /b 1
)

if not exist node_modules (
    echo  Installing dependencies...
    call npm install
)

if not exist vendor\react.development.js (
    echo  [ERROR] vendor/ files missing. Run build_electron.bat first to download them.
    pause & exit /b 1
)

npx electron .
