"""Read the language registry from src/lib/languages.ts.

The deck build treats that file as the source of truth. The first fields of each
object must stay in this order: code, name, nativeName, wiktionary, wiktionaryAliases.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "src" / "lib" / "languages.ts"

PATTERN = re.compile(
    r"\{\s*"
    r'code:\s*"(?P<code>[a-z]{2})",\s*'
    r'name:\s*"(?P<name>[^"]+)",\s*'
    r'nativeName:\s*"(?P<native>[^"]+)",\s*'
    r'wiktionary:\s*"(?P<wiki>[^"]+)",\s*'
    r"wiktionaryAliases:\s*\[(?P<aliases>[^\]]*)\]",
    re.M,
)


def load_registry() -> list[dict]:
    text = REGISTRY.read_text(encoding="utf-8")
    found: list[dict] = []
    for match in PATTERN.finditer(text):
        aliases = re.findall(r'"([^"]+)"', match.group("aliases"))
        found.append(
            {
                "code": match.group("code"),
                "name": match.group("name"),
                "nativeName": match.group("native"),
                "wiktionary": match.group("wiki"),
                "aliases": aliases,
            }
        )
    if len(found) < 2:
        raise SystemExit(f"Could not read languages from {REGISTRY}")
    return found
