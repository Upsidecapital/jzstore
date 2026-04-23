"use strict";

// ── Environment detection ─────────────────────────────────────
// IS_CAP = true when running inside the native Capacitor iOS app.
// In the browser (opened via Safari from the Mac), SERVER is the
// page origin and socket.io connects automatically.
const IS_CAP = !!(window.Capacitor?.isNativePlatform?.());
let SERVER = IS_CAP ? "" : window.location.origin;
let socket = null;

// ── App emoji / colour fallbacks ──────────────────────────────
const APP_EMOJI = {
  "Calculator":"🔢","Messages":"💬","Mail":"✉️","Safari":"🌐",
  "Photos":"🖼","Music":"🎵","FaceTime":"📹","Calendar":"📅",
  "Notes":"📝","Reminders":"✅","Maps":"🗺","App Store":"🛍",
  "System Preferences":"⚙️","System Settings":"⚙️","Terminal":"⌨️",
  "Finder":"🗂","Xcode":"🔨","Final Cut Pro":"🎬","Logic Pro":"🎼",
  "Keynote":"📊","Pages":"📄","Numbers":"📑","Slack":"💼",
  "Zoom":"📹","WhatsApp":"💚","Spotify":"🎵","Claude":"🤖",
  "ChatGPT":"🤖","Code":"📝","TextEdit":"📝","Preview":"👁",
  "QuickTime Player":"▶️","News":"📰","Podcasts":"🎙",
  "Contacts":"👤","Clock":"⏰","Weather":"🌤","Stocks":"📈",
  "Craft":"📒","Notion":"📓","Figma":"🎨","Sketch":"✏️",
};

function appColor(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 ^ name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(145deg,hsl(${hue},65%,38%),hsl(${(hue+35)%360},75%,22%))`;
}

// ── Icon cache ────────────────────────────────────────────────
const iconCache = {};
async function fetchIcon(name) {
  if (iconCache[name] !== undefined) return iconCache[name];
  iconCache[name] = null;
  try {
    const r = await fetch(`${SERVER}/api/icon/${encodeURIComponent(name)}`);
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

// ── Discovery screen helpers ──────────────────────────────────
const discScreen  = document.getElementById("disc-screen");
const discStatus  = document.getElementById("disc-status");
const discSpinner = document.getElementById("disc-spinner");
const discManual  = document.getElementById("disc-manual");
const discError   = document.getElementById("disc-error");

function setDiscStatus(msg) {
  discStatus.textContent = msg;
}
function showManualEntry(note = "") {
  discSpinner.classList.add("hidden");
  if (note) document.getElementById("disc-manual-note").textContent = note;
  discManual.style.display = "flex";
}
function hideDiscovery() {
  discScreen.classList.add("hidden");
}

// ── Connection helpers ────────────────────────────────────────
async function testConnection(url) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${url}/api/system`, { signal: ctrl.signal });
    clearTimeout(tid);
    return r.ok;
  } catch (_) {
    return false;
  }
}

// Use the native Capacitor Bonjour plugin to find the Mac on LAN.
async function discoverBonjour() {
  if (!IS_CAP) return null;
  try {
    const { Bonjour } = window.Capacitor.Plugins;
    setDiscStatus("Scanning Wi-Fi for your Mac…");
    const res = await Bonjour.discover();
    const svcs = res?.services ?? [];
    if (svcs.length > 0) {
      const s = svcs[0];
      return `http://${s.host}:${s.port}`;
    }
  } catch (e) {
    console.warn("Bonjour discovery error:", e);
  }
  return null;
}

// ── Socket.IO connection ──────────────────────────────────────
function buildSocket(serverUrl) {
  const opts = { transports: ["websocket", "polling"] };
  return serverUrl ? io(serverUrl, opts) : io(opts);
}

function attachSocketHandlers(sock) {
  const dot   = document.getElementById("conn-dot");
  const label = document.getElementById("conn-label");

  sock.on("connect", () => {
    dot.className = "online";
    label.textContent = "Connected";
  });
  sock.on("disconnect", () => {
    dot.className = "offline";
    label.textContent = "Disconnected";
  });
  sock.on("connect_error", () => {
    dot.className = "offline";
    label.textContent = "Connection error";
  });
  sock.on("connected", d => console.log("Mac Dock server v" + d.version));
  sock.on("system_state", d => {
    if (d.volume !== undefined) {
      document.getElementById("vol-slider").value = d.volume;
      document.getElementById("vol-val").textContent = d.volume;
    }
  });
  sock.on("feedback", d => {
    if (d.action === "launch") {
      showToast(d.ok ? `Opened ${d.app}` : `Failed: ${d.app}`);
    }
  });
}

function connectAndGo(url) {
  SERVER = url || window.location.origin;
  if (url) localStorage.setItem("mac_dock_server", url);
  hideDiscovery();
  socket = buildSocket(url || null);
  attachSocketHandlers(socket);
  loadApps();
}

// ── Initialisation & discovery flow ──────────────────────────
async function init() {
  if (!IS_CAP) {
    // Browser served by Flask — connect straight away.
    connectAndGo(null);
    return;
  }

  // Native app: try saved URL first (instant reconnect on relaunch).
  const saved = localStorage.getItem("mac_dock_server");
  if (saved) {
    setDiscStatus("Reconnecting to your Mac…");
    if (await testConnection(saved)) {
      connectAndGo(saved);
      return;
    }
  }

  // Try Bonjour auto-discovery.
  const discovered = await discoverBonjour();
  if (discovered) {
    setDiscStatus("Found your Mac! Connecting…");
    if (await testConnection(discovered)) {
      connectAndGo(discovered);
      return;
    }
  }

  // Nothing worked — ask the user for the IP manually.
  setDiscStatus("Couldn't find your Mac automatically.");
  showManualEntry("Enter your Mac's local IP address:");
}

// Manual connect button
document.getElementById("disc-connect-btn").addEventListener("click", async () => {
  const ip   = document.getElementById("disc-ip").value.trim();
  const port = document.getElementById("disc-port").value.trim() || "8765";
  if (!ip) { discError.textContent = "Please enter an IP address."; return; }
  const url = `http://${ip}:${port}`;
  discError.textContent = "";
  setDiscStatus("Connecting…");
  discManual.style.display = "none";
  discSpinner.classList.remove("hidden");
  if (await testConnection(url)) {
    connectAndGo(url);
  } else {
    discSpinner.classList.add("hidden");
    discManual.style.display = "flex";
    discError.textContent = "Connection failed. Check the IP and that the server is running.";
    setDiscStatus("Could not connect.");
  }
});

// ⇄ button in header — forget saved server and re-run discovery
document.getElementById("disconnect-btn").addEventListener("click", () => {
  localStorage.removeItem("mac_dock_server");
  if (socket) { socket.disconnect(); socket = null; }
  discScreen.classList.remove("hidden");
  discSpinner.classList.remove("hidden");
  discManual.style.display = "none";
  discError.textContent = "";
  setDiscStatus("Searching for your Mac…");
  init();
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
let allApps = [], runningApps = [];

async function loadApps() {
  try {
    const j = await (await fetch(`${SERVER}/api/apps`)).json();
    allApps     = j.installed || [];
    runningApps = j.running   || [];
  } catch (_) {
    allApps = [
      "Safari","Messages","Mail","Calendar","Notes","Reminders",
      "Photos","Music","FaceTime","Maps","App Store","Finder",
      "Terminal","Xcode","Slack","Spotify","WhatsApp","Zoom",
      "Final Cut Pro","Logic Pro","Keynote","Pages","Numbers","Craft",
    ];
    runningApps = ["Safari","Messages","Finder"];
    showToast("Demo mode — server not reachable", 3000);
  }
  renderRunning();
  renderGrid(allApps);
}

function renderRunning() {
  const strip  = document.getElementById("running-strip");
  const pinned = document.getElementById("pinned-row");
  strip.innerHTML = "";
  if (!runningApps.length) { pinned.style.display = "none"; return; }
  pinned.style.display = "";
  runningApps.forEach(name => {
    const chip = document.createElement("div");
    chip.className = "running-chip";
    const iw = document.createElement("div");
    iw.className = "rc-icon";
    const em = APP_EMOJI[name];
    if (em) { iw.textContent = em; }
    else {
      iw.textContent = name.charAt(0);
      iw.style.cssText = `background:${appColor(name)};color:#fff;font-size:13px;font-weight:700`;
    }
    fetchIcon(name).then(b64 => {
      if (b64) {
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${b64}`;
        iw.textContent = "";
        iw.appendChild(img);
      }
    });
    chip.appendChild(iw);
    chip.appendChild(document.createTextNode(name));
    chip.addEventListener("click", () => launchApp(name));
    strip.appendChild(chip);
  });
}

function renderGrid(apps) {
  const grid = document.getElementById("app-grid");
  grid.innerHTML = "";
  apps.forEach((name, i) => {
    const cell = document.createElement("div");
    cell.className = "app-cell";
    cell.style.animationDelay = `${Math.min(i * 0.03, 0.5)}s`;
    cell.appendChild(makeIconEl(name));
    const lbl = document.createElement("div");
    lbl.className = "app-label";
    lbl.textContent = name;
    cell.appendChild(lbl);
    cell.addEventListener("click", () => launchApp(name));
    grid.appendChild(cell);
  });
}

function launchApp(name) {
  if (socket) socket.emit("launch_app", { app: name });
  showToast(`Opening ${name}…`);
}

document.getElementById("search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  renderGrid(q ? allApps.filter(a => a.toLowerCase().includes(q)) : allApps);
});

// ── Trackpad ──────────────────────────────────────────────────
(function initTrackpad() {
  const pad  = document.getElementById("trackpad");
  const hint = document.getElementById("pad-hint");
  let lastX = 0, lastY = 0, startX = 0, startY = 0, startTime = 0;
  let moved = false, longPressTimer;
  const SENS = 1.8;

  pad.addEventListener("touchstart", e => {
    e.preventDefault();
    const t = e.touches[0];
    lastX = startX = t.clientX;
    lastY = startY = t.clientY;
    startTime = Date.now();
    moved = false;
    hint.classList.add("hidden");
    longPressTimer = setTimeout(() => {
      if (!moved && socket) {
        socket.emit("mouse_click", { button: "right" });
        showToast("Right-click");
        navigator.vibrate?.([20]);
      }
    }, 600);
  }, { passive: false });

  pad.addEventListener("touchmove", e => {
    e.preventDefault();
    clearTimeout(longPressTimer);
    if (e.touches.length === 2) {
      const avg = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const delta = lastY - avg;
      if (Math.abs(delta) > 1 && socket) {
        socket.emit("mouse_scroll", { clicks: Math.round(delta / 6) });
        lastY = avg;
      }
      return;
    }
    const t = e.touches[0];
    const dx = (t.clientX - lastX) * SENS;
    const dy = (t.clientY - lastY) * SENS;
    if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && socket) {
      socket.emit("mouse_move", { dx: Math.round(dx), dy: Math.round(dy) });
      moved = true;
    }
    lastX = t.clientX; lastY = t.clientY;
  }, { passive: false });

  pad.addEventListener("touchend", e => {
    e.preventDefault();
    clearTimeout(longPressTimer);
    const elapsed = Date.now() - startTime;
    const dist = Math.hypot(
      e.changedTouches[0].clientX - startX,
      e.changedTouches[0].clientY - startY
    );
    if (elapsed < 250 && dist < 8 && !moved && socket) {
      socket.emit("mouse_click", { button: "left" });
    }
  }, { passive: false });

  document.getElementById("btn-left").addEventListener("click",
    () => socket?.emit("mouse_click", { button: "left" }));
  document.getElementById("btn-dbl").addEventListener("click",
    () => socket?.emit("mouse_click", { button: "left", double: true }));
  document.getElementById("btn-right").addEventListener("click",
    () => socket?.emit("mouse_click", { button: "right" }));
})();

// ── Controls tab ──────────────────────────────────────────────
const volSlider = document.getElementById("vol-slider");
const volVal    = document.getElementById("vol-val");

volSlider.addEventListener("input", () => { volVal.textContent = volSlider.value; });
volSlider.addEventListener("change", () => {
  socket?.emit("set_volume", { level: parseInt(volSlider.value, 10) });
});

document.querySelectorAll(".media-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    socket?.emit("media", { action: btn.dataset.action });
    showToast({ prev: "⏮ Previous", play: "⏯ Play / Pause", next: "⏭ Next" }[btn.dataset.action] || "");
  });
});

document.querySelectorAll(".sc-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const keys = JSON.parse(btn.dataset.keys);
    socket?.emit("key_combo", { keys });
    showToast(btn.textContent.trim());
  });
});

// ── Notifications tab ─────────────────────────────────────────
async function loadNotifications() {
  const list = document.getElementById("notif-list");
  list.innerHTML = '<div class="notif-empty">Loading…</div>';
  try {
    const j = await (await fetch(`${SERVER}/api/notifications`)).json();
    const notifs = j.notifications || [];
    if (!notifs.length) {
      list.innerHTML = `<div class="notif-empty">
        No notifications found.<br>
        <span class="notif-note">Grant Full Disk Access to Terminal in<br>
        System Settings → Privacy &amp; Security</span></div>`;
      return;
    }
    list.innerHTML = "";
    notifs.forEach(n => {
      const item = document.createElement("div");
      item.className = "notif-item";
      const iw = document.createElement("div");
      iw.className = "notif-app-icon";
      iw.textContent = APP_EMOJI[n.app] || n.app.charAt(0);
      fetchIcon(n.app).then(b64 => {
        if (b64) {
          const img = document.createElement("img");
          img.src = `data:image/png;base64,${b64}`;
          iw.textContent = "";
          iw.appendChild(img);
        }
      });
      const tx = document.createElement("div");
      tx.className = "notif-text";
      tx.innerHTML = `<div class="notif-app-name">${n.app}</div>
                      <div class="notif-body">${n.id || "Notification"}</div>`;
      item.appendChild(iw);
      item.appendChild(tx);
      list.appendChild(item);
    });
  } catch (_) {
    list.innerHTML = `<div class="notif-empty">Could not load notifications.<br>
      <span class="notif-note">Make sure the server is running on Mac.</span></div>`;
  }
}
document.getElementById("notif-refresh").addEventListener("click", loadNotifications);

// ── Boot ──────────────────────────────────────────────────────
init();
