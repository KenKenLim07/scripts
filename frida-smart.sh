#!/usr/bin/env bash
# One-shot: tunnel + frida-server check + attach to Smart with smart_hook.js
#
# Usage:
#   ./frida-smart.sh              # attach, log to ~/dev/scripts/smart_log.txt
#   ./frida-smart.sh --fg         # attach, print to terminal (no log file)
#   ./frida-smart.sh --ps         # list apps only
#   ./frida-smart.sh --stop       # kill local SSH tunnel on 27042
#
# Optional env:
#   FRIDA_IPHONE_HOST=192.168.254.133
#   FRIDA_IPHONE_USER=mobile
#   FRIDA_SSH_PASS=mobile          # only if ssh keys not set (needs sshpass)
#   FRIDA_VENV=~/frida-env

set -euo pipefail

FRIDA_IPHONE_HOST="${FRIDA_IPHONE_HOST:-192.168.254.133}"
FRIDA_IPHONE_USER="${FRIDA_IPHONE_USER:-mobile}"
FRIDA_LOCAL_PORT="${FRIDA_LOCAL_PORT:-27042}"
FRIDA_VENV="${FRIDA_VENV:-$HOME/frida-env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_JS="${SCRIPT_DIR}/smart_hook.js"
LOG_FILE="${SCRIPT_DIR}/smart_log.txt"
TUNNEL_PID_FILE="${SCRIPT_DIR}/.frida_tunnel.pid"

# Optional: ~/dev/scripts/frida-smart.env (FRIDA_SSH_PASS, FRIDA_IPHONE_HOST, ...)
if [[ -f "${SCRIPT_DIR}/frida-smart.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/frida-smart.env"
fi

APP_NAMES=("Smart" "ph.com.smart.Smart")
FRIDA_VERSION="17.9.1"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[*]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[x]${NC} $*" >&2; }

ssh_cmd() {
  if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$FRIDA_SSH_PASS" ssh \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=8 \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" "$@"
  else
    ssh \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout=8 \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" "$@"
  fi
}

tunnel_running() {
  ss -tlnp 2>/dev/null | grep -q "127.0.0.1:${FRIDA_LOCAL_PORT}" || \
    netstat -tlnp 2>/dev/null | grep -q "127.0.0.1:${FRIDA_LOCAL_PORT}"
}

start_tunnel() {
  if tunnel_running; then
    info "SSH tunnel already listening on 127.0.0.1:${FRIDA_LOCAL_PORT}"
    return 0
  fi

  info "Starting SSH tunnel → ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}:${FRIDA_LOCAL_PORT}"
  if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$FRIDA_SSH_PASS" ssh -f -N \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -L "127.0.0.1:${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
  else
    ssh -f -N \
      -o StrictHostKeyChecking=no \
      -L "127.0.0.1:${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
  fi

  sleep 1
  if ! tunnel_running; then
    err "Tunnel failed to bind. Check SSH password/keys and iPhone IP."
    exit 1
  fi

  pgrep -af "ssh.*${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" | head -1 > "$TUNNEL_PID_FILE" || true
  info "Tunnel OK"
}

stop_tunnel() {
  info "Stopping SSH tunnels on port ${FRIDA_LOCAL_PORT}..."
  pkill -f "ssh.*-L.*${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" 2>/dev/null || true
  rm -f "$TUNNEL_PID_FILE"
  info "Done"
}

check_frida_connection() {
  info "Checking Frida through tunnel (127.0.0.1:${FRIDA_LOCAL_PORT})..."
  if frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" &>/dev/null; then
    info "Frida connection OK"
    return 0
  fi

  warn "Cannot reach frida-server — checking iPhone (one SSH)..."
  local remote_shell
  remote_shell='export PATH=/var/jb/usr/sbin:/var/jb/usr/bin:/usr/sbin:/usr/bin:/sbin:/bin
N=""
for p in /usr/sbin/netstat /sbin/netstat netstat; do
  [ -x "$p" ] && N="$p" && break
done
if [ -n "$N" ]; then $N -an 2>/dev/null | grep 27042 | grep LISTEN; fi
ps aux 2>/dev/null | grep frida-server | grep -v grep'

  local out
  out="$(ssh_cmd "$remote_shell")" || {
    err "SSH to iPhone failed (${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST})"
    exit 1
  }

  if echo "$out" | grep -q frida-server; then
    warn "frida-server process exists but tunnel/Frida failed — retry in 2s..."
    sleep 2
    if frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" &>/dev/null; then
      info "Frida connection OK"
      return 0
    fi
  fi

  err "frida-server not reachable."
  echo "  On iPhone (frida is listening per your check):"
  echo "    cd /var/jb/Library/LaunchDaemons && su root -c \"launchctl load re.frida.server.plist\""
  echo "  Then run this script again."
  echo "  Tip: avoid 4 password prompts → ssh-copy-id ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
  echo "       or: export FRIDA_SSH_PASS=mobile  (needs: apt install sshpass)"
  exit 1
}

activate_frida() {
  if [[ -f "${FRIDA_VENV}/bin/activate" ]]; then
    # shellcheck source=/dev/null
    source "${FRIDA_VENV}/bin/activate"
  elif ! command -v frida &>/dev/null; then
    err "frida not found. Set FRIDA_VENV or: pip install frida==${FRIDA_VERSION} frida-tools"
    exit 1
  fi

  local ver
  ver="$(frida --version 2>/dev/null || true)"
  if [[ "$ver" != "$FRIDA_VERSION" ]]; then
    warn "PC frida version is '${ver:-unknown}', iPhone expects ${FRIDA_VERSION}"
    warn "Run: pip install frida==${FRIDA_VERSION} frida-tools"
  else
    info "Frida client version ${ver}"
  fi
}

frida_ps() {
  frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -ai
}

find_smart_pid() {
  # frida-ps -ai line:  73714  Smart  ph.com.smart.Smart
  local line
  line="$(frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -ai 2>/dev/null \
    | grep -E 'ph\.com\.smart\.Smart|[[:space:]]Smart[[:space:]]' \
    | head -1)" || return 1
  [[ -n "$line" ]] || return 1
  awk '{print $1}' <<<"$line"
}

run_frida_attach() {
  local fg="$1" pid="$2"
  local host="127.0.0.1:${FRIDA_LOCAL_PORT}"
  local frida_args=(-H "$host" -p "$pid" -l "$HOOK_JS")

  if $fg; then
    exec frida "${frida_args[@]}"
  fi
  touch "$LOG_FILE"
  info "Logging to: ${LOG_FILE} (tail -f ${LOG_FILE} in another terminal)"
  exec frida "${frida_args[@]}" -o "$LOG_FILE"
}

attach_smart() {
  local fg=false
  [[ "${1:-}" == "--fg" ]] && fg=true

  if [[ ! -f "$HOOK_JS" ]]; then
    err "Missing hook script: $HOOK_JS"
    exit 1
  fi

  info "Open the Smart app on your iPhone (keep it in foreground)."
  local pid="" i
  for i in 1 2 3 4 5 6 7 8; do
    pid="$(find_smart_pid)" && break
    sleep 1
  done

  if [[ -z "${pid:-}" ]]; then
    err "Smart not running. Open the app on iPhone, then retry."
    echo ""
    frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -ai | grep -i smart || true
    exit 1
  fi

  # iOS: -n bundle id often fails; attach by PID is reliable
  info "Attaching to Smart (PID ${pid})"
  run_frida_attach "$fg" "$pid"
}

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
    --stop)
      stop_tunnel
      exit 0
      ;;
    --ps)
      activate_frida
      start_tunnel
      check_frida_connection
      frida_ps
      exit 0
      ;;
    --fg)
      activate_frida
      start_tunnel
      check_frida_connection
      attach_smart --fg
      ;;
    "")
      activate_frida
      start_tunnel
      check_frida_connection
      attach_smart
      ;;
    *)
      err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
}

main "$@"
