#!/bin/bash

# --- CONFIG ---
CURSOR_USER="$HOME/.config/Cursor/User"
GLOBAL_DB="$CURSOR_USER/globalStorage/state.vscdb"
BACKUP_DIR="$HOME/cursor_history_stash"
LOGFILE="$HOME/.local/share/reset_cursor.log"

# ensure log dir exists
mkdir -p "$(dirname "$LOGFILE")" 2>/dev/null || true

log() {
    echo "[$(date --iso-8601=seconds)] $*" | tee -a "$LOGFILE"
}

# CLI flags
DRY_RUN=0
AUTO_YES=0
while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run|-n) DRY_RUN=1; shift ;;
        --yes|-y) AUTO_YES=1; shift ;;
        *) shift ;;
    esac
done

run_or_log() {
    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] $*"
    else
        log "[RUN] $*"
        eval "$*"
    fi
}


# --- DEPENDENCY CHECK ---
if ! command -v sqlite3 &> /dev/null || ! command -v macchanger &> /dev/null; then
    echo "[!] Missing tools! Run: sudo apt install sqlite3 macchanger"
    exit 1
fi

log "[!] Surgical Reset (Hardcore + History Protected) Initiated..."

# 1. KILL CURSOR (Suicide-Proof)
# Prefer stopping managed services that own the process instead of blanket KILLs
if systemctl --user status cursor.service >/dev/null 2>&1; then
    systemctl --user stop cursor.service 2>/dev/null || true
elif systemctl status cursor.service >/dev/null 2>&1; then
    sudo systemctl stop cursor.service 2>/dev/null || true
else
    CURSOR_PIDS=$(pgrep -f "cursor" | grep -v $$)
    if [ -n "$CURSOR_PIDS" ]; then
        echo "$CURSOR_PIDS" | xargs sudo kill -9 2>/dev/null || true
    fi
fi

# 2. STASH HISTORY
mkdir -p "$BACKUP_DIR"
cp -r "$CURSOR_USER/workspaceStorage" "$BACKUP_DIR/" 2>/dev/null
cp -r "$CURSOR_USER/IndexedDB" "$BACKUP_DIR/" 2>/dev/null

# 3. NUCLEAR WIPE
if [ "$DRY_RUN" -eq 1 ]; then
    log "[DRY-RUN] rm -rf $CURSOR_USER/Local Storage $CURSOR_USER/IndexedDB $CURSOR_USER/CachedData $CURSOR_USER/logs"
    log "[DRY-RUN] rm -rf $CURSOR_USER/workspaceStorage"
else
    rm -rf "$CURSOR_USER/Local Storage" "$CURSOR_USER/IndexedDB" "$CURSOR_USER/CachedData" "$CURSOR_USER/logs"
    rm -rf "$CURSOR_USER/workspaceStorage"
fi

# 4. SQLITE SCRUBBING
if [ -f "$GLOBAL_DB" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] sqlite3 $GLOBAL_DB -- scrub machine ids"
    else
        sqlite3 -batch "$GLOBAL_DB" <<EOF
DELETE FROM ItemTable WHERE key LIKE '%machineId%';
DELETE FROM ItemTable WHERE key LIKE '%macMachineId%';
DELETE FROM ItemTable WHERE key LIKE '%devDeviceId%';
DELETE FROM ItemTable WHERE key LIKE '%sqm.userid%';
DELETE FROM cursorDiskKV WHERE key LIKE '%machineId%';
VACUUM;
EOF
    fi
fi

# 5. JSON IDENTITY RESET
NEW_UUID=$(cat /proc/sys/kernel/random/uuid)
NEW_HEX=$(openssl rand -hex 32)
cat <<EOF > "$CURSOR_USER/globalStorage/storage.json"
{
  "telemetry.machineId": "$NEW_HEX",
  "telemetry.macMachineId": "$NEW_HEX",
  "telemetry.devDeviceId": "$NEW_UUID"
}
EOF

# 6. SYSTEM DNA SPOOFING (D-Bus Timeout Fixed)
NEW_HOST="dev-$(openssl rand -hex 3)"

# Update /etc/hosts idempotently and only when needed
if grep -q -F "127.0.1.1 $NEW_HOST" /etc/hosts 2>/dev/null; then
    log "/etc/hosts already contains entry for $NEW_HOST; skipping hosts update"
else
    log "Backing up /etc/hosts to /etc/hosts.bak and adding $NEW_HOST"
    sudo cp /etc/hosts /etc/hosts.bak 2>/dev/null || true
    sudo awk '!/^127\\.0\\.1\\.1 dev-/' /etc/hosts.bak | sudo tee /etc/hosts >/dev/null || true
    sudo sh -c "printf '127.0.1.1 %s\n' \"$NEW_HOST\" >> /etc/hosts"
    log "/etc/hosts updated with $NEW_HOST"
fi

# Direct low-level Kernel injection to bypass systemd-hostnamed timeouts
run_or_log "sudo sh -c 'echo \"$NEW_HOST\" > /proc/sys/kernel/hostname'"
run_or_log "sudo sh -c 'echo \"$NEW_HOST\" > /etc/hostname'"

# Rotate machine IDs without hard breaking local environment links
run_or_log "sudo rm /etc/machine-id /var/lib/dbus/machine-id 2>/dev/null || true"
run_or_log "sudo systemd-machine-id-setup && sudo ln -sf /etc/machine-id /var/lib/dbus/machine-id"

# 7. MULTI-INTERFACE MAC SPOOFING
ACTIVE_INTERFACES=$(ip link show up | awk -F: '$2 ~ /^[[:space:]]*(wlan|wlx|en|eth)/ {print $2}' | tr -d ' ')
echo "[*] Randomizing MAC addresses for all active paths..."
for INT in $ACTIVE_INTERFACES; do
    echo "    -> Target: $INT"
    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] ip link set $INT down"
    else
        sudo ip link set "$INT" down 2>/dev/null || log "[!] ip link down failed for $INT"
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] macchanger -r $INT"
    else
        sudo macchanger -r "$INT" 2>/dev/null || log "[!] macchanger failed for $INT"
    fi
    sleep 0.5

    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] ip link set $INT up"
    else
        sudo ip link set "$INT" up 2>/dev/null || log "[!] ip link up failed for $INT"
    fi
    sleep 0.5
done

# 8. HARDWARE MASKING (optional and unsafe) -- disabled by default
if [ "${ENABLE_HW_MASKING:-0}" = "1" ]; then
    FAKE_HW_UUID=$(cat /proc/sys/kernel/random/uuid)
    echo "$FAKE_HW_UUID" > /tmp/fake_uuid
    # Unmount existing bind if present
    if grep -q '/sys/class/dmi/id/product_uuid' /proc/mounts 2>/dev/null; then
        if [ "$DRY_RUN" -eq 1 ]; then
            log "[DRY-RUN] would umount /sys/class/dmi/id/product_uuid"
        else
            sudo umount /sys/class/dmi/id/product_uuid 2>/dev/null || true
        fi
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
        log "[DRY-RUN] would mount --bind /tmp/fake_uuid /sys/class/dmi/id/product_uuid"
    else
        sudo mount --bind /tmp/fake_uuid /sys/class/dmi/id/product_uuid 2>/dev/null || echo "[!] Bind mount failed; skipping hardware masking."
    fi
else
    echo "[*] Hardware masking skipped (set ENABLE_HW_MASKING=1 to enable)."
fi

echo "------------------------------------------------"
echo "PHASE: Cycle Airplane Mode on your Hotspot device to get a new IP, then login."
echo "------------------------------------------------"
read -p "Once logged in to your NEW account, press [Enter] to RESTORE history..."

# 9. RESTORE HISTORY (Safe, Verified closed state)
echo "[-] Closing down accidental background instances..."
CURSOR_PIDS_9=$(pgrep -f "cursor" | grep -v $$)
if [ -n "$CURSOR_PIDS_9" ]; then
    echo "$CURSOR_PIDS_9" | xargs sudo kill -9 2>/dev/null
    sleep 1
fi

echo "[-] Restoring stashed history and workspace data..."
if [ "$DRY_RUN" -eq 1 ]; then
    log "[DRY-RUN] cp -rf $BACKUP_DIR/workspaceStorage $CURSOR_USER/"
    log "[DRY-RUN] cp -rf $BACKUP_DIR/IndexedDB $CURSOR_USER/"
else
    cp -rf "$BACKUP_DIR/workspaceStorage" "$CURSOR_USER/" 2>/dev/null
    cp -rf "$BACKUP_DIR/IndexedDB" "$CURSOR_USER/" 2>/dev/null
fi

# Clean permissions up for 'kenken' to remove any root footprint anomalies
if [ "$DRY_RUN" -eq 1 ]; then
    log "[DRY-RUN] sudo chown -R $(whoami):$(whoami) $CURSOR_USER/workspaceStorage $CURSOR_USER/IndexedDB"
else
    sudo chown -R $(whoami):$(whoami) "$CURSOR_USER/workspaceStorage" "$CURSOR_USER/IndexedDB" 2>/dev/null
fi

echo "[FINISH] Reset complete. Current Host: $NEW_HOST"
