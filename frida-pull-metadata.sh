#!/usr/bin/env bash
# Pull il2cpp global-metadata.dat + UnityFramework from jailbroken iPhone
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_ENV="${SCRIPT_DIR}/frida/config/frida.env"

if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$SHARED_ENV"
fi

FRIDA_IPHONE_HOST="${FRIDA_IPHONE_HOST:-192.168.254.133}"
FRIDA_IPHONE_USER="${FRIDA_IPHONE_USER:-mobile}"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/frida/lib/connect.sh"

OUT_DIR="${HOME}/dev/scripts/frida/trident/dump"
mkdir -p "$OUT_DIR"

scp_cmd() {
  local src="$1" dst="$2"
  if [[ -n "${FRIDA_SSH_PASS:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$FRIDA_SSH_PASS" scp \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout="${FRIDA_SSH_CONNECT_TIMEOUT:-8}" \
      -o UserKnownHostsFile=/dev/null \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}:${src}" "$dst"
  else
    scp \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout="${FRIDA_SSH_CONNECT_TIMEOUT:-8}" \
      -o BatchMode=yes \
      "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}:${src}" "$dst"
  fi
}

echo "[*] SSH → ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
if ! ssh_cmd "echo SSH_OK" &>/dev/null; then
  echo "ERROR: SSH failed — run: frida-trident.sh --doctor" >&2
  exit 1
fi

echo "[*] Locating VampiresFall2 + global-metadata.dat..."
REMOTE_OUT="$(ssh_cmd bash -s <<'REMOTE' 2>&1 || true
set +e
APP=$(find /var/containers/Bundle/Application -maxdepth 3 -name 'VampiresFall2.app' 2>/dev/null | head -1)
FW=""
META=""
if [[ -n "$APP" ]]; then
  FW="${APP}/Frameworks/UnityFramework.framework/UnityFramework"
  for cand in \
    "${APP}/Frameworks/UnityFramework.framework/Data/Managed/Metadata/global-metadata.dat" \
    "${APP}/Data/Managed/Metadata/global-metadata.dat" \
    "$(find "$APP" -name 'global-metadata.dat' 2>/dev/null | head -1)"
  do
    if [[ -n "$cand" && -f "$cand" ]]; then
      META="$cand"
      break
    fi
  done
fi
echo "APP=${APP}"
echo "FW=${FW}"
echo "META=${META}"
if [[ -z "$APP" ]]; then
  echo "STATUS=NO_APP"
elif [[ ! -f "$FW" ]]; then
  echo "STATUS=NO_FW"
elif [[ -z "$META" ]]; then
  echo "STATUS=NO_META"
  echo "--- search hints ---"
  find "$APP" -name '*.dat' 2>/dev/null | head -15
  find "$APP/Frameworks/UnityFramework.framework" -type f 2>/dev/null | head -20
else
  echo "STATUS=OK"
  ls -la "$META"
fi
REMOTE
)"

echo "$REMOTE_OUT"

APP="$(echo "$REMOTE_OUT" | sed -n 's/^APP=//p' | head -1)"
FW="$(echo "$REMOTE_OUT" | sed -n 's/^FW=//p' | head -1)"
META="$(echo "$REMOTE_OUT" | sed -n 's/^META=//p' | head -1)"
STATUS="$(echo "$REMOTE_OUT" | sed -n 's/^STATUS=//p' | head -1)"

if [[ -z "$APP" || "$STATUS" == "NO_APP" ]]; then
  echo "ERROR: VampiresFall2.app not found on iPhone" >&2
  exit 1
fi

if [[ ! -f "$FW" ]] && ! ssh_cmd "test -f '${FW}'"; then
  echo "ERROR: UnityFramework not found at $FW" >&2
  exit 1
fi

if [[ -n "$META" && "$STATUS" == "OK" ]]; then
  echo "[*] Pulling global-metadata.dat..."
  echo "    from: $META"
  scp_cmd "$META" "${OUT_DIR}/global-metadata.dat"
else
  echo "[!] global-metadata.dat not found as a separate file."
  echo "    Common on iOS: UnityFramework.framework/Data/Managed/Metadata/"
  echo "    Will pull UnityFramework — Il2CppDumper may still work (metadata embedded)."
  echo "    Or dump from RAM while game runs (see below)."
fi

echo "[*] Pulling UnityFramework (large — 1–3 min)..."
echo "    from: $FW"
scp_cmd "$FW" "${OUT_DIR}/UnityFramework"

echo ""
ls -lh "${OUT_DIR}/" 2>/dev/null || true

echo ""
echo "[*] Pulled to: ${OUT_DIR}/"
if [[ -f "${OUT_DIR}/global-metadata.dat" ]]; then
  echo "    global-metadata.dat  OK"
else
  echo "    global-metadata.dat  MISSING — try Il2CppDumper auto mode on UnityFramework only"
fi
echo "    UnityFramework       OK"
echo ""
echo "Il2CppDumper:"
echo "  cd ${OUT_DIR} && git clone https://github.com/Perfare/Il2CppDumper.git"
echo "  cd Il2CppDumper && dotnet run -- ../UnityFramework ../global-metadata.dat ../output"
echo "  # if no metadata file:"
echo "  dotnet run -- ../UnityFramework ../UnityFramework ../output"
echo ""
echo "Then: grep -i 'LootBag\\|PremiumChest\\|Dropped' ${OUT_DIR}/output/dump.cs | head -50"
