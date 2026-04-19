@echo off
setlocal enabledelayedexpansion

:: Always run from the electron-app directory (works whether double-clicked or run from CLI)
cd /d "%~dp0"

title Upside Orderflow — Build EXE
echo.
echo  ============================================================
echo   Upside Orderflow  ^|  Electron EXE Builder
echo  ============================================================
echo.
echo  Working directory: %CD%
echo.

:: ---- 1. Check Node.js ----
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo.
    echo  Download and install Node.js LTS from:
    echo    https://nodejs.org
    echo.
    echo  Then re-run this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found.

:: ---- 2. Check npm ----
npm --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] npm not found. Reinstall Node.js.
    echo.
    pause
    exit /b 1
)
echo  [OK] npm found.

:: ---- 3. Download vendor JS files using PowerShell (more reliable than curl on Windows) ----
echo.
echo  Checking vendor JS files...
if not exist vendor mkdir vendor

if not exist vendor\react.development.js (
    echo  Downloading React 18...
    powershell -NoProfile -Command "try { Invoke-WebRequest 'https://unpkg.com/react@18.3.1/umd/react.development.js' -OutFile 'vendor\react.development.js' -UseBasicParsing; Write-Host '[OK] React downloaded' } catch { Write-Host '[ERROR]' $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo  [ERROR] Failed to download React. Check your internet connection.
        pause
        exit /b 1
    )
)

if not exist vendor\react-dom.development.js (
    echo  Downloading React DOM 18...
    powershell -NoProfile -Command "try { Invoke-WebRequest 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js' -OutFile 'vendor\react-dom.development.js' -UseBasicParsing; Write-Host '[OK] React DOM downloaded' } catch { Write-Host '[ERROR]' $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo  [ERROR] Failed to download React DOM. Check your internet connection.
        pause
        exit /b 1
    )
)

if not exist vendor\babel.min.js (
    echo  Downloading Babel Standalone ^(large file ~1MB, please wait^)...
    powershell -NoProfile -Command "try { Invoke-WebRequest 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js' -OutFile 'vendor\babel.min.js' -UseBasicParsing; Write-Host '[OK] Babel downloaded' } catch { Write-Host '[ERROR]' $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo  [ERROR] Failed to download Babel. Check your internet connection.
        pause
        exit /b 1
    )
)

echo  [OK] All vendor files present.

:: ---- 4. npm install ----
echo.
echo  Installing npm dependencies ^(Electron download is ~100MB, first run only^)...
echo  This may take several minutes...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Common fixes:
    echo    - Check internet connection
    echo    - Try: npm cache clean --force   then re-run
    echo    - Try running as Administrator
    echo.
    pause
    exit /b 1
)
echo.
echo  [OK] Dependencies installed.

:: ---- 5. Build EXE ----
echo.
echo  Building Windows installer EXE ^(1-3 minutes^)...
echo.
call npm run dist
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Common fixes:
    echo    - Delete node_modules\ and re-run
    echo    - Make sure you are NOT running from inside node_modules\
    echo    - Check the error message above for details
    echo.
    pause
    exit /b 1
)

:: ---- 6. Done ----
echo.
echo  ============================================================
echo   BUILD COMPLETE!
echo.
echo   Installer : dist\Upside Orderflow Setup 1.0.0.exe
echo   Portable  : dist\win-unpacked\Upside Orderflow.exe
echo  ============================================================
echo.

:: Open dist folder in Explorer
if exist dist (
    start explorer dist
)

pause
