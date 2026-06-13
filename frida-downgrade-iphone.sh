#!/usr/bin/env bash
# Print iPhone downgrade steps (run ON THE IPHONE as root)
cat <<'EOF'
╔══════════════════════════════════════════════════════════════╗
║  Downgrade frida-server on iPhone (Dopamine rootless)        ║
╚══════════════════════════════════════════════════════════════╝

From PC:
  ssh mobile@192.168.254.133

On iPhone — MUST be root (not mobile):
  su root
  (password: alpine  — or what you set)

Then paste this whole block:

export PATH=/var/jb/usr/bin:/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin
PLIST=/var/jb/Library/LaunchDaemons/re.frida.server.plist
FRIDA_VER=16.1.4

launchctl unload "$PLIST" 2>/dev/null || true
sleep 1

cd /tmp
# wget is usually available on jailbroken iOS; curl may not be in PATH
if command -v curl >/dev/null; then
  curl -LO "https://github.com/frida/frida/releases/download/${FRIDA_VER}/frida_${FRIDA_VER}_iphoneos-arm64.deb"
elif command -v wget >/dev/null; then
  wget -O "frida_${FRIDA_VER}_iphoneos-arm64.deb" \
    "https://github.com/frida/frida/releases/download/${FRIDA_VER}/frida_${FRIDA_VER}_iphoneos-arm64.deb"
else
  echo "Install curl or wget from Sileo, then retry"
  exit 1
fi

dpkg -i "frida_${FRIDA_VER}_iphoneos-arm64.deb"
launchctl load "$PLIST"
sleep 2
/var/jb/usr/sbin/frida-server --version

Must print: 16.1.4

─── Alternative: Sileo ───
  1. Sileo → Sources → add https://build.frida.re
  2. Search "Frida" → install version 16.1.4 if listed
  3. Or remove Frida 17, install 16.1.4 deb from Filza

─── If dpkg not found ───
  which dpkg
  /var/jb/usr/bin/dpkg -i frida_16.1.4_iphoneos-arm64.deb

Back on PC (after iPhone shows 16.1.4):
  ~/dev/scripts/frida-downgrade-16.sh
  frida --version
  frida-trident.sh --recover
  frida-trident.sh

EOF
