#!/usr/bin/env bash
# Start frida-server on iPhone (root) — run from PC
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=connect.sh
source "${LIB_DIR}/connect.sh"

SHARED_ENV="${LIB_DIR}/../config/frida.env"
[[ -f "$SHARED_ENV" ]] && source "$SHARED_ENV"

ROOT_PASS="${FRIDA_SSH_ROOT_PASS:-alpine}"

remote=$(cat <<'EOS'
export PATH=/var/jb/usr/bin:/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin
FRIDA=/var/jb/usr/sbin/frida-server
PLIST=/var/jb/Library/LaunchDaemons/re.frida.server.plist

frida_up() { ps aux 2>/dev/null | grep -v grep | grep -q '[f]rida-server'; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    echo 'ROOTPASS' | sudo -S "$@"
    return $?
  fi
  echo 'ROOTPASS' | su root -c "$*"
}

echo "=== frida-server version ==="
"$FRIDA" --version 2>/dev/null || echo "frida binary missing"

if frida_up; then
  echo FRIDA_ALREADY_RUNNING
  "$FRIDA" --version
  exit 0
fi

echo "=== stopping old daemon ==="
as_root launchctl unload "$PLIST" 2>/dev/null || true
sleep 1
pkill -9 frida-server 2>/dev/null || true
sleep 1

echo "=== launchctl load ==="
if as_root launchctl load "$PLIST" 2>/dev/null; then
  sleep 2
  if frida_up; then
    echo FRIDA_STARTED_LAUNCHCTL
    "$FRIDA" --version
    exit 0
  fi
fi

echo "=== manual frida-server -D ==="
as_root "$FRIDA" -D >/dev/null 2>&1 &
sleep 2
if frida_up; then
  echo FRIDA_STARTED_MANUAL
  "$FRIDA" --version
  exit 0
fi

echo FRIDA_START_FAILED
ls -la "$FRIDA" "$PLIST" 2>&1
exit 1
EOS
)

remote="${remote//ROOTPASS/$ROOT_PASS}"

info "Starting frida-server on ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}..."
out="$(ssh_cmd "$remote" 2>&1)" || true
echo "$out"

case "$out" in
  *FRIDA_ALREADY_RUNNING*|*FRIDA_STARTED_*)
    info "frida-server OK"
    exit 0
    ;;
  *)
    err "Could not start frida-server"
    echo ""
    echo "On iPhone as root, run manually:"
    echo "  /var/jb/usr/sbin/frida-server -D &"
    exit 1
    ;;
esac
