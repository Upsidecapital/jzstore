#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  iPhone Mac Dock — iOS App Setup
#  Run this script once on your Mac to build the Xcode project.
#
#  Prerequisites:
#    • macOS with Xcode installed (free from the App Store)
#    • Node.js 18+  →  https://nodejs.org
#    • Apple Developer account ($99/yr) to sign & submit
# ═══════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}▶${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
die()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo -e "\n${BOLD}  📱  iPhone Mac Dock — iOS Setup${NC}"
echo "  ───────────────────────────────────"

# ── 1. Check dependencies ────────────────────────────────────
log "Checking dependencies…"

command -v node >/dev/null 2>&1 || die "Node.js is not installed. Get it at https://nodejs.org"
command -v npm  >/dev/null 2>&1 || die "npm is not installed (comes with Node.js)."
command -v xcodebuild >/dev/null 2>&1 || die "Xcode is not installed. Install it from the Mac App Store."

NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
[[ "$NODE_VER" -lt 18 ]] && die "Node.js 18+ required (found v$(node -v)). Update at https://nodejs.org"

ok "Node $(node -v), npm $(npm -v), Xcode $(xcodebuild -version | head -1 | awk '{print $2}')"

# ── 2. Install npm packages ──────────────────────────────────
log "Installing npm packages…"
npm install --silent
ok "npm packages installed"

# ── 3. Add iOS platform (skip if already added) ──────────────
if [[ ! -d "ios" ]]; then
  log "Adding iOS platform via Capacitor…"
  npx cap add ios
  ok "iOS platform added"
else
  ok "iOS platform already present — skipping"
fi

# ── 4. Install the Bonjour native plugin ─────────────────────
PLUGIN_SRC="ios-plugin"
PLUGIN_DST="ios/App/App/Plugins/BonjourPlugin"

log "Installing native Bonjour plugin…"
mkdir -p "$PLUGIN_DST"
cp "$PLUGIN_SRC/BonjourPlugin.swift" "$PLUGIN_DST/"
cp "$PLUGIN_SRC/BonjourPlugin.m"     "$PLUGIN_DST/"
ok "Plugin files copied to $PLUGIN_DST"

# ── 5. Patch Info.plist with local-network permissions ───────
PLIST="ios/App/App/Info.plist"
log "Patching Info.plist with local-network permissions…"

if grep -q "NSLocalNetworkUsageDescription" "$PLIST" 2>/dev/null; then
  ok "Info.plist already patched — skipping"
else
  # Insert before the closing </dict> of the top-level dict
  ADDITIONS='
	<key>NSLocalNetworkUsageDescription</key>
	<string>Mac Dock uses your local Wi-Fi network to find and connect to the Mac Dock server running on your Mac.</string>
	<key>NSBonjourServices</key>
	<array>
		<string>_macdock._tcp</string>
	</array>'

  # Use Python to safely edit the plist (avoids sed/awk escaping issues)
  python3 - "$PLIST" "$ADDITIONS" <<'PYEOF'
import sys, re
path, additions = sys.argv[1], sys.argv[2]
content = open(path).read()
# Insert before the last </dict></plist>
new_content = re.sub(r'(</dict>\s*</plist>)', additions + r'\n\1', content, count=1)
open(path, 'w').write(new_content)
PYEOF
  ok "Info.plist patched"
fi

# ── 6. Register plugin in AppDelegate ────────────────────────
APPDELEGATE="ios/App/App/AppDelegate.swift"
log "Registering BonjourPlugin in AppDelegate…"

if grep -q "BonjourPlugin" "$APPDELEGATE" 2>/dev/null; then
  ok "AppDelegate already registers BonjourPlugin — skipping"
else
  # Capacitor auto-registers plugins found in the Plugins/ folder when using
  # the .m bridge file, so no manual AppDelegate change is needed.
  ok "Plugin is auto-registered via Capacitor bridge (.m file)"
fi

# ── 7. Sync web assets into the iOS project ──────────────────
log "Syncing web assets…"
npx cap sync ios
ok "Web assets synced"

# ── 8. Open in Xcode ─────────────────────────────────────────
echo ""
echo -e "${BOLD}  Setup complete!${NC}"
echo "  ─────────────────────────────────────────────────────"
echo "  Next steps in Xcode:"
echo ""
echo "  1. In the Project Navigator, right-click App → App → Plugins,"
echo "     choose 'Add Files', and select:"
echo "     mac_dock_ios/ios/App/App/Plugins/BonjourPlugin/"
echo "     (Make sure 'Add to target: App' is checked)"
echo ""
echo "  2. Select the 'App' target → Signing & Capabilities"
echo "     → set your Team (Apple Developer account)."
echo ""
echo "  3. Connect your iPhone, select it as the run target, hit ▶"
echo ""
echo "  For App Store submission:"
echo "    Product → Archive → Distribute App → App Store Connect"
echo "  ─────────────────────────────────────────────────────"

# Open Xcode
npx cap open ios
