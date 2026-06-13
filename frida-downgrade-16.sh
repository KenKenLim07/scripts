#!/usr/bin/env bash
# Downgrade PC Frida to 16.1.4 (stable on Dopamine rootless)
set -euo pipefail

FRIDA_VER="16.1.4"
TOOLS_VER="12.3.0"
VENV="${FRIDA_VENV:-$HOME/frida-env}"

echo "[*] Downgrading PC Frida to ${FRIDA_VER} in ${VENV}"

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"

pip install -q "frida==${FRIDA_VER}" "frida-tools==${TOOLS_VER}"

echo "[*] PC versions now:"
frida --version
frida-ps --version 2>/dev/null || true

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  NOW downgrade frida-server ON THE IPHONE (must match PC)    ║
╚══════════════════════════════════════════════════════════════╝

Run as root on iPhone (su root — NOT as mobile):

  ssh mobile@YOUR_IP
  su root

  export PATH=/var/jb/usr/bin:/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin
  PLIST=/var/jb/Library/LaunchDaemons/re.frida.server.plist
  launchctl unload "$PLIST" 2>/dev/null || true

  cd /tmp
  wget -O frida_16.1.4_iphoneos-arm64.deb \\
    https://github.com/frida/frida/releases/download/16.1.4/frida_16.1.4_iphoneos-arm64.deb
  dpkg -i frida_16.1.4_iphoneos-arm64.deb

  launchctl load "$PLIST"
  /var/jb/usr/sbin/frida-server --version

  (must print 16.1.4 — if still 17.9.1 you are not root)

  Or run: ~/dev/scripts/frida-downgrade-iphone.sh  for full steps

Back on PC:
  frida-trident.sh --stop
  frida-doctor.sh
  frida-trident.sh --attach-test

EOF
