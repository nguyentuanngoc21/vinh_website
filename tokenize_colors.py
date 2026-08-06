#!/usr/bin/env python3
"""
Replace hardcoded hex color values with design-token references across the
Vinh codebase. Only touches hex codes present in color_map.json (the ~30
structurally-repeated brand/system colors) — one-off decorative hex values
(e.g. per-genre tag colors) are intentionally left untouched.

Two kinds of replacement:
1. Tailwind arbitrary-value brackets: `[#HEX]` -> `token-name`
   e.g.  bg-[#143B4D]      -> bg-brand-ink
         hover:text-[#A9781A]/60 -> hover:text-brand-gold-dark/60
2. Raw quoted hex strings (JSX attrs like fill="#HEX", color={"#HEX"},
   inline style values): "#HEX" -> "var(--color-token-name)"
   (handles both single and double quotes)
"""
import json
import re
import sys
from pathlib import Path

MAP_PATH = Path(__file__).parent / "color_map.json"
SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src")
DRY_RUN = "--apply" not in sys.argv

with open(MAP_PATH) as f:
    raw_map = json.load(f)

# normalize keys to uppercase hex without '#'
color_map = {k.upper(): v for k, v in raw_map.items()}

# Build regex for bracket form: \[#HEX\]  (case-insensitive on hex)
hex_alt = "|".join(re.escape(h) for h in color_map)
bracket_re = re.compile(r"\[#(" + hex_alt + r")\]", re.IGNORECASE)
quoted_re = re.compile(r"([\"'])#(" + hex_alt + r")\1", re.IGNORECASE)

def bracket_sub(m):
    hexval = m.group(1).upper()
    token = color_map[hexval]
    return token

def quoted_sub(m):
    quote = m.group(1)
    hexval = m.group(2).upper()
    token = color_map[hexval]
    return f'{quote}var(--color-{token}){quote}'

exts = {".ts", ".tsx"}
files = [p for p in SRC_DIR.rglob("*") if p.suffix in exts]

total_bracket = 0
total_quoted = 0
changed_files = []

for path in files:
    text = path.read_text(encoding="utf-8")
    new_text, n1 = bracket_re.subn(bracket_sub, text)
    new_text2, n2 = quoted_re.subn(quoted_sub, new_text)
    if n1 or n2:
        changed_files.append((str(path), n1, n2))
        total_bracket += n1
        total_quoted += n2
        if not DRY_RUN:
            path.write_text(new_text2, encoding="utf-8")

print(f"{'DRY RUN — ' if DRY_RUN else ''}Files touched: {len(changed_files)}")
print(f"Bracket-form replacements ([#HEX] -> token): {total_bracket}")
print(f"Quoted-string replacements (\"#HEX\" -> var(--color-token)): {total_quoted}")
print()
for f, n1, n2 in sorted(changed_files, key=lambda x: -(x[1] + x[2]))[:20]:
    print(f"  {f}: {n1} bracket, {n2} quoted")
