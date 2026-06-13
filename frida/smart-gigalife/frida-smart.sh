#!/usr/bin/env bash
# Smart / GigaLife Frida runner — tunnel + attach + hooks
#
# Usage:
#   ./frida-smart.sh              # attach, log to logs/smart_log.txt
#   ./frida-smart.sh --fg         # live output in terminal
#   ./frida-smart.sh --ps         # list apps on device
#   ./frida-smart.sh --doctor      # diagnose SSH/tunnel/frida if stuck
#   ./frida-smart.sh --stop       # kill SSH tunnel on 27042
#
# Config: config/frida.env (copy from config/env.example)

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_JS="${PROJECT_DIR}/hooks/smart_hook.js"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/smart_log.txt"
TUNNEL_PID_FILE="${LOG_DIR}/.frida_tunnel.pid"
ENV_FILE="${PROJECT_DIR}/config/frida.env"

mkdir -p "$LOG_DIR"

SHARED_ENV="${PROJECT_DIR}/../config/frida.env"
if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$SHARED_ENV"
fi
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

FRIDA_IPHONE_HOST="${FRIDA_IPHONE_HOST:-192.168.254.133}"
FRIDA_IPHONE_USER="${FRIDA_IPHONE_USER:-mobile}"
FRIDA_LOCAL_PORT="${FRIDA_LOCAL_PORT:-27042}"
FRIDA_VENV="${FRIDA_VENV:-$HOME/frida-env}"
FRIDA_VERSION="17.9.1"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[*]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[x]${NC} $*" >&2; }

# shellcheck source=../lib/connect.sh
source "${PROJECT_DIR}/../lib/connect.sh"

activate_frida() {
  if [[ -f "${FRIDA_VENV}/bin/activate" ]]; then
    # shellcheck source=/dev/null
    source "${FRIDA_VENV}/bin/activate"
  elif ! command -v frida &>/dev/null; then
    err "frida not found. pip install frida==${FRIDA_VERSION} frida-tools"
    exit 1
  fi

  local ver
  ver="$(frida --version 2>/dev/null || true)"
  if [[ "$ver" != "$FRIDA_VERSION" ]]; then
    warn "PC frida version is '${ver:-unknown}', iPhone expects ${FRIDA_VERSION}"
  else
    info "Frida client version ${ver}"
  fi
}

find_smart_pid() {
  local line
  line="$(frida_ps_ai \
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
  info "Logging to: ${LOG_FILE}"
  info "Watch: tail -f ${LOG_FILE}"
  exec frida "${frida_args[@]}" -o "$LOG_FILE"
}

attach_smart() {
  local fg=false
  [[ "${1:-}" == "--fg" ]] && fg=true

  if [[ ! -f "$HOOK_JS" ]]; then
    err "Missing hook: $HOOK_JS"
    exit 1
  fi

  info "Open Smart on iPhone (foreground)."
  local pid="" i
  for i in 1 2 3 4 5 6 7 8; do
    pid="$(find_smart_pid)" && break
    sleep 1
  done

  if [[ -z "${pid:-}" ]]; then
    err "Smart not running."
    exit 1
  fi

  info "Attaching to Smart (PID ${pid})"
  run_frida_attach "$fg" "$pid"
}

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  case "${1:-}" in
    -h|--help) usage; exit 0 ;;
    --stop) stop_tunnel; exit 0 ;;
    --doctor) doctor_frida; exit 0 ;;
    --ps)
      activate_frida
      start_tunnel
      check_frida_connection
      frida_ps_ai
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
