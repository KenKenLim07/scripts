#!/usr/bin/env bash
# Follow Trident Frida log (Smart-style second terminal)
LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frida/trident/logs/trident_log.txt"
mkdir -p "$(dirname "$LOG")"
touch "$LOG"

echo "[*] Following: $LOG"
echo "[*] Start attach in another terminal: frida-trident.sh"
echo "[*] (-F = keeps following even when log is rewritten)"
echo ""

# -F follows file recreate/truncate (plain -f stops after frida-trident wipes log)
exec tail -n 30 -F "$LOG"
