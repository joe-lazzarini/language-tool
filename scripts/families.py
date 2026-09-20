"""Closed-class families, spelling doublets, and backfill lemmas for the deck.

One concept per card. Merge:
  - gender/citation paradigms listed separately in the frequency lists
    (Polish ten/ta/to; German articles if they were split)
  - short/long or spelling doublets of the same word
  - function-word synonyms that produce the same English prompt

Do not merge aspectual pairs (robić / zrobić) or distinct lexemes that only
share an overlapping translation (wiedzieć / znać, ale / lecz).

Citation-adjacent nominative gender forms are always accepted on closed-class
cards even when only one form appears in the 1000-list.
"""

from __future__ import annotations

# Display order is the order of `forms`. First item is the usual dictionary head.
# `members` are frequency-list lemmas folded into this card (may omit extra
# gender forms that never had their own rank).

PL_FAMILIES: list[dict] = [
    {
        "members": ["ten", "to"],
        "pos": "pronoun",
        "pl": [
            ("ten", "masculine"),
            ("ta", "feminine"),
            ("to", "neuter"),
        ],
        "en": [
            ("this", "near / present"),
            ("that", "far / aforementioned"),
            ("it", "neuter dummy"),
        ],
        "de": [
            ("dieser", "masculine 'this'"),
            ("diese", "feminine / plural 'this'"),
            ("dieses", "neuter 'this'"),
            ("das", "neuter 'that' / dummy"),
            ("dies", "uninflected 'this'"),
        ],
    },
    {
        "members": ["tu", "tutaj"],
        "pos": "adverb",
        "pl": [("tu", "short form"), ("tutaj", "full form")],
        "en": [("here", "")],
        "de": [("hier", "")],
    },
    {
        "members": ["lub", "albo"],
        "pos": "conjunction",
        "pl": [
            ("lub", "inclusive / written"),
            ("albo", "exclusive 'or'"),
        ],
        "en": [("or", "")],
        "de": [("oder", "")],
    },
    {
        "members": ["jeśli", "jeżeli"],
        "pos": "conjunction",
        "pl": [
            ("jeśli", "common"),
            ("jeżeli", "slightly more formal"),
        ],
        "en": [("if", "")],
        "de": [("wenn", "")],
    },
    {
        "members": ["znów", "znowu"],
        "pos": "adverb",
        "pl": [
            ("znów", "shorter"),
            ("znowu", "full form"),
        ],
        "en": [("again", "")],
        "de": [("wieder", "")],
    },
    {
        "members": ["dziś", "dzisiaj"],
        "pos": "adverb",
        "pl": [
            ("dziś", "short form"),
            ("dzisiaj", "full form"),
        ],
        "en": [("today", "")],
        "de": [("heute", "")],
    },
    {
        "members": ["choć", "chociaż"],
        "pos": "conjunction",
        "pl": [
            ("choć", "short form"),
            ("chociaż", "full form"),
        ],
        "en": [("although", ""), ("though", "")],
        "de": [("obwohl", "")],
    },
    {
        "members": ["że", "iż"],
        "pos": "conjunction",
        "pl": [
            ("że", "common"),
            ("iż", "literary / formal"),
        ],
        "en": [("that", "complementizer")],
        "de": [("dass", "")],
    },
    {
        "members": ["też", "także"],
        "pos": "adverb",
        "pl": [
            ("też", "common"),
            ("także", "slightly more formal"),
        ],
        "en": [("also", ""), ("too", ""), ("as well", "")],
        "de": [("auch", "")],
    },
    {
        "members": ["samochód", "auto"],
        "pos": "noun",
        "pl": [
            ("samochód", "native"),
            ("auto", "loanword"),
        ],
        "en": [("car", ""), ("automobile", "")],
        "de": [("Auto", ""), ("Wagen", "")],
    },
]

DE_FAMILIES: list[dict] = [
    {
        "members": ["schon", "bereits"],
        "pos": "adverb",
        "de": [
            ("schon", "common"),
            ("bereits", "slightly more formal"),
        ],
        "en": [("already", "")],
    },
    {
        "members": ["bisher", "bislang"],
        "pos": "adverb",
        "de": [
            ("bisher", "common"),
            ("bislang", "slightly more formal"),
        ],
        "en": [("so far", ""), ("until now", "")],
    },
    {
        "members": ["zuvor", "vorher"],
        "pos": "adverb",
        "de": [
            ("zuvor", "before that"),
            ("vorher", "before / beforehand"),
        ],
        "en": [("beforehand", ""), ("before", "")],
    },
]

# Extra nominative gender (or clitic/tonic) forms for closed-class lemmas
# that already occupy a single frequency-list slot.
PL_PARADIGMS: dict[str, list[tuple[str, str]]] = {
    "który": [
        ("który", "masculine"),
        ("która", "feminine"),
        ("które", "neuter / nonvirile plural"),
    ],
    "jaki": [
        ("jaki", "masculine"),
        ("jaka", "feminine"),
        ("jakie", "neuter / nonvirile"),
    ],
    "taki": [
        ("taki", "masculine"),
        ("taka", "feminine"),
        ("takie", "neuter / nonvirile"),
    ],
    "jakiś": [
        ("jakiś", "masculine"),
        ("jakaś", "feminine"),
        ("jakieś", "neuter / nonvirile"),
    ],
    "mój": [
        ("mój", "masculine"),
        ("moja", "feminine"),
        ("moje", "neuter / nonvirile"),
    ],
    "nasz": [
        ("nasz", "masculine"),
        ("nasza", "feminine"),
        ("nasze", "neuter / nonvirile"),
    ],
    "swój": [
        ("swój", "masculine"),
        ("swoja", "feminine"),
        ("swoje", "neuter / nonvirile"),
    ],
    "twój": [
        ("twój", "masculine"),
        ("twoja", "feminine"),
        ("twoje", "neuter / nonvirile"),
    ],
    "każdy": [
        ("każdy", "masculine"),
        ("każda", "feminine"),
        ("każde", "neuter"),
    ],
    "żaden": [
        ("żaden", "masculine"),
        ("żadna", "feminine"),
        ("żadne", "neuter"),
    ],
    "wszystek": [
        ("wszystek", "masculine"),
        ("wszystka", "feminine"),
        ("wszystkie", "nonvirile plural"),
    ],
    "jeden": [
        ("jeden", "masculine"),
        ("jedna", "feminine"),
        ("jedno", "neuter"),
    ],
    "dwa": [
        ("dwa", "nonvirile"),
        ("dwie", "feminine"),
    ],
    "tamten": [
        ("tamten", "masculine"),
        ("tamta", "feminine"),
        ("tamto", "neuter"),
    ],
    "ów": [
        ("ów", "masculine"),
        ("owa", "feminine"),
        ("owo", "neuter"),
    ],
    "się": [
        ("się", "unstressed clitic"),
        ("siebie", "stressed / after a preposition"),
    ],
    "w": [
        ("w", "basic"),
        ("we", "before a consonant cluster"),
    ],
    "z": [
        ("z", "basic"),
        ("ze", "before a consonant cluster"),
    ],
}

DE_PARADIGMS: dict[str, list[tuple[str, str]]] = {
    "der": [
        ("der", "masculine"),
        ("die", "feminine / plural"),
        ("das", "neuter"),
    ],
    "ein": [
        ("ein", "masculine / neuter"),
        ("eine", "feminine"),
    ],
    "dieser": [
        ("dieser", "masculine"),
        ("diese", "feminine / plural"),
        ("dieses", "neuter"),
        ("dies", "uninflected"),
    ],
    "jener": [
        ("jener", "masculine"),
        ("jene", "feminine / plural"),
        ("jenes", "neuter"),
    ],
    "kein": [
        ("kein", "masculine / neuter"),
        ("keine", "feminine / plural"),
    ],
    "mein": [
        ("mein", "masculine / neuter"),
        ("meine", "feminine / plural"),
    ],
    "ihr": [
        ("ihr", "masculine / neuter possessive; you (plural)"),
        ("ihre", "feminine / plural possessive"),
    ],
    "unser": [
        ("unser", "masculine / neuter"),
        ("unsere", "feminine / plural"),
    ],
    "jeder": [
        ("jeder", "masculine"),
        ("jede", "feminine"),
        ("jedes", "neuter"),
    ],
    "welcher": [
        ("welcher", "masculine"),
        ("welche", "feminine / plural"),
        ("welches", "neuter"),
    ],
    "solcher": [
        ("solcher", "masculine"),
        ("solche", "feminine / plural"),
        ("solches", "neuter"),
    ],
    "anderer": [
        ("anderer", "masculine"),
        ("andere", "feminine / plural"),
        ("anderes", "neuter"),
    ],
    "alle": [
        ("alle", "plural"),
        ("aller", "masculine"),
        ("alles", "neuter 'everything'"),
    ],
}

# Extra KWJP lemmas used to keep ~1000 Polish-ranked cards after merges.
# (id, lemma, pos, English gloss, German citation)
PL_BACKFILL: list[tuple[int, str, str, str, str]] = [
    (1005, "przyznawać", "verb", "to grant, to admit", "zugeben"),
    (1006, "zgoda", "noun", "agreement, consent", "Zustimmung"),
    (1007, "warunek", "noun", "condition", "Bedingung"),
    (1008, "zdarzenie", "noun", "event", "Ereignis"),
    (1009, "zainteresowanie", "noun", "interest", "Interesse"),
    (1010, "słońce", "noun", "sun", "Sonne"),
    (1011, "realizować", "verb", "to carry out, to implement", "umsetzen"),
    (1012, "nastąpić", "verb", "to occur, to take place", "eintreten"),
    (1013, "spędzić", "verb", "to spend (time)", "verbringen"),
    (1014, "las", "noun", "forest, woods", "Wald"),
    (1015, "zagrożenie", "noun", "threat, danger", "Gefahr"),
    (1016, "rosyjski", "adjective", "Russian", "russisch"),
    (1017, "podróż", "noun", "journey, trip", "Reise"),
    (1018, "wizyta", "noun", "visit", "Besuch"),
]

# Extra UD-GSD lemmas used to keep ~1000 German-ranked cards after merges.
DE_BACKFILL_GLOSSES: dict[str, str] = {
    "leisten": "to perform, to provide",
    "Reise": "trip, journey",
    "empfehlenswert": "recommended",
    "Autobahn": "motorway, highway",
    "sonst": "otherwise, else",
    "kämpfen": "to fight",
}


def family_index(families: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for fam in families:
        for lemma in fam["members"]:
            index[lemma] = fam
    return index


def display_slash(pairs: list[tuple[str, str]]) -> str:
    return " / ".join(text for text, _ in pairs)


def display_comma(pairs: list[tuple[str, str]]) -> str:
    return ", ".join(text for text, _ in pairs)


def answers_from_pairs(pairs: list[tuple[str, str]]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for text, context in pairs:
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        item: dict = {"text": text}
        if context:
            item["context"] = context
        out.append(item)
    return out
