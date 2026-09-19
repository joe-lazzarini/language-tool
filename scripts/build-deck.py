#!/usr/bin/env python3
"""Merge Polish KWJP lemmas and German UD-GSD lemmas into a multilingual deck."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PL_EN = Path(__file__).resolve().parent / "pl-en.json"
DE_LEMMAS = Path(__file__).resolve().parent / "de-lemmas.txt"
DE_GLOSSES = Path(__file__).resolve().parent / "de-glosses.tsv"
PL_DE = Path(__file__).resolve().parent / "pl-de.tsv"
OUT = ROOT / "public" / "data" / "words.json"

POS_OVERRIDE = {
    "bekennen": "verb",
    "aufheben": "verb",
    "verbreiten": "verb",
    "äußer": "adjective",
    "mittler": "adjective",
    "ober": "adjective",
}

LEMMA_OVERRIDE = {
    "äußer": "äußere",
    "mittler": "mittlere",
    "ober": "obere",
    "aufheben": "aufheben",
}


def accepted_from(en: str, extra: list[str] | None = None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []

    def add(value: str) -> None:
        value = re.sub(r"\s+", " ", value).strip(" \t.,;:()[]")
        value = value.strip("'\"")
        if not value or len(value) > 80:
            return
        key = value.casefold()
        if key in seen:
            return
        seen.add(key)
        out.append(value)
        if key.startswith("to ") and len(key) > 3:
            add(value[3:])
        for prefix in ("a ", "an ", "the "):
            if key.startswith(prefix):
                add(value[len(prefix) :])

    add(en)
    for part in re.split(r"[,;/]| or ", en):
        add(part)
    for item in extra or []:
        add(item)
    return out[:14]


def load_tsv(path: Path) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        mapping[parts[0]] = parts[1]
    return mapping


def load_german_lemmas() -> list[tuple[int, str, str]]:
    rows: list[tuple[int, str, str]] = []
    for raw in DE_LEMMAS.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(\d+)\.\s+(\S+)\s+(\S.*)$", raw.strip())
        if not m:
            continue
        rank = int(m.group(1))
        lemma = LEMMA_OVERRIDE.get(m.group(2), m.group(2))
        pos = POS_OVERRIDE.get(m.group(2), m.group(3).strip())
        rows.append((rank, lemma, pos))
    return rows


def form(text: str, accepted: list[str] | None = None) -> dict:
    extra = accepted_from(text, accepted)
    return {"text": text, "accepted": extra}


def main() -> None:
    polish = json.loads(PL_EN.read_text(encoding="utf-8"))["words"]
    de_gloss = load_tsv(DE_GLOSSES)
    pl_de = load_tsv(PL_DE)
    german = load_german_lemmas()[:1000]

    entries: list[dict] = []

    for word in polish:
        pl = word["pl"]
        entry = {
            "id": f"pl-{word['id']}",
            "pos": word["pos"],
            "ranks": {"pl": word["id"]},
            "forms": {
                "pl": form(pl, [pl]),
                "en": form(word["en"], word.get("accepted") or []),
            },
        }
        de = pl_de.get(pl)
        if de:
            entry["forms"]["de"] = form(de, [de])
        entries.append(entry)

    missing_gloss: list[str] = []
    for rank, lemma, pos in german:
        gloss = de_gloss.get(lemma) or de_gloss.get(lemma.casefold())
        if not gloss:
            missing_gloss.append(lemma)
            continue
        entries.append(
            {
                "id": f"de-{rank}",
                "pos": pos,
                "ranks": {"de": rank},
                "forms": {
                    "de": form(lemma, [lemma]),
                    "en": form(gloss),
                },
            }
        )

    def coverage(a: str, b: str) -> int:
        langs = {a, b}
        count = 0
        for entry in entries:
            if a not in entry["forms"] or b not in entry["forms"]:
                continue
            ranks = entry.get("ranks") or {}
            if langs == {"pl", "de"} and "pl" not in ranks:
                continue
            if langs == {"de", "en"} and "de" not in ranks:
                continue
            if langs == {"pl", "en"} and "pl" not in ranks:
                continue
            count += 1
        return count

    payload = {
        "meta": {
            "title": "English, Polish, and German lemma decks",
            "languages": [
                {"code": "en", "name": "English", "nativeName": "English"},
                {"code": "pl", "name": "Polish", "nativeName": "Polski"},
                {"code": "de", "name": "German", "nativeName": "Deutsch"},
            ],
            "coverage": {
                "en-pl": coverage("en", "pl"),
                "pl-en": coverage("pl", "en"),
                "en-de": coverage("en", "de"),
                "de-en": coverage("de", "en"),
                "pl-de": coverage("pl", "de"),
                "de-pl": coverage("de", "pl"),
            },
            "sources": {
                "polishFrequency": {
                    "name": "Wiktionary: Frequency lists/Polish/KWJP",
                    "url": "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP",
                    "corpus": "Korpus Współczesnego Języka Polskiego (KWJP), 2011–2020",
                    "note": "Lemmas merged across parts of speech and ranked by average reduced frequency.",
                    "citation": "W. Kieraś et al., Korpus Współczesnego Języka Polskiego. Dekada 2011–2020, Język Polski 105(2):5–20, 2025.",
                },
                "germanFrequency": {
                    "name": "Universal Dependencies German-GSD",
                    "url": "https://universaldependencies.org/treebanks/de_gsd/index.html",
                    "corpus": "UD German-GSD (CC BY-SA 4.0), Wikipedia and web documents",
                    "note": "Lemma frequencies computed from the UD German-GSD treebank. Inflected forms are collapsed to dictionary/citation lemmas. Most proper names, abbreviations, and foreign tokens were dropped so the deck stays one citation form per word.",
                    "citation": "McDonald et al., Universal Dependency Annotation for Multilingual Parsing, ACL 2013; UD German-GSD release.",
                },
                "glossSource": {
                    "name": "English Wiktionary",
                    "url": "https://en.wiktionary.org/",
                    "license": "CC BY-SA 4.0 / GFDL",
                },
            },
            "gaps": (
                "English↔Polish uses the 1000 KWJP lemmas. English↔German uses the 1000 UD-GSD lemmas. "
                "Polish↔German joins those lists through a citation-form mapping; function words without a "
                "clear equivalent (especially German articles) stay on the English side only. Frequency ranks "
                "are language-specific, so the 'first 100' of EN→DE is not the same set as the 'first 100' of EN→PL."
            ),
        },
        "entries": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT)
    print("entries", len(entries))
    print("coverage", payload["meta"]["coverage"])
    print("missing german glosses", len(missing_gloss), missing_gloss[:20])


if __name__ == "__main__":
    main()
