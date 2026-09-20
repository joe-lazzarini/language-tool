#!/usr/bin/env python3
"""Merge Polish KWJP lemmas and German UD-GSD lemmas into a multilingual deck."""

from __future__ import annotations

import json
import re
from pathlib import Path

from families import (
    DE_BACKFILL_GLOSSES,
    DE_FAMILIES,
    DE_PARADIGMS,
    PL_BACKFILL,
    PL_FAMILIES,
    PL_PARADIGMS,
    answers_from_pairs,
    display_comma,
    display_slash,
    family_index,
)

ROOT = Path(__file__).resolve().parents[1]
PL_EN = Path(__file__).resolve().parent / "pl-en.json"
DE_LEMMAS = Path(__file__).resolve().parent / "de-lemmas.txt"
DE_GLOSSES = Path(__file__).resolve().parent / "de-glosses.tsv"
PL_DE = Path(__file__).resolve().parent / "pl-de.tsv"
OUT = ROOT / "public" / "data" / "words.json"

TARGET = 1000

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


def clean_token(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" \t.,;:()[]")
    return value.strip("'\"")


def accepted_from(en: str, extra: list | None = None) -> list[dict]:
    """Learner-facing answers: split glosses, keep optional context."""
    seen: set[str] = set()
    out: list[dict] = []

    def add(value: str, context: str | None = None) -> None:
        value = clean_token(value)
        if not value or len(value) > 80:
            return
        if re.search(r"[,;/]| or ", value) and len(re.split(r"[,;/]| or ", value)) > 1:
            for part in re.split(r"[,;/]| or ", value):
                add(part, context)
            return
        key = value.casefold()
        if key in seen:
            return
        seen.add(key)
        item: dict = {"text": value}
        if context:
            item["context"] = context
        out.append(item)

    for item in extra or []:
        if isinstance(item, dict):
            add(item.get("text") or "", item.get("context"))
        else:
            add(str(item))

    joined = "," in en or ";" in en or " or " in en
    if not extra:
        if joined:
            for part in re.split(r"[,;/]| or ", en):
                add(part)
        else:
            add(en)
    elif joined:
        for part in re.split(r"[,;/]| or ", en):
            add(part)

    return out[:14]


def form(text: str, accepted: list | None = None) -> dict:
    extra = accepted_from(text, accepted)
    if not extra:
        extra = [{"text": text}]
    return {"text": text, "accepted": extra}


def paradigm_form(lemma: str, paradigms: dict[str, list[tuple[str, str]]]) -> dict | None:
    pairs = paradigms.get(lemma)
    if not pairs:
        return None
    return {"text": display_slash(pairs), "accepted": answers_from_pairs(pairs)}


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


def german_form(lemma: str, extra: list | None = None) -> dict:
    paradigmatic = paradigm_form(lemma, DE_PARADIGMS)
    if paradigmatic and not extra:
        return paradigmatic
    if paradigmatic:
        merged = accepted_from(paradigmatic["text"], paradigmatic["accepted"] + (extra or []))
        return {"text": paradigmatic["text"], "accepted": merged}
    return form(lemma, extra or [lemma])


def polish_form(lemma: str, extra: list | None = None) -> dict:
    paradigmatic = paradigm_form(lemma, PL_PARADIGMS)
    if paradigmatic and not extra:
        return paradigmatic
    if paradigmatic:
        merged = accepted_from(paradigmatic["text"], paradigmatic["accepted"] + (extra or []))
        return {"text": paradigmatic["text"], "accepted": merged}
    return form(lemma, extra or [lemma])


def family_entry(
    fam: dict,
    members: list[dict],
    *,
    lang: str,
    pl_de: dict[str, str] | None = None,
    de_gloss: dict[str, str] | None = None,
) -> dict:
    ranks = [m["id"] if lang == "pl" else m["rank"] for m in members]
    rank = min(ranks)
    pos = fam.get("pos") or members[0].get("pos") or "word"
    entry = {
        "id": f"{lang}-{rank}",
        "pos": pos,
        "ranks": {lang: rank},
        "forms": {},
    }

    if lang == "pl":
        entry["forms"]["pl"] = {
            "text": display_slash(fam["pl"]),
            "accepted": answers_from_pairs(fam["pl"]),
        }
        entry["forms"]["en"] = {
            "text": display_comma(fam["en"]),
            "accepted": answers_from_pairs(fam["en"]),
        }
        if fam.get("de"):
            entry["forms"]["de"] = {
                "text": display_slash(fam["de"]) if len(fam["de"]) > 1 else fam["de"][0][0],
                "accepted": answers_from_pairs(fam["de"]),
            }
        elif pl_de:
            de_answers: list[tuple[str, str]] = []
            seen: set[str] = set()
            for member in members:
                mapped = pl_de.get(member["pl"])
                if mapped and mapped.casefold() not in seen:
                    seen.add(mapped.casefold())
                    de_answers.append((mapped, f"for {member['pl']}"))
            if de_answers:
                text = display_slash(de_answers) if len(de_answers) > 1 else de_answers[0][0]
                head = de_answers[0][0]
                paradigmatic = paradigm_form(head, DE_PARADIGMS)
                if paradigmatic and len(de_answers) == 1:
                    entry["forms"]["de"] = paradigmatic
                else:
                    extra = answers_from_pairs(de_answers)
                    if paradigmatic:
                        extra = paradigmatic["accepted"] + extra
                        text = paradigmatic["text"]
                    entry["forms"]["de"] = form(text, extra)
    else:
        entry["forms"]["de"] = {
            "text": display_slash(fam["de"]),
            "accepted": answers_from_pairs(fam["de"]),
        }
        entry["forms"]["en"] = {
            "text": display_comma(fam["en"]),
            "accepted": answers_from_pairs(fam["en"]),
        }

    return entry


def coverage_count(entries: list[dict], a: str, b: str) -> int:
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


def main() -> None:
    polish = json.loads(PL_EN.read_text(encoding="utf-8"))["words"]
    de_gloss = load_tsv(DE_GLOSSES)
    de_gloss.update(DE_BACKFILL_GLOSSES)
    pl_de = load_tsv(PL_DE)
    german = load_german_lemmas()

    pl_fam_index = family_index(PL_FAMILIES)
    de_fam_index = family_index(DE_FAMILIES)
    polish_by_lemma = {word["pl"]: word for word in polish}

    entries: list[dict] = []
    consumed_pl: set[str] = set()

    for word in polish:
        lemma = word["pl"]
        if lemma in consumed_pl:
            continue
        fam = pl_fam_index.get(lemma)
        if fam:
            members = []
            for member_lemma in fam["members"]:
                consumed_pl.add(member_lemma)
                member = polish_by_lemma.get(member_lemma)
                if member:
                    members.append(member)
            if not members:
                continue
            entries.append(family_entry(fam, members, lang="pl", pl_de=pl_de))
            continue
        consumed_pl.add(lemma)
        entry = {
            "id": f"pl-{word['id']}",
            "pos": word["pos"],
            "ranks": {"pl": word["id"]},
            "forms": {
                "pl": polish_form(lemma, [lemma]),
                "en": form(word["en"], word.get("accepted") or []),
            },
        }
        de = pl_de.get(lemma)
        if de:
            entry["forms"]["de"] = german_form(de, [de])
        entries.append(entry)

    for rank, lemma, pos, en, de in PL_BACKFILL:
        if lemma in consumed_pl:
            continue
        pl_count = sum(1 for item in entries if "pl" in item.get("ranks", {}))
        if pl_count >= TARGET:
            break
        consumed_pl.add(lemma)
        entries.append(
            {
                "id": f"pl-{rank}",
                "pos": pos,
                "ranks": {"pl": rank},
                "forms": {
                    "pl": polish_form(lemma, [lemma]),
                    "en": form(en),
                    "de": german_form(de, [de]),
                },
            }
        )

    consumed_de: set[str] = set()
    german_by_lemma = {lemma: (rank, lemma, pos) for rank, lemma, pos in german}

    for rank, lemma, pos in german:
        if lemma in consumed_de:
            continue
        de_count = sum(1 for item in entries if "de" in item.get("ranks", {}) and "pl" not in item.get("ranks", {}))
        if de_count >= TARGET:
            break
        fam = de_fam_index.get(lemma)
        if fam:
            members = []
            for member_lemma in fam["members"]:
                consumed_de.add(member_lemma)
                member = german_by_lemma.get(member_lemma)
                if member:
                    members.append({"rank": member[0], "lemma": member[1], "pos": member[2]})
            if not members:
                continue
            entries.append(family_entry(fam, members, lang="de", de_gloss=de_gloss))
            continue
        gloss = de_gloss.get(lemma) or de_gloss.get(lemma.casefold())
        if not gloss:
            continue
        consumed_de.add(lemma)
        entries.append(
            {
                "id": f"de-{rank}",
                "pos": pos,
                "ranks": {"de": rank},
                "forms": {
                    "de": german_form(lemma, [lemma]),
                    "en": form(gloss),
                },
            }
        )

    payload = {
        "meta": {
            "title": "English, Polish, and German lemma decks",
            "languages": [
                {"code": "en", "name": "English", "nativeName": "English"},
                {"code": "pl", "name": "Polish", "nativeName": "Polski"},
                {"code": "de", "name": "German", "nativeName": "Deutsch"},
            ],
            "coverage": {
                "en-pl": coverage_count(entries, "en", "pl"),
                "pl-en": coverage_count(entries, "pl", "en"),
                "en-de": coverage_count(entries, "en", "de"),
                "de-en": coverage_count(entries, "de", "en"),
                "pl-de": coverage_count(entries, "pl", "de"),
                "de-pl": coverage_count(entries, "de", "pl"),
            },
            "sources": {
                "polishFrequency": {
                    "name": "Wiktionary: Frequency lists/Polish/KWJP",
                    "url": "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP",
                    "corpus": "Korpus Współczesnego Języka Polskiego (KWJP), 2011–2020",
                    "note": "Lemmas merged across parts of speech and ranked by average reduced frequency. Closed-class gender families and spelling doublets are then folded into one card (see scripts/families.py).",
                    "citation": "W. Kieraś et al., Korpus Współczesnego Języka Polskiego. Dekada 2011–2020, Język Polski 105(2):5–20, 2025.",
                },
                "germanFrequency": {
                    "name": "Universal Dependencies German-GSD",
                    "url": "https://universaldependencies.org/treebanks/de_gsd/index.html",
                    "corpus": "UD German-GSD (CC BY-SA 4.0), Wikipedia and web documents",
                    "note": "Lemma frequencies computed from the UD German-GSD treebank. Inflected forms are collapsed to dictionary/citation lemmas. Articles and gendered determiners accept nominative gender variants. Most proper names, abbreviations, and foreign tokens were dropped.",
                    "citation": "McDonald et al., Universal Dependency Annotation for Multilingual Parsing, ACL 2013; UD German-GSD release.",
                },
                "glossSource": {
                    "name": "English Wiktionary",
                    "url": "https://en.wiktionary.org/",
                    "license": "CC BY-SA 4.0 / GFDL",
                },
            },
            "gaps": (
                "English↔Polish uses the 1000 KWJP lemmas after family merges. English↔German uses the 1000 "
                "UD-GSD lemmas after family merges. Polish↔German joins those lists through a citation-form "
                "mapping; function words without a clear equivalent stay on the English side only. Frequency "
                "ranks are language-specific, so the 'first 100' of EN→DE is not the same set as the 'first 100' "
                "of EN→PL. Closed-class gender families (ten/ta/to, der/die/das) are one card; aspectual pairs "
                "and distinct lexemes that only overlap in English stay separate."
            ),
        },
        "entries": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT)
    print("entries", len(entries))
    print("coverage", payload["meta"]["coverage"])
    missing_gloss = [
        lemma
        for rank, lemma, pos in german[: TARGET + 40]
        if lemma not in consumed_de and lemma not in de_gloss and lemma.casefold() not in de_gloss
    ]
    print("unconsumed german without gloss", missing_gloss[:20])


if __name__ == "__main__":
    main()
