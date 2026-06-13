#!/usr/bin/env python3
"""Attach test — Trident only by default (won't crash Smart)."""
import argparse
import subprocess
import sys
import time

import frida

HOST = "127.0.0.1:27042"
BUNDLE = "com.earlymorningstudio.trident"
SMART = "ph.com.smart.Smart"
ATTACH_WAIT = 20


def restart_frida_server_ssh():
    """Best-effort frida-server restart via shared env SSH."""
    env_file = __file__.replace(
        "frida/trident/frida-attach-test.py", "frida/config/frida.env"
    )
    host = "192.168.254.133"
    user = "mobile"
    password = None
    try:
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("export FRIDA_IPHONE_HOST="):
                    host = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("export FRIDA_IPHONE_USER="):
                    user = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("export FRIDA_SSH_PASS="):
                    password = line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass

    remote = (
        "export PATH=/var/jb/usr/sbin:/var/jb/bin:/usr/sbin:/usr/bin:/sbin:/bin;"
        "PLIST=/var/jb/Library/LaunchDaemons/re.frida.server.plist;"
        "launchctl unload $PLIST 2>/dev/null; sleep 1;"
        "launchctl load $PLIST 2>/dev/null; sleep 2;"
        "ps aux | grep -v grep | grep frida-server && echo RESTART_OK"
    )
    ssh = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8",
           f"{user}@{host}", remote]
    if password:
        ssh = ["sshpass", "-p", password] + ssh
    try:
        out = subprocess.run(ssh, capture_output=True, text=True, timeout=20)
        if "RESTART_OK" in (out.stdout or ""):
            print("[*] frida-server restarted on iPhone")
            time.sleep(2)
            return True
    except Exception as e:
        print(f"[!] Could not restart frida-server via SSH: {e}")
    return False


def find_pid(device, bundle):
    for app in device.enumerate_applications():
        if app.identifier == bundle and app.pid:
            return app.pid, app.name or bundle
    return None, None


def try_attach(device, pid, label):
    print(f"  … attaching {label} (pid {pid})...", flush=True)
    try:
        session = device.attach(pid, persist_timeout=ATTACH_WAIT)
        session.detach()
        print(f"  OK  attach {label}")
        return True
    except Exception as e:
        print(f"  FAIL attach {label}: {e}")
        if "end-of-stream" in str(e).lower():
            print("       → frida-server OR target app crashed (Dopamine 2.4 + Frida 17 bug)")
            print("       → restart frida-server on iPhone before retrying")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-smart", action="store_true",
                        help="also test Smart (can crash the app — avoid)")
    parser.add_argument("--restart-server", action="store_true", default=True)
    args = parser.parse_args()

    if args.restart_server:
        restart_frida_server_ssh()

    print(f"[*] Connect {HOST}")
    try:
        device = frida.get_device_manager().add_remote_device(HOST)
    except Exception as e:
        print(f"[x] Cannot connect: {e}")
        print("    frida-trident.sh --stop && frida-doctor.sh")
        sys.exit(1)

    print(f"[*] PC frida-python {frida.__version__}")

    tri_pid, tri_name = find_pid(device, BUNDLE)
    print(f"[*] Trident: pid={tri_pid or 'NOT RUNNING'} {tri_name or ''}")

    if not tri_pid:
        print("[x] Open Vampire's Fall 2 on main menu, then retry")
        sys.exit(1)

    if args.with_smart:
        smart_pid, _ = find_pid(device, SMART)
        if smart_pid:
            try_attach(device, smart_pid, "Smart")
            restart_frida_server_ssh()
            time.sleep(2)
            device = frida.get_device_manager().add_remote_device(HOST)
            tri_pid, tri_name = find_pid(device, BUNDLE)
            if not tri_pid:
                print("[x] Trident closed — reopen and retry")
                sys.exit(1)

    if try_attach(device, tri_pid, tri_name or "Trident"):
        print("[*] SUCCESS → frida-trident.sh --late-cheat")
        sys.exit(0)

    print("""
[x] Attach failed — this is a Dopamine + Frida 17 issue, not your hooks.

iPhone (pick one path):

  A) Update Dopamine to latest 2.4.2+ (dyld fix)
     Settings → Hide Jailbreak ON
     Restart Userspace

  B) Downgrade Frida to 16.1.4 (most reliable on Dopamine):
     PC:  ~/dev/scripts/frida-downgrade-16.sh
     iPhone: same script prints SSH steps

  C) Dopamine 2.4 spinlock crash — downgrade Dopamine to 2.2.2
     (only if A+B fail)

After ANY failed attach, frida-server must restart:
  frida-trident.sh --recover
""")
    sys.exit(1)


if __name__ == "__main__":
    main()
