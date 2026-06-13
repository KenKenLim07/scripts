#!/usr/bin/env python3
"""
Attach WITHOUT -l first, then load hook script in-process.
Dopamine-safe path + Smart-style log file.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import frida

PROJECT_DIR = Path(__file__).resolve().parent
SHARED_ENV = PROJECT_DIR.parent / "config" / "frida.env"
DEFAULT_HOST = "127.0.0.1:27042"
DEFAULT_BUNDLE = "com.earlymorningstudio.trident"
HOOK_JS = PROJECT_DIR / "hooks" / "trident_hook.js"
CHEAT_JS = PROJECT_DIR / "hooks" / "trident_cheat.js"
CHEAT_DIR = PROJECT_DIR / "hooks" / "cheat"
LOG_FILE = PROJECT_DIR / "logs" / "trident_log.txt"


def load_cheat_source() -> str:
    """Load cheat JS from bundled file or concatenate hooks/cheat modules."""
    bundle_script = CHEAT_DIR / "bundle.py"
    if bundle_script.is_file():
        import importlib.util

        spec = importlib.util.spec_from_file_location("trident_cheat_bundle", bundle_script)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if hasattr(mod, "bundle_cheat_source"):
                return mod.bundle_cheat_source()
    manifest = [
        "00-header.js",
        "01-config.js",
        "02-core.js",
        "03-xp.js",
        "04-damage.js",
        "05-combat.js",
        "06-dungeon.js",
        "07-mythic.js",
        "08-chest.js",
        "09-forge-diag.js",
        "10-install.js",
    ]
    parts: list[str] = []
    for name in manifest:
        path = CHEAT_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"Missing cheat module: {path}")
        parts.append(path.read_text(encoding="utf-8").rstrip("\n"))
    return "\n\n".join(parts) + "\n"
ATTACH_TIMEOUT_S = 45
MAX_ATTEMPTS = 3

WRITE_LOG = False
TEE = False


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for path in (SHARED_ENV, PROJECT_DIR / "config" / "frida.env"):
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line.startswith("export "):
                        continue
                    key, _, val = line[7:].partition("=")
                    env[key.strip()] = val.strip().strip('"').strip("'")
        except OSError:
            pass
    return env


def restart_frida_server() -> bool:
    script = PROJECT_DIR.parent / "lib" / "restart-server.sh"
    if not script.is_file():
        return False
    try:
        out = subprocess.run(
            ["bash", str(script)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        emit(out.stdout.strip())
        return out.returncode == 0
    except Exception:
        return False


def emit(line: str) -> None:
    if not line:
        return
    if TEE or not WRITE_LOG:
        print(line, flush=True)
    if WRITE_LOG:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
            f.flush()


def on_script_log(level: str, text: str) -> None:
    """console.log from hook JS — goes here, NOT always through on_message."""
    emit(text)


def extract_log_line(message: dict) -> str | None:
    """Frida 16 wraps console.log in type=send with nested payload."""
    mtype = message.get("type")
    if mtype == "log":
        p = message.get("payload", "")
        return str(p) if p is not None else None
    if mtype == "send":
        p = message.get("payload")
        if isinstance(p, str):
            return p
        if isinstance(p, dict):
            inner = p.get("payload")
            if inner is not None:
                return str(inner)
            if p.get("type") == "log":
                return str(p.get("payload", ""))
        if isinstance(p, list) and len(p) >= 2:
            return str(p[1])
    if mtype == "error":
        desc = message.get("description", str(message))
        stack = message.get("stack", "")
        return f"[frida error] {desc}\n{stack}" if stack else f"[frida error] {desc}"
    return None


def on_message(message, data) -> None:
    line = extract_log_line(message)
    if line:
        emit(line)
    elif message.get("type") not in ("log", "send", "error"):
        emit(str(message))


def connect_device(host: str) -> frida.core.Device:
    emit(f"[*] Connecting to {host}...")
    dm = frida.get_device_manager()
    try:
        device = dm.add_remote_device(host)
        list(device.enumerate_applications())  # ping frida-server
        return device
    except Exception as e:
        raise SystemExit(f"Cannot reach frida-server at {host}: {e}\n"
                         "  Run: frida-trident.sh --recover") from e


def find_app(device: frida.core.Device, bundle: str) -> tuple[int, str]:
    for app in device.enumerate_applications():
        if app.identifier == bundle and app.pid:
            return app.pid, app.name or bundle
    for proc in device.enumerate_processes():
        name = proc.name or ""
        if bundle in name or "trident" in name.lower() or "vampire" in name.lower():
            return proc.pid, name
    raise SystemExit(
        f"Game not running: {bundle}\n"
        "  Open Vampire's Fall 2 on main menu (foreground), then retry."
    )


def attach_session(device: frida.core.Device, host: str, bundle: str, pid: int) -> frida.core.Session:
    last_err: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        emit(f"[*] Attach attempt {attempt}/{MAX_ATTEMPTS} pid={pid} ({ATTACH_TIMEOUT_S}s)...")
        try:
            return device.attach(pid, persist_timeout=ATTACH_TIMEOUT_S)
        except (frida.TransportError, frida.TimedOutError, frida.NotSupportedError) as e:
            last_err = e
            emit(f"[!] Attach failed: {e}")
            if attempt < MAX_ATTEMPTS:
                emit("[*] Restarting frida-server on iPhone...")
                if restart_frida_server():
                    emit("[*] frida-server restarted — waiting 3s...")
                    time.sleep(3)
                    device = connect_device(host)
                    pid, _ = find_app(device, bundle)
                else:
                    emit("[!] Could not restart frida-server via SSH")
                    time.sleep(2)
    raise SystemExit(
        f"Attach failed after {MAX_ATTEMPTS} attempts: {last_err}\n\n"
        "On iPhone:\n"
        "  1. Force-quit Vampire's Fall 2\n"
        "  2. Dopamine → Hide Jailbreak ON\n"
        "  3. Reopen game → main menu (foreground, screen on)\n"
        "  4. PC: frida-trident.sh --recover\n"
        "  5. PC: frida-trident.sh --attach-test\n"
        "If attach-test fails → downgrade Frida: ~/dev/scripts/frida-downgrade-16.sh"
    ) from last_err


def main() -> None:
    global WRITE_LOG, TEE
    parser = argparse.ArgumentParser(description="Late-load Frida hooks for Trident")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--bundle", default=DEFAULT_BUNDLE)
    parser.add_argument("--cheat", action="store_true")
    parser.add_argument("--trace", action="store_true",
                        help="with --cheat: invoke trace during drop window")
    parser.add_argument("--diag", action="store_true",
                        help="with --cheat: dump LootBag..ctor params + backtrace")
    parser.add_argument("--log-file", action="store_true")
    parser.add_argument("--tee", action="store_true")
    parser.add_argument("--no-preflight", action="store_true",
                        help="skip frida-server restart before attach")
    parser.add_argument("--eval", metavar="JS",
                        help="run JS in hook context ~8s after load (e.g. tridentSetPlaytime(200))")
    args = parser.parse_args()

    WRITE_LOG = args.log_file or args.tee
    TEE = args.tee

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if WRITE_LOG:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 60}\n")
            f.write(f"[trident:session] started {ts} bundle={args.bundle}\n")

    if not HOOK_JS.is_file():
        raise SystemExit(f"Missing hook: {HOOK_JS}")

    emit(f"[*] PC frida {frida.__version__}")

    if not args.no_preflight:
        emit("[*] Preflight: restart frida-server...")
        restart_frida_server()
        time.sleep(2)

    device = connect_device(args.host)
    pid, name = find_app(device, args.bundle)
    emit(f"[*] Target: {name} pid={pid}")

    session = attach_session(device, args.host, args.bundle, pid)
    emit("[*] Attached OK — loading hooks...")

    source = HOOK_JS.read_text(encoding="utf-8")
    if args.cheat:
        if not CHEAT_JS.is_file():
            raise SystemExit(f"Missing cheat: {CHEAT_JS}")
        cheat_src = load_cheat_source()
        trace_val = "true" if args.trace else "false"
        diag_val = "true" if args.diag else "false"
        cheat_src = cheat_src.replace(
            "/*TRIDENT_CHEAT_TRACE*/",
            "var TRIDENT_CHEAT_TRACE = " + trace_val + ";",
        )
        cheat_src = cheat_src.replace(
            "/*TRIDENT_CHEAT_DIAG*/",
            "var TRIDENT_CHEAT_DIAG = " + diag_val + ";",
        )
        source += "\n" + cheat_src
        mode = " (light)"
        if args.diag:
            mode = " + diag"
        elif args.trace:
            mode = " + trace"
        emit("[*] Cheat module included" + mode)

    script = session.create_script(source)
    script.on("message", on_message)
    script.set_log_handler(on_script_log)
    script.load()
    emit("[*] Hooks loaded — play on iPhone. Ctrl+C to stop.")
    if args.eval:
        def run_eval() -> None:
            time.sleep(8)
            emit(f"[*] Eval: {args.eval}")
            script.post({"type": "eval"}, args.eval)

        import threading
        threading.Thread(target=run_eval, daemon=True).start()
    if WRITE_LOG:
        emit(f"[*] Log file: {LOG_FILE}")
        if not TEE:
            emit(f"[*] Watch live: tail -f {LOG_FILE}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        emit("\n[*] Detaching...")
        session.detach()


if __name__ == "__main__":
    main()
