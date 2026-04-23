#!/usr/bin/env python3
"""
iPhone Mac Dock — macOS Server
Run on your Mac; open the printed URL on your iPhone (same Wi-Fi).
"""
import base64
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from flask_socketio import SocketIO, emit

IS_MACOS = sys.platform == "darwin"

app = Flask(__name__, static_folder="dock_ui")
app.config["SECRET_KEY"] = "mac-dock-2025"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Lazy-import pyautogui (macOS only; needs Accessibility permission)
_mouse = None
def _get_mouse():
    global _mouse
    if _mouse is None and IS_MACOS:
        try:
            import pyautogui
            pyautogui.FAILSAFE = False
            _mouse = pyautogui
        except ImportError:
            pass
    return _mouse


# ── AppleScript ───────────────────────────────────────────────────────────────

def _osa(script: str) -> tuple[str, str]:
    if not IS_MACOS:
        return "", "not macOS"
    r = subprocess.run(["osascript", "-e", script],
                       capture_output=True, text=True, timeout=5)
    return r.stdout.strip(), r.stderr.strip()


def get_running_apps() -> list[str]:
    out, _ = _osa(
        'tell application "System Events" to '
        'get name of every process where background only is false'
    )
    return [a.strip() for a in out.split(", ") if a.strip()] if out else []


def get_installed_apps() -> list[str]:
    apps: list[str] = []
    for base in ("/Applications", "/System/Applications"):
        p = Path(base)
        if p.exists():
            apps.extend(a.stem for a in p.glob("*.app"))
    return sorted(set(apps))


def launch_app(name: str) -> bool:
    _, err = _osa(f'tell application "{name}" to activate')
    return not err


def get_volume() -> int:
    out, _ = _osa("output volume of (get volume settings)")
    try:
        return int(out)
    except ValueError:
        return 50


def set_volume(level: int) -> None:
    _osa(f"set volume output volume {max(0, min(100, int(level)))}")


def media_key(action: str) -> None:
    # key codes: F7=98 prev, F8=100 play/pause, F9=101 next
    codes = {"prev": 98, "play": 100, "next": 101}
    code = codes.get(action)
    if code:
        _osa(f'tell application "System Events" to key code {code}')


def get_app_icon_b64(app_name: str) -> str | None:
    """Return base64-PNG of the app icon (macOS only, uses sips)."""
    if not IS_MACOS:
        return None
    app_path: Path | None = None
    for base in ("/Applications", "/System/Applications"):
        p = Path(base) / f"{app_name}.app"
        if p.exists():
            app_path = p
            break
    if not app_path:
        return None
    plist_path = app_path / "Contents" / "Info.plist"
    if not plist_path.exists():
        return None
    try:
        import plistlib
        with open(plist_path, "rb") as f:
            plist = plistlib.load(f)
        icon_name = plist.get("CFBundleIconFile", "")
        if not icon_name.endswith(".icns"):
            icon_name += ".icns"
        icns = app_path / "Contents" / "Resources" / icon_name
        if not icns.exists():
            return None
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name
        r = subprocess.run(
            ["sips", "-s", "format", "png", "-z", "96", "96",
             str(icns), "--out", tmp_path],
            capture_output=True, timeout=5
        )
        if r.returncode == 0 and Path(tmp_path).exists():
            with open(tmp_path, "rb") as f:
                png = f.read()
            os.unlink(tmp_path)
            return base64.b64encode(png).decode()
    except Exception:
        pass
    return None


def get_notifications() -> list[dict]:
    """Best-effort read from macOS notification DB (needs Full Disk Access)."""
    db = Path.home() / (
        "Library/Group Containers/"
        "group.com.apple.usernamenotificationsd.migration.context/"
        "Library/Application Support/com.apple.notificationcenter/db2/db"
    )
    if not db.exists():
        return []
    try:
        r = subprocess.run(
            ["sqlite3", str(db),
             "SELECT app_id, uuid FROM record ORDER BY delivered_date DESC LIMIT 20"],
            capture_output=True, text=True, timeout=3
        )
        rows = []
        for line in r.stdout.splitlines():
            parts = line.split("|")
            if len(parts) >= 2:
                rows.append({"app": parts[0], "id": parts[1]})
        return rows
    except Exception:
        return []


# ── HTTP routes ───────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("dock_ui", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("dock_ui", path)


@app.route("/api/apps")
def api_apps():
    return jsonify({
        "running": get_running_apps(),
        "installed": get_installed_apps(),
    })


@app.route("/api/icon/<path:app_name>")
def api_icon(app_name):
    icon = get_app_icon_b64(app_name)
    if icon:
        return jsonify({"icon": icon})
    return jsonify({"icon": None}), 404


@app.route("/api/system")
def api_system():
    return jsonify({"volume": get_volume()})


@app.route("/api/notifications")
def api_notifications():
    return jsonify({"notifications": get_notifications()})


# ── WebSocket events ──────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    emit("connected", {"version": "1.0"})
    emit("system_state", {"volume": get_volume()})


@socketio.on("launch_app")
def on_launch(data):
    name = data.get("app", "")
    ok = launch_app(name)
    emit("feedback", {"action": "launch", "app": name, "ok": ok})


@socketio.on("mouse_move")
def on_mouse_move(data):
    m = _get_mouse()
    if not m:
        return
    dx, dy = float(data.get("dx", 0)), float(data.get("dy", 0))
    x, y = m.position()
    w, h = m.size()
    m.moveTo(max(0, min(w - 1, x + dx)), max(0, min(h - 1, y + dy)), duration=0)


@socketio.on("mouse_click")
def on_click(data):
    m = _get_mouse()
    if not m:
        return
    btn = data.get("button", "left")
    if data.get("double"):
        m.doubleClick(button=btn)
    else:
        m.click(button=btn)


@socketio.on("mouse_scroll")
def on_scroll(data):
    m = _get_mouse()
    if not m:
        return
    m.scroll(int(data.get("clicks", 3)))


@socketio.on("set_volume")
def on_volume(data):
    level = int(data.get("level", 50))
    set_volume(level)
    socketio.emit("system_state", {"volume": level})


@socketio.on("media")
def on_media(data):
    media_key(data.get("action", "play"))


@socketio.on("key_combo")
def on_key_combo(data):
    """e.g. {"keys": ["command", "c"]}"""
    m = _get_mouse()
    if not m:
        return
    keys = data.get("keys", [])
    if keys:
        m.hotkey(*keys)


# ── Entry point ───────────────────────────────────────────────────────────────

def _local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    port = int(os.environ.get("DOCK_PORT", 8765))
    ip = _local_ip()
    url = f"http://{ip}:{port}"

    print("\n" + "─" * 48)
    print("  📱  iPhone Mac Dock  ·  v1.0")
    print("─" * 48)
    print(f"  Open this URL on your iPhone:")
    print(f"  ➜  {url}")
    print(f"\n  (Mac and iPhone must be on the same Wi-Fi)")
    print("─" * 48)

    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make()
        print()
        qr.print_ascii(tty=True)
    except ImportError:
        pass

    print()
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
