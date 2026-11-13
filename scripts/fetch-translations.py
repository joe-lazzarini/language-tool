#!/usr/bin/env python3
"""Fill scripts/cache/wiki-forms.json from English Wiktionary.

Reads concept ids from public/data/catalog.json (run `npm run deck` once first).
Safe to re-run: concepts already in the cache are skipped, including misses.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from extra_langs import BASE_LANGS, CACHE
from registry import load_registry

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "catalog.json"
API = "https://en.wiktionary.org/w/api.php"
USER_AGENT = "SlowkaDeckBuilder/1.0 (https://github.com/joe-lazzarini/language-tool; educational deck)"

GENDER = {
    "m": "masculine",
    "f": "feminine",
    "n": "neuter",
    "c": "common",
    "mf": "common",
    "m-an": "masculine",
    "m-in": "masculine",
}
SKIP_QUAL = re.compile(
    r"humorous|archaic|obsolete|rare|dated|colloquial|slang|diminutive|figurative|pejorative|attributive",
    re.I,
)
TEMPLATE = re.compile(r"\{\{(?:tt|t)\+?\|([a-z]{2,3})\|([^|}]+)([^}]*)\}\}")
LINE = re.compile(r"^\*\s*([^:\n]+):\s*(.*)$")
QUAL_AFTER = re.compile(r"^\s*\{\{(?:q|qual|qualifier)\|([^}]+)\}\}")


def fetchable(concept: str) -> bool:
    if not concept or len(concept) > 48:
        return False
    return not any(ch in concept for ch in "()[]{}|/\\")


def fetch_wikitext(title: str) -> str | None:
    params = urllib.parse.urlencode(
        {
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "format": "json",
            "redirects": "1",
        }
    )
    request = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code in {429, 503, 500} and attempt < 3:
                time.sleep(2 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError):
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
                continue
            return None
    else:
        return None
    if payload.get("error"):
        return None
    return (payload.get("parse") or {}).get("wikitext", {}).get("*")


def english_section(text: str) -> str:
    match = re.search(r"^==\s*English\s*==\s*$", text, re.M)
    if not match:
        return ""
    rest = text[match.end() :]
    nxt = re.search(r"^==[^=]", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def first_block(section: str) -> str:
    match = re.search(r"^={3,}\s*Translations\s*={3,}\s*$", section, re.M)
    if not match:
        return ""
    rest = section[match.end() :]
    nxt = re.search(r"^={2,4}[^=]", rest, re.M)
    body = rest[: nxt.start()] if nxt else rest
    top = body.find("{{trans-top")
    if top < 0:
        return ""
    chunk = body[top:]
    end = len(chunk)
    bottom = chunk.find("{{trans-bottom}}")
    second = chunk.find("{{trans-top", len("{{trans-top"))
    if bottom >= 0:
        end = min(end, bottom)
    if second >= 0:
        end = min(end, second)
    return chunk[:end]


def latin_romaji(tr: str) -> str | None:
    for part in re.split(r"[,;/]", tr):
        part = part.strip()
        if not part:
            continue
        if re.search(r"[A-Za-z]", part) and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", part):
            return part
    return None


def parse_params(rest: str) -> tuple[str | None, str | None, bool]:
    gender = None
    tr = None
    plural = False
    for part in rest.split("|"):
        part = part.strip()
        if not part:
            continue
        if part.startswith("tr="):
            tr = part[3:].strip()
            continue
        value = part.split("=", 1)[-1].strip() if "=" in part else part
        if value == "p":
            plural = True
        elif value in GENDER and not gender:
            gender = GENDER[value]
    return gender, tr, plural


def parse_block(block: str, names: dict[str, str], wanted: set[str]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    if not block or "translation subpage" in block and "{{t" not in block:
        return out
    for raw in block.splitlines():
        match = LINE.match(raw.strip())
        if not match:
            continue
        code = names.get(match.group(1).strip())
        if not code or code not in wanted or out.get(code):
            continue
        chunk = match.group(2)
        answers: list[dict] = []
        cursor = 0
        for found in TEMPLATE.finditer(chunk):
            natives = [item for item in answers if item.get("context") != "romanization"]
            if len(natives) >= 3:
                break
            between = chunk[cursor : found.start()]
            end = found.end()
            qual_after = QUAL_AFTER.match(chunk[end:])
            qual_before = re.search(r"\{\{(?:q|qual|qualifier)\|([^}]+)\}\}\s*$", between)
            qual = (qual_after.group(1) if qual_after else None) or (qual_before.group(1) if qual_before else None)
            if qual and SKIP_QUAL.search(qual):
                cursor = end
                continue
            gender, tr, plural = parse_params(found.group(3))
            if plural:
                cursor = end
                continue
            text = found.group(2).replace("_", " ").strip()
            if not text or len(text) > 40 or text.count(" ") > 3 or "{" in text:
                cursor = end
                continue
            row = {"text": text}
            if gender:
                row["context"] = gender
            answers.append(row)
            romaji = latin_romaji(tr) if tr else None
            if romaji and code == "ja" and romaji.casefold() != text.casefold():
                answers.append({"text": romaji, "context": "romanization"})
            cursor = end + (qual_after.end() if qual_after else 0)
        if answers:
            out[code] = answers
    return out


def translations_for(title: str, names: dict[str, str], wanted: set[str]) -> dict[str, list[dict]]:
    main = fetch_wikitext(title)
    time.sleep(0.12)
    if not main:
        return {}
    section = english_section(main)
    parsed = parse_block(first_block(section), names, wanted)
    if "translation subpage" in section or not parsed:
        sub = fetch_wikitext(f"{title}/translations")
        time.sleep(0.12)
        if sub:
            sub_parsed = parse_block(first_block(english_section(sub)), names, wanted)
            if len(sub_parsed) > len(parsed):
                return sub_parsed
    return parsed


def concepts() -> list[str]:
    if not CATALOG.exists():
        raise SystemExit("Missing public/data/catalog.json. Run npm run deck first.")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    found = sorted({entry.get("concept") or "" for entry in catalog["entries"]})
    return [item for item in found if fetchable(item)]


def main() -> None:
    registry = load_registry()
    wanted = {item["code"] for item in registry if item["code"] not in BASE_LANGS}
    names: dict[str, str] = {}
    for item in registry:
        names[item["wiktionary"]] = item["code"]
        for alias in item["aliases"]:
            names[alias] = item["code"]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    pending = [item for item in concepts() if item not in cache]
    print(f"{len(pending)} concepts to fetch, {len(cache)} already cached", flush=True)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for index, concept in enumerate(pending, start=1):
        try:
            cache[concept] = translations_for(concept, names, wanted)
        except Exception as error:  # noqa: BLE001 — keep the cache and continue
            print(f"  fail {concept}: {error}", flush=True)
            continue
        if index % 20 == 0 or index == len(pending):
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            filled = sum(1 for item in cache.values() if item)
            print(f"  {index}/{len(pending)} ({filled} with a hit)", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("wrote", CACHE, flush=True)


if __name__ == "__main__":
    main()
