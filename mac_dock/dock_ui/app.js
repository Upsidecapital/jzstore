"use strict";

// ── App emoji / colour fallbacks ──────────────────────────────
const APP_EMOJI = {
  "Calculator": "🔢", "Messages": "💬", "Mail": "✉️", "Safari": "🌐",
  "Photos": "🖼", "Music": "🎵", "FaceTime": "📹", "Calendar": "📅",
  "Notes": "📝", "Reminders": "✅", "Maps": "🗺", "App Store": "🛍",
  "System Preferences": "⚙️", "System Settings": "⚙️", "Terminal": "⌨️",
  "Finder": "🗂", "Xcode": "🔨", "Final Cut Pro": "🎬", "Logic Pro": "🎼",
  "Keynote": "📊", "Pages": "📄", "Numbers": "📑", "Slack": "💼",
  "Zoom": "📹", "WhatsApp": "💚", "Spotify": "🎵", "Claude": "🤖",
  "ChatGPT": "🤖", "Code": "📝", "TextEdit": "📝", "Preview": "👁",
  "QuickTime Player": "▶️", "News": "📰", "Podcasts": "🎙",
  "Contacts": "👤", "Clock": "⏰", "Weather": "🌤", "Stocks": "📈",
  "Craft": "📒", "Notion": "📓", "Figma": "🎨", "Sketch": "✏️",
  "Photoshop": "🎨", "Illustrator": "🖊", "Premiere Pro": "🎞",
  "After Effects": "✨", "VLC": "📽", "IINA": "▶️",
};

function appColor(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 ^ name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(145deg, hsl(${hue},65%,38%), hsl(${(hue+35)%360},75%,22%))`;
}

// ── Icon cache ────────────────────────────────────────────────
const iconCache = {};

async function fetchIcon(name) {
  if (iconCache[name] !== undefined) return iconCache[name];
  iconCache[name] = null; // mark fetching
  try {
    const r = await fetch(`/api/icon/${encodeURIComponent(name)}`);
    if (r.ok) {
      const j = await r.json();
      if (j.icon) { iconCache[name] = j.icon; return j.icon; }
    }
  } catch (_) {}
  return null;
}

function makeIconEl(name, size = 78, radius = 20) {
  const el = document.createElement("div");
  el.className = "app-icon";
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:${radius}px;background:${appColor(name)}`;
  const emoji = APP_EMOJI[name];
  if (emoji) {
    el.textContent = emoji;
  } else {
    el.textContent = name.charAt(0).toUpperCase();
    el.style.fontSize = `${size * 0.42}px`;
    el.style.color = "rgba(255,255,255,0.85)";
    el.style.fontWeight = "700";
  }
  // Lazy-load real icon
  fetchIcon(name).then(b64 => {
    if (b64) {
      const img = document.createElement("img");
      img.src = `data:image/png;base64,${b64}`;
      img.style.borderRadius = `${radius}px`;
      el.textContent = "";
      el.style.background = "";
      el.appendChild(img);
    }
  });
  return el;
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 1800) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), duration);
}

// ── Socket.IO ─────────────────────────────────────────────────
const socket = io({ transports: ["websocket", "polling"] });
const dot   = document.getElementById("conn-dot");
const label = document.getElementById("conn-label");

socket.on("connect", () => {
  dot.className = "online";
  label.textContent = "Connected";
});
socket.on("disconnect", () => {
  dot.className = "offline";
  label.textContent = "Disconnected";
});
socket.on("connect_error", () => {
  dot.className = "offline";
  label.textContent = "Connection error";
});
socket.on("connected", data => {
  console.log("Mac Dock server v" + data.version);
});
socket.on("system_state", data => {
  if (data.volume !== undefined) {
    document.getElementById("vol-slider").value = data.volume;
    document.getElementById("vol-val").textContent = data.volume;
  }
});
socket.on("feedback", data => {
  if (data.action === "launch") {
    showToast(data.ok ? `Opened ${data.app}` : `Failed: ${data.app}`);
  }
});

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll(".tb-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.tab;
    document.querySelectorAll(".tb-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${id}`).classList.add("active");
    if (id === "notifs") loadNotifications();
  });
});

// ── Apps tab ──────────────────────────────────────────────────
let allApps    = [];
let runningApps = [];

async function loadApps() {
  try {
    const r = await fetch("/api/apps");
    const j = await r.json();
    allApps     = j.installed || [];
    runningApps = j.running  || [];
    renderRunning();
    renderGrid(allApps);
  } catch (e) {
    // Demo mode — show placeholder apps
    allApps = [
      "Safari","Messages","Mail","Calendar","Notes","Reminders",
      "Photos","Music","FaceTime","Maps","App Store","Finder",
      "Terminal","Xcode","Slack","Spotify","WhatsApp","Zoom",
      "Final Cut Pro","Logic Pro","Keynote","Pages","Numbers",
    ];
    runningApps = ["Safari","Messages","Finder"];
    renderRunning();
    renderGrid(allApps);
    showToast("⚡ Demo mode — run server on Mac", 3000);
  }
}

function renderRunning() {
  const strip = document.getElementById("running-strip");
  strip.innerHTML = "";
  const pinned = document.getElementById("pinned-row");
  if (!runningApps.length) { pinned.style.display = "none"; return; }
  pinned.style.display = "";
  runningApps.forEach(name => {
    const chip = document.createElement("div");
    chip.className = "running-chip";

    const iconWrap = document.createElement("div");
    iconWrap.className = "rc-icon";
    const emoji = APP_EMOJI[name];
    if (emoji) {
      iconWrap.textContent = emoji;
    } else {
      iconWrap.textContent = name.charAt(0);
      iconWrap.style.background = appColor(name);
      iconWrap.style.color = "white";
      iconWrap.style.fontSize = "13px";
      iconWrap.style.fontWeight = "700";
    }
    // lazy real icon
    fetchIcon(name).then(b64 => {
      if (b64) {
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${b64}`;
        iconWrap.textContent = "";
        iconWrap.appendChild(img);
      }
    });

    chip.appendChild(iconWrap);
    chip.appendChild(document.createTextNode(name));
    chip.addEventListener("click", () => launchApp(name));
    strip.appendChild(chip);
  });
}

function renderGrid(apps) {
  const grid = document.getElementById("app-grid");
  grid.innerHTML = "";
  apps.forEach((name, i) => {
    const cell  = document.createElement("div");
    cell.className = "app-cell";
    cell.style.animationDelay = `${Math.min(i * 0.03, 0.5)}s`;

    const icon = makeIconEl(name);
    const lbl  = document.createElement("div");
    lbl.className = "app-label";
    lbl.textContent = name;

    cell.appendChild(icon);
    cell.appendChild(lbl);
    cell.addEventListener("click", () => launchApp(name));
    grid.appendChild(cell);
  });
}

function launchApp(name) {
  socket.emit("launch_app", { app: name });
  showToast(`Opening ${name}…`);
}

// Search filter
document.getElementById("search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  renderGrid(q ? allApps.filter(a => a.toLowerCase().includes(q)) : allApps);
});

// ── Trackpad ──────────────────────────────────────────────────
(function initTrackpad() {
  const pad = document.getElementById("trackpad");
  const hint = document.getElementById("pad-hint");
  let lastX = 0, lastY = 0;
  let touchStartX = 0, touchStartY = 0;
  let touchStartTime = 0;
  let moved = false;
  let longPressTimer;
  const SENS = 1.8; // movement sensitivity multiplier

  pad.addEventListener("touchstart", e => {
    e.preventDefault();
    const t = e.touches[0];
    lastX = t.clientX; lastY = t.clientY;
    touchStartX = t.clientX; touchStartY = t.clientY;
    touchStartTime = Date.now();
    moved = false;
    hint.classList.add("hidden");

    // Long-press → right click
    longPressTimer = setTimeout(() => {
      if (!moved) {
        socket.emit("mouse_click", { button: "right" });
        showToast("Right-click");
        navigator.vibrate && navigator.vibrate(30);
      }
    }, 600);
  }, { passive: false });

  pad.addEventListener("touchmove", e => {
    e.preventDefault();
    clearTimeout(longPressTimer);

    if (e.touches.length === 2) {
      // Two-finger scroll
      const avg = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const delta = (lastY - avg);
      if (Math.abs(delta) > 1) {
        socket.emit("mouse_scroll", { clicks: Math.round(delta / 6) });
        lastY = avg;
      }
      return;
    }

    const t = e.touches[0];
    const dx = (t.clientX - lastX) * SENS;
    const dy = (t.clientY - lastY) * SENS;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      socket.emit("mouse_move", { dx: Math.round(dx), dy: Math.round(dy) });
      moved = true;
    }
    lastX = t.clientX; lastY = t.clientY;
  }, { passive: false });

  pad.addEventListener("touchend", e => {
    e.preventDefault();
    clearTimeout(longPressTimer);
    const elapsed = Date.now() - touchStartTime;
    const dist = Math.hypot(
      e.changedTouches[0].clientX - touchStartX,
      e.changedTouches[0].clientY - touchStartY
    );
    // Tap: short time + small movement
    if (elapsed < 250 && dist < 8 && !moved) {
      socket.emit("mouse_click", { button: "left" });
    }
  }, { passive: false });

  document.getElementById("btn-left").addEventListener("click", () => {
    socket.emit("mouse_click", { button: "left" });
  });
  document.getElementById("btn-dbl").addEventListener("click", () => {
    socket.emit("mouse_click", { button: "left", double: true });
  });
  document.getElementById("btn-right").addEventListener("click", () => {
    socket.emit("mouse_click", { button: "right" });
  });
})();

// ── Controls tab ──────────────────────────────────────────────
const volSlider = document.getElementById("vol-slider");
const volVal    = document.getElementById("vol-val");

volSlider.addEventListener("input", () => {
  volVal.textContent = volSlider.value;
});
volSlider.addEventListener("change", () => {
  socket.emit("set_volume", { level: parseInt(volSlider.value, 10) });
});

document.querySelectorAll(".media-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    socket.emit("media", { action: btn.dataset.action });
    showToast({ prev: "⏮ Prev", play: "⏯ Play/Pause", next: "⏭ Next" }[btn.dataset.action] || "");
  });
});

document.querySelectorAll(".sc-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const keys = JSON.parse(btn.dataset.keys);
    socket.emit("key_combo", { keys });
    showToast(btn.textContent.trim());
  });
});

// ── Notifications tab ────────────────────────────────────────
async function loadNotifications() {
  const list = document.getElementById("notif-list");
  list.innerHTML = '<div class="notif-empty">Loading…</div>';
  try {
    const r = await fetch("/api/notifications");
    const j = await r.json();
    const notifs = j.notifications || [];
    if (!notifs.length) {
      list.innerHTML = `<div class="notif-empty">
        No notifications found.<br>
        <span class="notif-note">Grant Full Disk Access to Terminal in<br>System Settings → Privacy & Security</span>
      </div>`;
      return;
    }
    list.innerHTML = "";
    notifs.forEach(n => {
      const item = document.createElement("div");
      item.className = "notif-item";
      const iconWrap = document.createElement("div");
      iconWrap.className = "notif-app-icon";
      iconWrap.textContent = APP_EMOJI[n.app] || n.app.charAt(0);
      fetchIcon(n.app).then(b64 => {
        if (b64) {
          const img = document.createElement("img");
          img.src = `data:image/png;base64,${b64}`;
          iconWrap.textContent = "";
          iconWrap.appendChild(img);
        }
      });
      const text = document.createElement("div");
      text.className = "notif-text";
      text.innerHTML = `<div class="notif-app-name">${n.app}</div>
                        <div class="notif-body">${n.id || "Notification"}</div>`;
      item.appendChild(iconWrap);
      item.appendChild(text);
      list.appendChild(item);
    });
  } catch (_) {
    list.innerHTML = '<div class="notif-empty">Could not load notifications.<br><span class="notif-note">Make sure the server is running on Mac.</span></div>';
  }
}
document.getElementById("notif-refresh").addEventListener("click", loadNotifications);

// ── Boot ──────────────────────────────────────────────────────
loadApps();
