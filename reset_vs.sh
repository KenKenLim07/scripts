#!/bin/bash

# --- CONFIG ---
WIFI_INT="wlx90de80619e41"
VSCODE_USER="$HOME/.config/Visual Studio Code/User"
BACKUP_DIR="$HOME/vscode_history_backup"

echo "[!] VS Code Hardcore Reset Initiated..."
sudo -v

# 1. Kill VS Code & Related Processes
echo "[-] Killing all Code-related processes..."
pkill -f "visual-studio-code"
pkill -f "code"
pkill -f "codex"
sleep 2

# 2. Stash History (Backup)
if [ -d "$VSCODE_USER/workspaceStorage" ]; then
    echo "[-] Stashing chat history..."
    mkdir -p "$BACKUP_DIR"
    cp -r "$VSCODE_USER/workspaceStorage" "$BACKUP_DIR/"
    echo "    [OK] History backed up."
fi

# 3. Nuclear Wipe (Tokens & Cache)
echo "[-] Wiping session tokens and telemetry logs..."
rm -rf "$VSCODE_USER/workspaceStorage"
rm -rf "$VSCODE_USER/Local Storage"
rm -rf "$VSCODE_USER/IndexedDB"
rm -rf "$VSCODE_USER/CachedData"
rm -rf "$VSCODE_USER/logs"
rm -rf "$VSCODE_USER/User/History"
# Clean system temp telemetry
sudo rm -rf /tmp/vscode-*
sudo rm -rf /tmp/vscodium-*

# 4. SQLite Scrubbing (Deep Identity Purge)
if [ -f "$VSCODE_USER/globalStorage/state.vscdb" ]; then
    echo "[-] Scrubbing Identity from Database..."
sqlite3 -batch "$VSCODE_USER/globalStorage/state.vscdb" <<EOF
DELETE FROM ItemTable WHERE key LIKE '%machineId%';
DELETE FROM ItemTable WHERE key LIKE '%macMachineId%';
DELETE FROM ItemTable WHERE key LIKE '%devDeviceId%';
DELETE FROM ItemTable WHERE key LIKE '%sqm.userid%';
VACUUM;
EOF
    echo "    [OK] DB Scrubbed."
fi

# 5. JSON Reset (Randomized)
echo "[-] Generating New JSON IDs..."
NEW_UUID=$(cat /proc/sys/kernel/random/uuid)
NEW_HEX=$(openssl rand -hex 32)
mkdir -p "$VSCODE_USER/globalStorage"
cat <<EOF > "$VSCODE_USER/globalStorage/storage.json"
{
  "telemetry.machineId": "$NEW_HEX",
  "telemetry.macMachineId": "$NEW_HEX",
  "telemetry.devDeviceId": "$NEW_UUID"
}
EOF

# 6. System Identity (Verification + Hostname)
echo "[-] Old Machine ID: $(cat /etc/machine-id)"
sudo rm /etc/machine-id /var/lib/dbus/machine-id 2>/dev/null
sudo systemd-machine-id-setup && sudo ln -sf /etc/machine-id /var/lib/dbus/machine-id
echo "[-] New Machine ID: $(cat /etc/machine-id)"

# Randomize Hostname (To avoid network-level fingerprinting)
OLD_HOSTNAME=$(hostname)
NEW_HOSTNAME="parrot-$(openssl rand -hex 4)"
echo "[-] Changing Hostname: $OLD_HOSTNAME -> $NEW_HOSTNAME"
sudo hostnamectl set-hostname "$NEW_HOSTNAME"
sed -i "s/$OLD_HOSTNAME/$NEW_HOSTNAME/g" /etc/hosts

# Change MAC Address
sudo ip link set $WIFI_INT down
sudo macchanger -r $WIFI_INT
sudo ip link set $WIFI_INT up

echo "------------------------------------------------"
echo "HARDCORE STEP: REBOOT YOUR ROUTER / TOGGLE HOTSPOT"
echo "Your new IP must be completely different."
echo "------------------------------------------------"
read -p "Once you have a NEW IP, press [Enter] to login..."

# 7. Restore History
if [ -d "$BACKUP_DIR/workspaceStorage" ]; then
    echo "[-] Restoring history..."
    cp -r "$BACKUP_DIR/workspaceStorage" "$VSCODE_USER/"
    echo "    [OK] History restored."
fi

echo "[FINISH] Hardcore Reset complete. Use an Incognito window for the link!"
