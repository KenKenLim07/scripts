# Shared Frida ↔ iPhone connectivity helpers (source from frida-*.sh)
# Expects: FRIDA_IPHONE_HOST, FRIDA_IPHONE_USER, FRIDA_LOCAL_PORT, FRIDA_SSH_PASS (optional)

FRIDA_PROBE_TIMEOUT="${FRIDA_PROBE_TIMEOUT:-5}"
FRIDA_SSH_CONNECT_TIMEOUT="${FRIDA_SSH_CONNECT_TIMEOUT:-8}"

ssh_common_opts=(
  -o StrictHostKeyChecking=no
  -o ConnectTimeout="${FRIDA_SSH_CONNECT_TIMEOUT}"
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)

run_with_timeout() {
  local secs="$1"
  shift
  if command -v timeout &>/dev/null; then
    timeout "$secs" "$@"
  else
    "$@"
  fi
}

ssh_cmd() {
  if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$FRIDA_SSH_PASS" ssh \
      "${ssh_common_opts[@]}" \
      -o UserKnownHostsFile=/dev/null \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" "$@"
  else
    ssh \
      "${ssh_common_opts[@]}" \
      -o BatchMode=yes \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" "$@"
  fi
}

ssh_tunnel_bg() {
  local fwd="-L 127.0.0.1:${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}"
  local err_file
  err_file="$(mktemp /tmp/frida-ssh-tunnel.XXXXXX)"
  local rc=0

  if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$FRIDA_SSH_PASS" ssh -f -N \
      "${ssh_common_opts[@]}" \
      -o ExitOnForwardFailure=yes \
      -o UserKnownHostsFile=/dev/null \
      "$fwd" \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" 2>"$err_file" || rc=$?
  else
    ssh -f -N \
      "${ssh_common_opts[@]}" \
      -o ExitOnForwardFailure=yes \
      -o BatchMode=yes \
      "$fwd" \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" 2>"$err_file" || rc=$?
  fi

  if [[ $rc -ne 0 ]] && [[ -s "$err_file" ]]; then
    cat "$err_file" >&2
  fi
  rm -f "$err_file"
  return $rc
}

tunnel_running() {
  ss -tln 2>/dev/null | grep -qE ":${FRIDA_LOCAL_PORT}\b" || \
    ss -tlnp 2>/dev/null | grep -qE "127\.0\.0\.1:${FRIDA_LOCAL_PORT}\b" || \
    netstat -tln 2>/dev/null | grep -qE ":${FRIDA_LOCAL_PORT}\s"
}

tunnel_wait_ready() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    tunnel_running && return 0
    sleep 0.5
  done
  return 1
}

frida_tunnel_works() {
  run_with_timeout "$FRIDA_PROBE_TIMEOUT" \
    frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" &>/dev/null
}

frida_ps_ai() {
  run_with_timeout "$FRIDA_PROBE_TIMEOUT" \
    frida-ps -H "127.0.0.1:${FRIDA_LOCAL_PORT}" -ai 2>/dev/null
}

stop_tunnel() {
  info "Stopping SSH tunnels on port ${FRIDA_LOCAL_PORT}..."
  pkill -f "ssh.*-L.*${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" 2>/dev/null || true
  pkill -f "ssh.*127.0.0.1:${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" 2>/dev/null || true
  pkill -f "ssh.*-L 127.0.0.1:${FRIDA_LOCAL_PORT}" 2>/dev/null || true
  if command -v fuser &>/dev/null; then
    fuser -k "${FRIDA_LOCAL_PORT}/tcp" 2>/dev/null || true
  elif command -v lsof &>/dev/null; then
    lsof -ti "tcp:${FRIDA_LOCAL_PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi
  rm -f "${TUNNEL_PID_FILE:-}"
  sleep 1
  if tunnel_running; then
    warn "Port ${FRIDA_LOCAL_PORT} still in use — run: frida-trident.sh --stop"
  else
    info "Port ${FRIDA_LOCAL_PORT} free"
  fi
}

start_tunnel() {
  local force="${1:-}"

  info "Checking tunnel (127.0.0.1:${FRIDA_LOCAL_PORT})..."

  if [[ "$force" == "force" ]]; then
    stop_tunnel
  fi

  if [[ "$force" != "force" ]] && tunnel_running; then
    info "Port is open — probing frida-server (${FRIDA_PROBE_TIMEOUT}s timeout)..."
    if frida_tunnel_works; then
      info "SSH tunnel OK (frida-server reachable)"
      return 0
    fi
    warn "Stale tunnel: port open but frida-server not responding — restarting..."
    stop_tunnel
  elif [[ "$force" != "force" ]] && frida_tunnel_works; then
    info "Frida reachable (no local tunnel port detected)"
    return 0
  fi

  if tunnel_running; then
    warn "Port ${FRIDA_LOCAL_PORT} still busy — killing again..."
    stop_tunnel
  fi

  info "Starting SSH tunnel → ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}:${FRIDA_LOCAL_PORT}"

  if ! ssh_cmd "echo SSH_OK" &>/dev/null; then
    err "SSH to iPhone failed (cannot build tunnel)."
    if [[ -z "${FRIDA_SSH_PASS:-}" ]] && ! ssh -o BatchMode=yes -o ConnectTimeout=3 \
        "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" true &>/dev/null; then
      err "No SSH key and no FRIDA_SSH_PASS."
      err "Run: ~/dev/scripts/frida-setup.sh"
      err "Or: ssh-copy-id ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
    fi
    exit 1
  fi

  if ! ssh_tunnel_bg; then
    err "SSH tunnel command failed."
    if tunnel_running; then
      warn "Port is listening anyway — continuing..."
    else
      err "Check: ping ${FRIDA_IPHONE_HOST}  |  ssh ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
      exit 1
    fi
  fi

  if ! tunnel_wait_ready; then
    err "Tunnel failed to bind on 127.0.0.1:${FRIDA_LOCAL_PORT}"
    err "Debug: ss -tln | grep ${FRIDA_LOCAL_PORT}"
    ss -tln 2>/dev/null | grep "${FRIDA_LOCAL_PORT}" || true
    err "Try: frida-trident.sh --stop && sleep 2 && frida-doctor.sh"
    exit 1
  fi

  info "Probing frida-server through tunnel..."
  if ! frida_tunnel_works; then
    err "Tunnel up but frida-server not responding on iPhone."
    echo "  ssh ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST} → su root → launchctl load /var/jb/Library/LaunchDaemons/re.frida.server.plist"
    exit 1
  fi

  pgrep -af "ssh.*${FRIDA_LOCAL_PORT}:127.0.0.1:${FRIDA_LOCAL_PORT}" | head -1 > "${TUNNEL_PID_FILE:-/dev/null}" 2>/dev/null || true
  info "Tunnel OK"
}

ensure_iphone_frida_server() {
  local lib_dir script
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  script="${lib_dir}/start-server.sh"
  info "Checking frida-server on iPhone via SSH..."
  if [[ -f "$script" ]]; then
    bash "$script" && return 0
  fi
  err "frida-server not running. Run: ~/dev/scripts/frida-fix-server.sh"
  exit 1
}

restart_iphone_frida_server() {
  local lib_dir
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local script="${lib_dir}/restart-server.sh"
  info "Restarting frida-server on iPhone..."
  if [[ -f "$script" ]]; then
    bash "$script" || warn "frida-server restart failed — try manually as root on iPhone"
    return 0
  fi
  warn "Missing $script"
}

print_libsystem_fix() {
  cat <<'EOF'

╔══════════════════════════════════════════════════════════════════╗
║  Frida attach crash — Dopamine 2.4 + Frida 17.x (not your code) ║
╚══════════════════════════════════════════════════════════════════╝

Symptoms you may see:
  • unexpected early end-of-stream
  • libSystem.B.dylib not found
  • target app QUITS when you attach (Smart/Trident killed)
  • timeout on attach

After ANY failed attach → frida-server is DEAD. Always run:
  frida-trident.sh --recover

─── Try first (iPhone) ───

  1. Update Dopamine to latest 2.4.2+ (Sileo/Zebra)
  2. Dopamine → Settings → Hide Jailbreak → ON
  3. Dopamine → Restart Userspace
  4. su root → launchctl load /var/jb/Library/LaunchDaemons/re.frida.server.plist
  5. Force-quit Trident → reopen main menu ONLY (don't open Smart during test)

─── Reliable fix (downgrade Frida) ───

  PC:    ~/dev/scripts/frida-downgrade-16.sh
  iPhone: install frida_16.1.4 deb (script prints exact commands)

  Both sides MUST be 16.1.4 — then:
  frida-trident.sh --attach-test

─── If still crashing ───

  • Shadow: disable for Trident
  • Choicy: disable tweak injection for Trident
  • Dopamine spinlock bug: downgrade Dopamine to 2.2.2 (last resort)

Test (Trident only — won't kill Smart):
  frida-trident.sh --attach-test

EOF
}

check_frida_connection() {
  info "Checking Frida through tunnel (127.0.0.1:${FRIDA_LOCAL_PORT}, ${FRIDA_PROBE_TIMEOUT}s timeout)..."
  if frida_tunnel_works; then
    info "Frida connection OK"
    return 0
  fi

  warn "Cannot reach frida-server — recovering..."
  ensure_iphone_frida_server
  start_tunnel force
  sleep 1

  if frida_tunnel_works; then
    info "Frida connection OK"
    return 0
  fi

  err "Still cannot reach frida-server."
  exit 1
}

get_iphone_frida_version() {
  ssh_cmd '/var/jb/usr/sbin/frida-server --version 2>/dev/null || frida-server --version 2>/dev/null' 2>/dev/null | head -1 | tr -d '\r'
}

doctor_frida() {
  activate_frida

  info "SSH auth: $(
    if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
      echo 'password via sshpass'
    elif [[ -n "${FRIDA_SSH_PASS:-}" ]]; then
      echo 'FRIDA_SSH_PASS set but sshpass missing — run: sudo apt install sshpass'
    elif [[ -f "${HOME}/.ssh/id_rsa.pub" || -f "${HOME}/.ssh/id_ed25519.pub" ]]; then
      echo 'SSH key present (BatchMode)'
    else
      echo 'none — run: ~/dev/scripts/frida-setup.sh'
    fi
  )"

  info "Step 1/4 — network ping ${FRIDA_IPHONE_HOST}"
  if ping -c 1 -W 3 "$FRIDA_IPHONE_HOST" &>/dev/null; then
    info "  iPhone reachable on LAN"
  else
    warn "  iPhone not pingable (may be normal if ICMP blocked)"
  fi

  info "Step 2/4 — SSH (${FRIDA_SSH_CONNECT_TIMEOUT}s timeout)"
  local ssh_err
  ssh_err="$(ssh_cmd "echo SSH_OK" 2>&1)" || true
  if [[ "$ssh_err" == *SSH_OK* ]]; then
    info "  SSH OK"
  else
    err "  SSH failed"
    [[ -n "$ssh_err" ]] && echo "  detail: ${ssh_err//$'\n'/ }" >&2
    echo "" >&2
    err "  Quick fix (one command):"
    err "    ~/dev/scripts/frida-setup.sh"
    err "  Or manual:"
    err "    sudo apt install sshpass"
    err "    export FRIDA_SSH_PASS=mobile"
    err "    frida-doctor.sh"
    err "  Or passwordless:"
    err "    ssh-copy-id ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
    exit 1
  fi

  info "Step 3/4 — tunnel + frida-server"
  if tunnel_running; then
    info "  Port ${FRIDA_LOCAL_PORT} is listening locally"
  else
    info "  Port ${FRIDA_LOCAL_PORT} not open yet"
  fi
  start_tunnel force

  info "Step 4/4 — list apps + version check"
  local srv_ver pc_ver
  srv_ver="$(get_iphone_frida_version || true)"
  pc_ver="$(frida --version 2>/dev/null || true)"
  info "  PC frida: ${pc_ver:-?}"
  info "  iPhone frida-server: ${srv_ver:-unknown (ssh failed)}"
  if [[ -n "$srv_ver" && -n "$pc_ver" && "$srv_ver" != "$pc_ver" ]]; then
    warn "  VERSION MISMATCH — update both to the same version from https://build.frida.re"
  fi
  frida_ps_ai | head -20
  info "Doctor complete — connectivity looks good."
}
