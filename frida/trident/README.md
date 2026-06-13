# Vampire's Fall 2 — Frida (com.earlymorningstudio.trident)

Semi-offline RPG with online PvP. Hooks cover **network**, **SQLite**, **save files**, **UserDefaults**, and **engine detection**.

## Layout

```
frida/trident/
├── frida-trident.sh
├── frida-trident-late.py
├── hooks/
│   ├── trident_hook.js       # probes, save, HTTP, sqlite
│   ├── trident_cheat.js      # bundled output (do not edit by hand)
│   └── cheat/                # cheat source modules (edit these)
│       ├── bundle.py           # concat → trident_cheat.js
│       ├── 00-header.js
│       ├── 01-config.js        # toggles, RVA, offsets
│       ├── 02-core.js          # utils, battle/PvP gating, il2cpp
│       ├── 03-xp.js
│       ├── 04-damage.js
│       ├── 05-combat.js        # PvE crit/block/dodge/resist/focus
│       ├── 06-dungeon.js       # set chest + essence
│       ├── 07-mythic.js
│       ├── 08-chest.js
│       ├── 09-forge-diag.js    # forge 100%, loot trace, drop strings
│       └── 10-install.js
├── config/frida.env      ← create from env.example
└── logs/trident_log.txt
```

### Cheat module workflow

Edit files under `hooks/cheat/`, then bundle:

```bash
python3 hooks/cheat/bundle.py   # writes hooks/trident_cheat.js
```

`frida-trident.sh --cheat` runs the bundler automatically before attach.
Late attach (`frida-trident-late.py --cheat`) loads modules directly via the same manifest.

## Quick start

Same iPhone setup as Smart (frida-server 17.9.1 + SSH tunnel).

```bash
# From ~/dev/scripts
chmod +x frida-trident.sh frida/trident/frida-trident.sh
frida-trident.sh --ps          # confirm game appears when running

# Open game on iPhone, then:
frida-trident.sh
tail -f frida/trident/logs/trident_log.txt
```

## Exploration workflow (offline → online)

1. **Attach** with game on main menu (`frida-trident.sh`)
2. **Offline** — walk, fight, save:
   - `[trident:sqlite]` — local DB reads/writes
   - `[trident:file]` — save files under Documents/Library
   - `[trident:defaults]` — prefs / cached state
3. **Online** — PvP, login, sync:
   - `[trident:HTTP REQUEST]` — API endpoints
   - `[trident:json]` — parsed responses
4. **Engine** — first lines show Unity/Godot/native binary

## Config

```bash
cp config/env.example config/frida.env
```

## Commands

| Flag | Description |
|------|-------------|
| (none) | Attach + log to `logs/trident_log.txt` |
| `--fg` | Live Frida REPL output |
| `--ps` | List apps (find bundle/PID) |
| `--stop` | Kill SSH tunnel |

Use on **your device** for security research / learning only.
