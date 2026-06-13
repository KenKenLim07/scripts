#!/usr/bin/env bash
# Restart frida-server on iPhone (needs root on Dopamine)
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=connect.sh
source "${LIB_DIR}/connect.sh"

SHARED_ENV="${LIB_DIR}/../config/frida.env"
if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$SHARED_ENV"
fi

ROOT_PASS="${FRIDA_SSH_ROOT_PASS:-alpine}"
PLIST="/var/jb/Library/LaunchDaemons/re.frida.server.plist"

remote_shell=$(cat <<EOF
export PATH=/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin
PLIST=${PLIST}
restart_frida() {
  launchctl unload "\$PLIST" 2>/dev/null || true
  sleep 1
  launchctl load "\$PLIST" 2>/dev/null || true
  sleep 2
  ps aux 2>/dev/null | grep -v grep | grep -q frida-server
}
if [ "\$(id -u)" -eq 0 ]; then
  restart_frida && /var/jb/usr/sbin/frida-server --version && echo FRIDA_RESTARTED
  exit \$?
fi
if command -v sudo >/dev/null 2>&1; then
  echo '${ROOT_PASS}' | sudo -S launchctl unload "\$PLIST" 2>/dev/null || true
  sleep 1
  echo '${ROOT_PASS}' | sudo -S launchctl load "\$PLIST" 2>/dev/null || true
  sleep 2
  ps aux 2>/dev/null | grep -v grep | grep -q frida-server && \\
    /var/jb/usr/sbin/frida-server --version && echo FRIDA_RESTARTED
  exit \$?
fi
echo NEED_ROOT
exit 1
EOF
)

out="$(ssh_cmd "$remote_shell" 2>&1)" || true

if [[ "$out" == *FRIDA_RESTARTED* ]]; then
  echo "[*] frida-server restarted"
  echo "$out" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/^/[*] iPhone version: /'
  exit 0
fi

if [[ "$out" == *NEED_ROOT* ]]; then
  echo "[x] Need root/sudo to restart frida-server."
  echo "    ssh ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
  echo "    su root  →  launchctl load ${PLIST}"
  echo "    Or add FRIDA_SSH_ROOT_PASS=alpine to frida/config/frida.env"
  exit 1
fi

echo "[!] Restart failed: ${out}"
exit 1
