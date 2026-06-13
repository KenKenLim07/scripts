#!/usr/bin/env bash
# Vampire's Fall 2 (com.earlymorningstudio.trident) — Frida runner
#
# Usage:
#   ./frida-trident.sh              # attach + log (Smart-style)
#   ./frida-trident.sh --live       # terminal + log file together
#   ./frida-trident.sh --tail       # follow log file
#   ./frida-trident.sh --cheat      # log + mythic/RNG cheat
#   ./frida-trident.sh --stop        # kill SSH tunnel
#
# Config: config/frida.env (copy from config/env.example)

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_JS="${PROJECT_DIR}/hooks/trident_hook.js"
CHEAT_JS="${PROJECT_DIR}/hooks/trident_cheat.js"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/trident_log.txt"
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
TRIDENT_BUNDLE_ID="${TRIDENT_BUNDLE_ID:-com.earlymorningstudio.trident}"
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
  [[ "$ver" == "$FRIDA_VERSION" ]] && info "Frida client ${ver}" || warn "Frida ${ver:-?} (iPhone: ${FRIDA_VERSION})"
}

find_trident_pid() {
  local ps_out line
  ps_out="$(frida_ps_ai)" || return 1

  line="$(grep -F "${TRIDENT_BUNDLE_ID}" <<<"$ps_out" | head -1)" || true
  if [[ -n "$line" ]]; then
    awk '{print $1}' <<<"$line"
    return 0
  fi

  line="$(grep -iE 'trident|vampire.*fall' <<<"$ps_out" | head -1)" || true
  if [[ -n "$line" ]]; then
    awk '{print $1}' <<<"$line"
    return 0
  fi
  return 1
}

run_frida_attach() {
  local fg="$1" pid="$2" hook_js="$3" with_cheat="$4"
  local host="127.0.0.1:${FRIDA_LOCAL_PORT}"
  local args=(-H "$host" -p "$pid" -l "$hook_js")

  if $with_cheat; then
    python3 "${PROJECT_DIR}/hooks/cheat/bundle.py"
    [[ -f "$CHEAT_JS" ]] || { err "Missing $CHEAT_JS"; exit 1; }
    args+=(-l "$CHEAT_JS")
    info "Cheat module enabled (installs 3s after attach)"
  fi

  if $fg; then
    exec frida "${args[@]}"
  fi
  touch "$LOG_FILE"
  info "Logging to: ${LOG_FILE}"
  info "Watch: tail -f ${LOG_FILE}"
  exec frida "${args[@]}" -o "$LOG_FILE"
}

attach_trident() {
  local fg=false with_cheat=false hook_js="$HOOK_JS"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fg) fg=true; shift ;;
      --cheat) with_cheat=true; shift ;;
      --safe) with_cheat=false; shift ;;
      --minimal) hook_js="${PROJECT_DIR}/hooks/trident_minimal.js"; shift ;;
      *) shift ;;
    esac
  done

  [[ -f "$hook_js" ]] || { err "Missing $hook_js"; exit 1; }

  info "Open Vampire's Fall 2 on iPhone (foreground)."
  info "Bundle: ${TRIDENT_BUNDLE_ID}"

  local pid="" i
  for i in 1 2 3 4 5 6 7 8 10; do
    pid="$(find_trident_pid)" && break
    sleep 1
  done

  if [[ -z "${pid:-}" ]]; then
    err "Game not running."
    echo ""
    info "Matching processes:"
    frida_ps_ai \
      | grep -iE 'trident|vampire|earlymorning' || frida_ps_ai | head -15
    exit 1
  fi

  info "Process: $(frida_ps_ai | awk -v p="$pid" '$1==p')"
  info "Attaching PID ${pid}"
  run_frida_attach "$fg" "$pid" "$hook_js" "$with_cheat"
}

preflight_for_attach() {
  local pc_ver srv_ver force=false
  [[ "${1:-}" == "--force" ]] && force=true

  restart_iphone_frida_server || true
  sleep 2

  pc_ver="$(frida --version 2>/dev/null || true)"
  srv_ver="$(get_iphone_frida_version 2>/dev/null || true)"
  info "Frida versions — PC: ${pc_ver:-?} | iPhone: ${srv_ver:-?}"

  if [[ -n "$pc_ver" && -n "$srv_ver" && "$pc_ver" != "$srv_ver" ]]; then
    err "VERSION MISMATCH — attach will fail."
    err "Run: ~/dev/scripts/frida-downgrade-16.sh  (both sides must match)"
    exit 1
  fi

  if [[ "$pc_ver" == 17.* ]]; then
    err "Frida ${pc_ver} + Dopamine = attach timeout (your current error)."
    err ""
    err "Fix — downgrade BOTH sides to 16.1.4:"
    err "  PC:     ~/dev/scripts/frida-downgrade-16.sh"
    err "  iPhone: install frida_16.1.4_iphoneos-arm64.deb as root (script prints steps)"
    err ""
    err "After downgrade:"
    err "  frida-trident.sh --recover"
    err "  frida-trident.sh"
    if ! $force; then
      exit 1
    fi
    warn "--force: trying attach on Frida 17 anyway (likely fails)..."
  fi
}

run_late_attach() {
  local cheat=false tee=false trace=false diag=false eval_js=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cheat) cheat=true; shift ;;
      --trace) trace=true; shift ;;
      --diag)  diag=true; shift ;;
      --tee) tee=true; shift ;;
      --eval) eval_js="${2:-}"; shift 2 ;;
      *) shift ;;
    esac
  done

  info "Keep Trident on MAIN MENU, screen ON, in foreground."
  info "If attach times out: force-quit game → reopen → frida-trident.sh --recover"

  local py_args=(--log-file)
  $tee && py_args+=(--tee)
  $cheat && py_args+=(--cheat)
  $trace && py_args+=(--trace)
  $diag && py_args+=(--diag)
  [[ -n "$eval_js" ]] && py_args+=(--eval "$eval_js")

  info "Log file: ${LOG_FILE}"
  if $tee; then
    info "Live output: this terminal + log file"
  else
    info "Logs go to file only (terminal stays quiet)."
    info "Watch live: trident-tail.sh   (start BEFORE or AFTER attach)"
    info "Or one terminal: frida-trident.sh --live"
  fi

  exec python3 "${PROJECT_DIR}/frida-trident-late.py" "${py_args[@]}" --no-preflight
}

usage() {
  cat <<EOF
Vampire's Fall 2 Frida runner (${TRIDENT_BUNDLE_ID})

  ./frida-trident.sh           attach + log → logs/trident_log.txt
  ./frida-trident.sh --live    same + print to this terminal
  ./frida-trident.sh --tail    tail -f the log file
  ./frida-trident.sh --cheat              limited swaps (Common only)
  ./frida-trident.sh --cheat --diag       dump LootBag..ctor (do this next)
  ./frida-trident.sh --cheat --trace      broader invoke log

  ./frida-trident.sh --attach-test   test attach (Trident only)
  ./frida-trident.sh --recover       restart frida-server + test
  ./frida-trident.sh --doctor        SSH + tunnel check
  ./frida-trident.sh --stop          kill tunnel
  ./frida-trident.sh --ps            list apps

Legacy (may fail on Dopamine):
  ./frida-trident.sh --fg / --bare / --spawn

Smart-style two-terminal workflow:
  Terminal 1:  frida-trident.sh
  Terminal 2:  frida-trident.sh --tail
EOF
}

main() {
  case "${1:-}" in
    -h|--help) usage; exit 0 ;;
    --stop) stop_tunnel; exit 0 ;;
    --tail)
      [[ -f "$LOG_FILE" ]] || touch "$LOG_FILE"
      info "Following ${LOG_FILE} (Ctrl+C stops tail only, not attach)"
      exec tail -n 30 -F "$LOG_FILE"
      ;;
    --live)
      shift
      activate_frida
      start_tunnel
      check_frida_connection
      preflight_for_attach
      local live_args=(--tee)
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --cheat) live_args+=(--cheat) ;;
          --trace) live_args+=(--trace) ;;
          --diag)  live_args+=(--diag) ;;
          *) err "Unknown with --live: $1"; exit 1 ;;
        esac
        shift
      done
      run_late_attach "${live_args[@]}"
      ;;
    --doctor) doctor_frida; exit 0 ;;
    --recover)
      activate_frida
      stop_tunnel
      bash "${PROJECT_DIR}/../lib/start-server.sh" || true
      sleep 2
      start_tunnel force
      check_frida_connection
      srv_ver="$(get_iphone_frida_version || true)"
      pc_ver="$(frida --version 2>/dev/null || true)"
      info "PC frida: ${pc_ver:-?} | iPhone: ${srv_ver:-?}"
      python3 "${PROJECT_DIR}/frida-attach-test.py" || print_libsystem_fix
      ;;
    --attach-test)
      activate_frida
      start_tunnel
      check_frida_connection
      python3 "${PROJECT_DIR}/frida-attach-test.py" || print_libsystem_fix
      ;;
    --ps)
      activate_frida
      start_tunnel
      check_frida_connection
      frida_ps_ai | grep -iE 'trident|vampire|earlymorning' || frida_ps_ai
      ;;
    --minimal)
      activate_frida
      start_tunnel
      check_frida_connection
      attach_trident --minimal --fg
      ;;
    --spawn)
      activate_frida
      start_tunnel
      check_frida_connection
      info "Spawning ${TRIDENT_BUNDLE_ID} (close game on iPhone first)..."
      exec frida -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -f "${TRIDENT_BUNDLE_ID}" \
        -l "$HOOK_JS" --no-pause
      ;;
    --late)
      activate_frida
      start_tunnel
      check_frida_connection
      run_late_attach
      ;;
    --late-cheat)
      activate_frida
      start_tunnel
      check_frida_connection
      run_late_attach --cheat
      ;;
    --bare)
      activate_frida
      start_tunnel
      check_frida_connection
      pid="$(find_trident_pid)" || { err "Game not running"; exit 1; }
      info "Bare attach PID ${pid} (no hook script — attach test)"
      exec frida -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -p "$pid"
      ;;
    --fg)
      activate_frida
      start_tunnel
      check_frida_connection
      attach_trident --fg
      ;;
    --cheat)
      shift
      activate_frida
      start_tunnel
      check_frida_connection
      preflight_for_attach
      local cheat_args=(--cheat --tee)
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --trace) cheat_args+=(--trace) ;;
          --diag)  cheat_args+=(--diag) ;;
          --eval)  cheat_args+=(--eval "$2"); shift ;;
          --live) ;; # --cheat already enables --tee
          *) err "Unknown with --cheat: $1"; exit 1 ;;
        esac
        shift
      done
      run_late_attach "${cheat_args[@]}"
      ;;
    --safe)
      activate_frida
      start_tunnel
      check_frida_connection
      attach_trident --safe
      ;;
    "")
      activate_frida
      start_tunnel
      check_frida_connection
      info "Open Vampire's Fall 2 on iPhone (main menu, foreground)."
      preflight_for_attach
      run_late_attach
      ;;
    --force)
      activate_frida
      start_tunnel
      check_frida_connection
      info "Open Vampire's Fall 2 on iPhone (main menu, foreground)."
      preflight_for_attach --force
      run_late_attach
      ;;
    *)
      err "Unknown: $1"
      usage
      exit 1
      ;;
  esac
}

main "$@"
