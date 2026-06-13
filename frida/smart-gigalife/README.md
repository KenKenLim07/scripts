# Smart / GigaLife — Frida instrumentation

Frida hooks for the Smart app (GigaLife binary) on jailbroken iPhone.

## Layout

```
frida/smart-gigalife/
├── frida-smart.sh      # main runner
├── hooks/smart_hook.js # Frida instrumentation
├── config/
│   ├── env.example     # template
│   └── frida.env       # your settings (create locally, gitignored)
└── logs/
    ├── smart_log.txt   # capture output
    └── .frida_tunnel.pid
```

## Quick start

```bash
# From anywhere (if wrapper on PATH):
frida-smart.sh

# Or directly:
~/dev/scripts/frida/smart-gigalife/frida-smart.sh
tail -f ~/dev/scripts/frida/smart-gigalife/logs/smart_log.txt
```

## iPhone prerequisites

- Dopamine jailbreak, frida-server 17.9.1 via LaunchDaemon
- SSH enabled (`mobile@<iphone-ip>`)

After reboot, on iPhone as root:

```bash
launchctl load /var/jb/Library/LaunchDaemons/re.frida.server.plist
```

## Config

```bash
cp config/env.example config/frida.env
# edit FRIDA_IPHONE_HOST, optional FRIDA_SSH_PASS
```

## Commands

| Command | Description |
|---------|-------------|
| `frida-smart.sh` | Attach + log to `logs/smart_log.txt` |
| `frida-smart.sh --fg` | Live terminal output |
| `frida-smart.sh --ps` | List device processes |
| `frida-smart.sh --stop` | Kill SSH tunnel |

**Security:** logs contain JWT tokens and MSISDN — do not commit or share.
