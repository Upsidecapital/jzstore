@echo off
setlocal enabledelayedexpansion
title Upside Orderflow — Build EXE

echo.
echo  ============================================================
echo   Upside Orderflow  ^|  Electron EXE Builder
echo  ============================================================
echo.

:: ---- 1. Check Node.js ----
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo  Download from https://nodejs.org  ^(LTS version^)
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js  %NODE_VER%  found.

:: ---- 2. Check npm ----
npm --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] npm not found. Reinstall Node.js.
    pause & exit /b 1
)

:: ---- 3. Download vendor JS files (React + Babel) if missing ----
echo.
echo  Checking vendor JS files...

if not exist vendor mkdir vendor

if not exist vendor\react.development.js (
    echo  Downloading React 18...
    curl -L --fail -o vendor\react.development.js ^
        "https://unpkg.com/react@18.3.1/umd/react.development.js"
    if errorlevel 1 (
        echo  [WARN] curl failed. Trying PowerShell...
        powershell -Command "Invoke-WebRequest 'https://unpkg.com/react@18.3.1/umd/react.development.js' -OutFile 'vendor\react.development.js'"
    )
)

if not exist vendor\react-dom.development.js (
    echo  Downloading React DOM 18...
    curl -L --fail -o vendor\react-dom.development.js ^
        "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"
    if errorlevel 1 (
        powershell -Command "Invoke-WebRequest 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js' -OutFile 'vendor\react-dom.development.js'"
    )
)

if not exist vendor\babel.min.js (
    echo  Downloading Babel Standalone...
    curl -L --fail -o vendor\babel.min.js ^
        "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
    if errorlevel 1 (
        powershell -Command "Invoke-WebRequest 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js' -OutFile 'vendor\babel.min.js'"
    )
)

echo  Vendor files OK.

:: ---- 4. npm install ----
echo.
echo  Installing npm dependencies...
call npm install
if errorlevel 1 (
    echo  [ERROR] npm install failed.
    pause & exit /b 1
)

:: ---- 5. Build EXE ----
echo.
echo  Building Windows EXE (this takes 1-3 minutes)...
call npm run dist
if errorlevel 1 (
    echo  [ERROR] Build failed. Check output above.
    pause & exit /b 1
)

:: ---- 6. Done ----
echo.
echo  ============================================================
echo   BUILD COMPLETE!
echo.
echo   Installer: dist\Upside Orderflow Setup*.exe
echo   Portable:  dist\win-unpacked\Upside Orderflow.exe
echo  ============================================================
echo.

:: Open the dist folder
explorer dist 2>nul

pause
