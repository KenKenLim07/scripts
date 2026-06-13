#!/usr/bin/env bash
# One-time setup: sshpass + shared frida.env (SSH password for iPhone)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT}/frida/config/frida.env"
EXAMPLE="${ROOT}/frida/config/env.example"

echo "[*] Frida SSH setup"

if ! command -v sshpass &>/dev/null; then
  echo "[*] Installing sshpass (needed for password SSH without prompts)..."
  sudo apt-get update -qq && sudo apt-get install -y sshpass
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "[*] Created ${ENV_FILE}"
else
  echo "[*] Already exists: ${ENV_FILE}"
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

echo "[*] Testing SSH to ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}..."
if sshpass -p "$FRIDA_SSH_PASS" ssh \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=8 \
  -o UserKnownHostsFile=/dev/null \
  "${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}" "echo SSH_OK"; then
  echo "[*] SSH OK — run: frida-doctor.sh"
else
  echo "[x] SSH still failed. Check iPhone IP/password in ${ENV_FILE}"
  exit 1
fi

echo ""
echo "Optional (skip password forever):"
echo "  ssh-copy-id ${FRIDA_IPHONE_USER}@${FRIDA_IPHONE_HOST}"
echo "  then remove FRIDA_SSH_PASS from ${ENV_FILE}"
