# Upside Orderflow — CLAUDE.md

## What this project is

A professional trading analytics desktop application for orderflow analysis. It displays footprint charts, cumulative volume delta (CVD), volume profile, DOM ladder, time & sales, blotter, positions, P&L, news, and alerts — all in a dark-themed, TradingView-inspired UI.

There are **two implementations** in this repo:

| Implementation | Location | Status |
|---|---|---|
| **Electron EXE** (primary) | `electron-app/` | Active — ship this |
| Python/PySide6 (legacy) | `trading_platform/` | Old, do not develop further |

---

## Electron app — primary deliverable

### Directory layout

```
electron-app/
  electron/
    main.js          # Electron main process — creates BrowserWindow, IPC
    preload.js       # contextBridge: exposes electronAPI (min/max/close) to renderer
  src/
    index.html       # Entry point — loads CDN vendor scripts, inlines TWEAKS config
    styles.css       # All CSS: design tokens, dark/light themes, grid layout
    data.jsx         # Synthetic data: genCandles(), buildVolumeProfile(), WATCHLIST, BLOTTER, NEWS, ALERTS
    icons.jsx        # 30+ inline SVG icons as React components
    chart.jsx        # FootprintChart (canvas) + CvdChart (canvas)
    panels.jsx       # LeftNav, LeftRail, RightRail, BottomPanel and sub-panels
    tweaks.jsx       # TweaksPanel UI + useTweaks() hook (theme/accent/density persistence)
    app.jsx          # Root App component + WinControls (Electron window buttons)
  build_electron.bat # Windows: downloads vendor JS, npm install, builds EXE
  run_dev.bat        # Windows: quick dev preview (no EXE build)
  package.json       # Electron + electron-builder config
  vendor/            # Downloaded at build time: react.development.js, react-dom.development.js, babel.min.js
```

### How to build the EXE (Windows)

**Prerequisites:** Install [Node.js LTS](https://nodejs.org) — one time only.

```bat
cd electron-app
build_electron.bat
```

The script:
1. Downloads React 18 + Babel Standalone into `vendor/` via PowerShell
2. Runs `npm install` (downloads Electron ~100 MB, first run only)
3. Runs `electron-builder --win` → produces `dist\Upside Orderflow Setup 1.0.0.exe`

### How to run in dev mode (no EXE build)

```bat
cd electron-app
run_dev.bat
```

Requires vendor files already downloaded (run `build_electron.bat` first, or just do `npm install` manually).

### Architecture decisions

**Why JSX files are separate, not bundled:** The app uses `@babel/standalone` loaded from CDN (same as the original design) so no webpack/bundler is needed. Babel processes `<script type="text/babel">` tags directly in the browser.

**Important:** Babel standalone cannot load external JSX files via XHR on Electron's `file://` protocol. If the app shows a blank screen, consolidate all JSX into inline `<script type="text/babel">` blocks inside `index.html` (no `src=` attribute).

**Window controls:** The titlebar is frameless (`frame: false` in main.js). Minimize/maximize/close buttons in `app.jsx` → `WinControls` component → `window.electronAPI` (exposed via preload.js contextBridge) → IPC → main process.

**Theme system:** CSS custom properties (`--bg-0..4`, `--bid`, `--ask`, etc.) on `<html>`. `useTweaks()` hook sets `data-theme`, `data-font`, `data-density` attributes and `--accent` CSS var. Dark/light toggle, 6 accent colours, 3 density modes, 2 font modes.

**Chart rendering:** Pure HTML5 Canvas — no charting library. `FootprintChart` draws bid/ask heatmap cells, aggression bubbles (radial gradient glow, Deepcharts style), wicks, last-price dashes. `CvdChart` draws cumulative delta line + gradient fill + volume bars.

**Data:** All synthetic/deterministic via Mulberry32 PRNG seeded by symbol name. No live feed connected yet.

---

## Python legacy app (do not modify)

Located in `trading_platform/`. PySide6 desktop app with:
- Custom QPainter footprint chart, CVD panel, volume profile widget
- Real live data via Binance WebSocket (free), Polygon.io ($29/mo), OANDA (free with account)
- License/login system with HMAC key validation
- PyInstaller packaging via `build_exe.bat`

To run: `run.bat` (requires Python 3.11+, PySide6, numpy)
To build EXE: `build_exe.bat`

Config lives in `trading_platform/config.py` — symbols, feed modes, API keys.

---

## Key files to know

| File | Purpose |
|---|---|
| `electron-app/electron/main.js` | Window creation, IPC handlers for min/max/close |
| `electron-app/src/app.jsx` | Root layout — titlebar, toolbar, all panels wired together |
| `electron-app/src/chart.jsx` | Footprint + CVD canvas renderers |
| `electron-app/src/data.jsx` | All synthetic data generators and static datasets |
| `electron-app/src/styles.css` | Design tokens — edit this to change colours/spacing |
| `electron-app/src/tweaks.jsx` | `useTweaks()` hook — state for theme, accent, panels |
| `trading_platform/config.py` | Live feed symbols and API key config |
| `trading_platform/data_engine.py` | Binance/Polygon/OANDA WebSocket feed implementations |

---

## Common tasks

**Change accent colour default:** Edit `window.TWEAKS` in `electron-app/src/index.html`

**Add a new symbol to watchlist:** Edit `WATCHLIST` array in `electron-app/src/data.jsx`

**Change window default size:** Edit `width`/`height` in `electron-app/electron/main.js`

**Connect real live data to Electron app:** Add a WebSocket in `electron/main.js` main process, send price ticks via `mainWindow.webContents.send('tick', data)`, receive in preload/renderer via `ipcRenderer.on('tick', ...)`

**Build fails — icon error:** The `package.json` intentionally has no icon configured. Do not add `"icon"` to the win/nsis config without creating the `.ico` file first.

**Blank white window on launch:** Babel can't load external JSX over `file://`. Inline all JSX content directly into `<script type="text/babel">` blocks in `index.html` (remove `src=` attributes).

---

## Branch

Active development branch: `claude/trading-analytics-platform-0hEro`
