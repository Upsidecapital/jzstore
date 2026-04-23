#!/usr/bin/env bash
# ── iPhone Mac Dock — quick-start ────────────────────────────
# 1. pip install -r requirements.txt
# 2. Run this script on your Mac
# 3. Open the printed URL on your iPhone (same Wi-Fi)
#
# First-time macOS permissions needed:
#   • System Settings → Privacy → Accessibility  → allow Terminal
#   • System Settings → Privacy → Screen Recording → allow Terminal (for pyautogui)
#   • System Settings → Privacy → Full Disk Access → allow Terminal (for notifications)
# ─────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

# Install deps if missing
if ! python3 -c "import flask_socketio" &>/dev/null; then
  echo "Installing Python dependencies…"
  pip3 install -r requirements.txt
fi

python3 server.py
