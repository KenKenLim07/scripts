#!/usr/bin/env python3
"""Concatenate hooks/cheat/*.js modules into hooks/trident_cheat.js."""
from __future__ import annotations

from pathlib import Path

CHEAT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CHEAT_DIR.parent.parent
OUT = PROJECT_DIR / "hooks" / "trident_cheat.js"

MANIFEST = [
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

def bundle_cheat_source() -> str:
    parts: list[str] = []
    for name in MANIFEST:
        path = CHEAT_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"Missing cheat module: {path}")
        text = path.read_text(encoding="utf-8")
        parts.append(text.rstrip("\n"))
    return "\n\n".join(parts) + "\n"


def main() -> None:
    out_text = bundle_cheat_source()
    OUT.write_text(out_text, encoding="utf-8")
    print(f"Wrote {OUT} ({len(out_text.splitlines())} lines)")


if __name__ == "__main__":
    main()
