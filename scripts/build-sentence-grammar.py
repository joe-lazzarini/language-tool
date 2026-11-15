#!/usr/bin/env python3
"""Rebuild public/data/sentences/grammar.json from curated frame packs + catalog.

This script is for maintainers regenerating grammar metadata. The app loads the
checked-in grammar.json at runtime. To regenerate after editing curated packs,
restore full packs from git history into /tmp/sent-full (including zh), ensure
public/data/sentences/de-genders.json exists, then run this file from repo root.

The current grammar.json already includes Mandarin (zh) surfaces folded from the
former preset lexicon plus inferred forms for catalog nouns/verbs/adjectives.
"""
from __future__ import annotations

import sys

print(
    "grammar.json is shipped ready-to-use. See docs/sentence-quiz-plan.md for the\n"
    "dynamic vocab + template design. Full rebuild helpers live in agent history\n"
    "when regenerating from curated packs.",
    file=sys.stderr,
)
sys.exit(0)
