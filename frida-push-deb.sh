#!/usr/bin/env bash
# Download Frida .deb on PC and copy to iPhone /tmp/
set -euo pipefail

FRIDA_VER="${1:-16.1.4}"
DEB="frida_${FRIDA_VER}_iphoneos-arm64.deb"
URL="https://github.com/frida/frida/releases/download/${FRIDA_VER}/${DEB}"
CACHE="${HOME}/.cache/frida-debs"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frida/config/frida.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

HOST="${FRIDA_IPHONE_HOST:-192.168.254.133}"
USER="${FRIDA_IPHONE_USER:-mobile}"
PASS="${FRIDA_SSH_PASS:-}"

mkdir -p "$CACHE"
LOCAL="${CACHE}/${DEB}"

if [[ ! -f "$LOCAL" ]]; then
  echo "[*] Downloading ${URL}"
  if command -v curl &>/dev/null; then
    curl -fL -o "$LOCAL" "$URL"
  elif command -v wget &>/dev/null; then
    wget -O "$LOCAL" "$URL"
  else
    echo "[x] Need curl or wget on PC"
    exit 1
  fi
else
  echo "[*] Using cached ${LOCAL}"
fi

echo "[*] Copying to iPhone ${USER}@${HOST}:/tmp/${DEB}"
if [[ -n "$PASS" ]] && command -v sshpass &>/dev/null; then
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no "$LOCAL" "${USER}@${HOST}:/tmp/${DEB}"
else
  scp -o StrictHostKeyChecking=no "$LOCAL" "${USER}@${HOST}:/tmp/${DEB}"
fi

echo ""
echo "[*] Deb on iPhone. Now SSH and install AS ROOT:"
echo ""
cat <<EOF
  ssh ${USER}@${HOST}
  su root
  export PATH=/var/jb/usr/bin:/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin
  PLIST=/var/jb/Library/LaunchDaemons/re.frida.server.plist
  launchctl unload "\$PLIST" 2>/dev/null; sleep 1
  dpkg -i /tmp/${DEB}
  launchctl load "\$PLIST"; sleep 2
  /var/jb/usr/sbin/frida-server --version
EOF
echo ""
echo "Must print: ${FRIDA_VER}"
