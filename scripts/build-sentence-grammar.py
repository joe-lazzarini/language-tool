#!/usr/bin/env python3
"""Annotate public/data/sentences/grammar.json with sem / valence / domains.

Run from repo root:
  python3 scripts/build-sentence-grammar.py

The app loads the checked-in grammar.json at runtime. This script is the
maintainer path for refreshing concept-level semantic tags, verb valence,
subject/object restrictions, and adjective domains. Tags are applied by
concept (and English lemma fallback), then copied across duplicate
pl- / de- / lex: ids that share a concept.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GRAMMAR_PATH = ROOT / "public" / "data" / "sentences" / "grammar.json"

SEM = ("person", "animal", "place", "thing", "food", "drink", "readable")
DOMAINS = ("human", "physical", "taste", "nationality", "evaluative", "temporal", "open")

# ---------------------------------------------------------------------------
# Nouns: concept → sem tags
# ---------------------------------------------------------------------------

PERSON = {
    "acquaintance", "artist", "author", "bishop", "boss", "boy", "brother",
    "chairman", "chairperson", "champion", "child", "christian priest", "client",
    "coach", "companion", "customer", "daughter", "dentist", "director", "doctor",
    "driver", "emperor", "employee", "family", "farmer", "father", "friend",
    "ghost", "girl", "god", "guest", "hero", "human", "husband", "individual",
    "inhabitant", "jew", "king", "leader", "man", "member", "minister", "mother",
    "mr", "mrs", "mum", "opponent", "owner", "parent", "parents", "patient",
    "people", "person", "player", "pole", "policeman", "politician", "population",
    "president", "professor", "publisher", "pupil", "representative", "resident",
    "sister", "soldier", "son", "staff", "state premier", "student", "successor",
    "teacher", "wife", "woman",
}

ANIMAL = {"animal", "cat", "dog"}

PLACE = {
    "academic high school", "apartment", "area", "assembly hall", "bank", "base",
    "border", "bridge", "brook", "building", "bureau", "canal", "canton", "capital",
    "castle", "centre", "church", "city", "class", "college", "country", "court",
    "courtyard", "district", "district of a town", "earth", "east", "environment",
    "facility", "federal state", "field", "forest", "gmina", "ground", "grounds",
    "hall", "harbour", "homeland", "hospital", "hotel", "house", "industry",
    "institution", "island", "kingdom", "lake", "league", "location", "market",
    "monastery", "mountain", "municipality", "museum", "north", "office", "park",
    "parliament", "place", "plain", "province", "region", "restaurant", "river",
    "road", "room", "school", "sea", "settlement", "shop", "south", "space",
    "square", "station", "street", "surroundings", "terrain", "theatre",
    "university", "valley", "vicinity", "village", "west", "world", "homeland",
}

FOOD = {"bread", "breakfast", "food", "plant"}
DRINK = {"water"}
READABLE = {
    "album", "article", "book", "document", "film", "information", "letter",
    "list", "literature", "magazine", "message", "newspaper", "novel", "page",
    "photograph", "picture", "program", "recipe", "recording", "report", "script",
    "sentence", "song", "story", "text", "word",
}

# Physical objects / vehicles that stay "thing" (default) but are not places.
THING_EXPLICIT = {
    "airplane", "bed", "boat", "body", "car", "clock", "door", "engine", "eye",
    "face", "foot", "forehead", "gate", "hair", "hand", "head", "heart", "leaf",
    "leg", "machine", "money", "mouth", "net", "object", "palm", "piece",
    "product", "rail", "railway", "ship", "shoulder", "stone", "table",
    "telephone", "tongue", "tower", "train", "tree", "upper limb", "vehicle",
    "wall", "window", "wood",
}

TEMPORAL_NOUNS = {
    "age", "april", "august", "autumn", "beginning", "century", "day", "december",
    "evening", "february", "future", "hour", "instant", "january", "july", "june",
    "march", "may", "minute", "moment", "monday", "month", "morning", "night",
    "november", "october", "period", "point in time", "season", "september",
    "spring", "summer", "sunday", "time", "week", "winter", "year",
}

# Extra noun domains beyond those derived from sem.
NOUN_DOMAIN_EXTRA: dict[str, list[str]] = {
    c: ["temporal"] for c in TEMPORAL_NOUNS
}

# ---------------------------------------------------------------------------
# Verbs: concept → (valence, subject, object|None)
# ---------------------------------------------------------------------------

PERSON_SUB = ["person"]
ANIM_SUB = ["person", "animal"]
BROAD_SUB = ["person", "animal", "thing", "place"]
THING_OBJ = ["thing", "person", "animal", "food", "drink", "readable", "place"]
PERSON_OBJ = ["person"]
FOOD_OBJ = ["food"]
DRINK_OBJ = ["drink"]
READ_OBJ = ["readable"]
PLACE_OBJ = ["place"]
ANIM_OBJ = ["person", "animal"]

# Agentive intransitives: person (or person|animal) subjects.
VI_PERSON = {
    "say", "speak", "talk", "walk", "walk for some time", "walk out", "work",
    "write", "read", "study", "learn", "teach", "think", "believe", "know",
    "know how", "want", "need", "need or", "intend", "decide", "ask", "ask for",
    "answer", "tell", "call", "name", "marry", "vote", "pray", "sing", "dance",
    "cook", "wash", "clean", "drive", "ride", "travel", "visit", "pay", "buy",
    "sell", "build", "create", "write", "publish", "announce", "claim", "explain",
    "describe", "promise", "recommend", "recommend further", "judge", "justify",
    "interpret", "profess", "acknowledge", "admit", "assure", "convince",
    "inform", "mention", "remind", "reminisce", "report", "state", "underline",
    "emphasize", "express", "expect", "anticipate", "prefer", "choose", "select",
    "plan", "organize", "manage", "lead", "rule", "govern", "employ", "hire",
    "appoint", "order", "oblige", "allow", "permit", "forbid", "prevent",
    "help", "support", "serve", "treat", "care", "take care", "kill", "injure",
    "attack", "defend", "fight", "win", "lose", "play", "watch", "look",
    "look at", "look for", "listen", "hear", "see", "observe", "notice",
    "discover", "find", "find out", "get to know", "recognize", "remember",
    "forget", "understand", "mean", "like", "love", "fear", "feel", "hope",
    "wish", "try", "attempt", "fail", "succeed", "make it", "start", "begin",
    "stop", "stop doing something", "finish", "complete", "continue", "wait",
    "stay", "live", "sit", "stand", "lie", "sleep", "awaken", "die", "come",
    "come back", "come from", "go", "go in", "go across", "arrive", "leave",
    "enter", "return", "run", "fall", "fall in", "rise", "grow", "appear",
    "disappear", "happen", "occur", "take place", "take part", "meet",
    "accompany", "follow", "join", "bring", "bring together", "carry",
    "carry out", "take", "take away", "take over", "take up", "give",
    "give back", "give birth", "get", "get into", "obtain", "receive",
    "acquire", "own", "have", "keep", "hold", "hold up", "put", "put on",
    "set", "set up", "lay", "raise", "lift", "pull", "pull out", "push",
    "throw", "send", "transfer", "deliver", "offer", "show", "open", "close",
    "use", "make", "do", "form", "shape", "create", "produce", "build",
    "found", "establish", "erect", "destroy", "change", "replace", "add",
    "collect", "share", "spend", "spend (time", "pass", "reach", "achieve",
    "solve", "check", "count", "mark", "sign", "point", "turn", "move",
    "step", "act", "function", "operate", "work", "study", "teach", "learn",
    "read", "write", "speak", "say", "tell", "talk", "ask", "answer",
    "call", "name", "think", "know", "want", "need", "must", "should",
    "ought", "may", "can", "be able to", "one can", "it is needed",
    "it is worth", "it is known", "be called", "be located", "be missing",
    "be subject to", "be widespread", "be (habitually", "belong",
    "consist of", "comprise", "constitute", "contain", "include", "concern",
    "depend", "hinge on", "result in", "amount to", "correspond", "seem",
    "sound", "suffice", "last", "end", "ensue", "arise", "exist", "occur",
    "happen", "take place", "become", "remain", "stay", "begin", "start",
    "stop", "finish", "continue", "proceed", "develop", "expand", "grow",
    "increase", "decrease", "change", "improve", "worsen",
}

# Force person-only (not animal) subjects.
VI_PERSON_ONLY = {
    "say", "speak", "talk", "write", "read", "study", "learn", "teach", "think",
    "know", "know how", "want", "need", "ask", "ask for", "answer", "tell",
    "work", "buy", "sell", "pay", "vote", "marry", "decide", "plan", "organize",
    "explain", "describe", "promise", "recommend", "judge", "believe",
    "remember", "forget", "understand", "mean", "hope", "intend", "claim",
    "announce", "publish", "profess", "acknowledge", "admit", "inform",
    "mention", "report", "state", "underline", "emphasize", "express",
    "expect", "prefer", "choose", "manage", "lead", "rule", "employ", "hire",
    "appoint", "order", "allow", "help", "support", "serve", "treat",
    "kill", "injure", "win", "lose", "drive", "build", "create", "found",
    "establish", "destroy", "produce", "use", "make", "do", "give", "take",
    "bring", "send", "offer", "show", "open", "close", "put", "set", "get",
    "obtain", "receive", "acquire", "own", "have", "keep", "hold", "find",
    "find out", "discover", "recognize", "get to know", "solve", "check",
    "count", "sign", "mark", "call", "name", "visit", "meet", "accompany",
    "follow", "join", "look for", "look at", "watch", "listen", "hear",
    "observe", "notice", "like", "love", "fear", "feel", "try", "attempt",
    "fail", "succeed", "start", "begin", "stop", "finish", "complete",
    "wait", "stay", "live", "arrive", "leave", "come", "come back", "go",
    "walk", "run", "ride", "travel", "play", "sleep", "awaken", "die",
    "sit", "stand", "must", "should", "ought", "may", "be able to", "one can",
    "reach", "achieve", "spend", "spend (time", "pass", "change", "replace",
    "add", "collect", "share", "raise", "lift", "pull", "push", "throw",
    "transfer", "deliver", "carry", "carry out", "take away", "take over",
    "take up", "take part", "give back", "give birth", "put on", "set up",
    "lay", "pull out", "form", "shape", "erect", "operate", "function",
    "act", "proceed", "develop", "expand", "grow", "move", "step", "turn",
    "point", "look", "see", "sound", "seem", "appear", "disappear",
    "become", "belong", "consist of", "comprise", "constitute", "contain",
    "concern", "depend", "hinge on", "result in", "amount to", "correspond",
    "suffice", "last", "end", "ensue", "arise", "exist", "occur", "happen",
    "take place", "be called", "be located", "be missing", "be subject to",
    "be widespread", "be (habitually", "it is needed", "it is worth",
    "it is known", "need or", "recommend further", "reminisce", "remind",
    "interpret", "justify", "assure", "convince", "anticipate", "gratify",
    "mystify", "oblige", "prevent", "enable", "equip", "deploy", "deprive",
    "designate", "determine", "distinguish", "embrace", "employ", "erect",
    "establish", "expand", "experience", "implement", "introduce", "knit",
    "lean onto", "occupy", "perform", "pick up", "prepare", "profess",
    "publish", "regard", "repeat", "represent", "require", "resign",
    "sacrifice", "secure", "select", "serve", "shape", "sign", "solve",
    "split", "spread", "state", "succeed", "support", "teach", "transfer",
    "treat", "try", "underline", "understand", "use", "visit", "vote",
    "want", "watch out", "win", "work", "write", "abandon", "accept",
    "accompany", "achieve", "acknowledge", "acquire", "add", "admit",
    "allow", "announce", "answer", "appoint", "ask", "ask for", "attempt",
    "award", "believe", "benefit from", "bring", "bring together", "build",
    "buy", "call", "carry", "carry out", "cause", "celebrate", "check",
    "choose", "claim", "close", "collect", "complete", "conclude", "confirm",
    "connect", "convince", "count", "create", "decide", "deliver", "demand",
    "describe", "destroy", "determine", "develop", "direct", "discover",
    "distinguish", "do", "drink", "drive", "eat", "emphasize", "employ",
    "enable", "equip", "erect", "establish", "expect", "explain", "express",
    "fear", "feel", "fight", "find", "find out", "finish", "fold", "forget",
    "form", "found", "get", "get into", "get to know", "give", "give back",
    "give birth", "go", "go across", "go in", "grant", "hand", "have",
    "have an effect", "have at one's disposal", "hear", "help", "hide",
    "hire", "hit", "hold", "hold up", "implement", "inform", "injure",
    "intend", "introduce", "join", "judge", "justify", "keep", "kill",
    "know", "know how", "lack", "lay", "lead", "learn", "leave", "let",
    "lift", "like", "listen", "live", "look", "look at", "look for", "lose",
    "love", "make", "make it", "manage", "mark", "marry", "mean", "meet",
    "mention", "move", "must", "name", "need", "notice", "oblige", "observe",
    "obtain", "occupy", "offer", "open", "operate", "order", "organize",
    "ought", "own", "pass", "pay", "perform", "pick up", "plan", "play",
    "please", "point", "prefer", "prepare", "prevent", "proceed", "produce",
    "profess", "publish", "pull", "pull out", "push", "put", "put on",
    "raise", "reach", "read", "receive", "recognize", "recommend", "regard",
    "remember", "remind", "repeat", "replace", "report", "represent",
    "require", "resign", "ride", "rule", "run", "sacrifice", "say", "secure",
    "see", "sell", "serve", "set", "set up", "shape", "share", "should",
    "show", "sign", "sit", "sleep", "solve", "speak", "spend", "split",
    "spread", "stand", "start", "state", "stay", "step", "stop", "study",
    "succeed", "support", "take", "take away", "take care", "take over",
    "take part", "take up", "talk", "teach", "tell", "think", "throw",
    "transfer", "treat", "try", "turn", "underline", "understand", "use",
    "visit", "vote", "wait", "walk", "walk for some time", "walk out",
    "want", "watch", "watch out", "win", "work", "write",
}

# Non-agentive / ambient verbs: broader subjects OK.
# Note: agentive modals (must/may/should/be able to/one can) stay person-only.
VI_BROAD = {
    "be", "become", "exist", "occur", "happen", "take place", "seem", "appear",
    "disappear", "arise", "ensue", "last", "end", "suffice", "remain",
    "consist of", "comprise", "constitute", "contain", "concern", "depend",
    "hinge on", "result in", "amount to", "correspond", "belong", "include",
    "sound", "fall", "rise", "grow", "expand", "develop", "change", "begin",
    "start", "stop", "finish", "continue", "succeed", "fail", "be located",
    "be missing", "be subject to", "be widespread", "be (habitually",
    "can be seen", "it is known", "it is needed", "it is worth",
}

# Transitives with object restrictions.
VT: dict[str, tuple[list[str], list[str]]] = {
    # (subject, object)
    "eat": (ANIM_SUB, FOOD_OBJ),
    "drink": (ANIM_SUB, DRINK_OBJ),
    "read": (PERSON_SUB, READ_OBJ),
    "write": (PERSON_SUB, READ_OBJ),
    "see": (ANIM_SUB, THING_OBJ),
    "watch": (PERSON_SUB, THING_OBJ),
    "look at": (ANIM_SUB, THING_OBJ),
    "hear": (ANIM_SUB, THING_OBJ),
    "listen": (PERSON_SUB, THING_OBJ),
    "have": (ANIM_SUB, THING_OBJ),
    "own": (PERSON_SUB, THING_OBJ),
    "want": (PERSON_SUB, THING_OBJ),
    "need": (PERSON_SUB, THING_OBJ),
    "like": (ANIM_SUB, THING_OBJ),
    "love": (ANIM_SUB, ["person", "animal", "thing", "place", "food", "drink", "readable"]),
    "know": (PERSON_SUB, THING_OBJ),
    "get to know": (PERSON_SUB, ["person", "place", "thing"]),
    "find": (ANIM_SUB, THING_OBJ),
    "find out": (PERSON_SUB, THING_OBJ),
    "discover": (PERSON_SUB, THING_OBJ),
    "buy": (PERSON_SUB, ["thing", "food", "drink", "readable"]),
    "sell": (PERSON_SUB, ["thing", "food", "drink", "readable"]),
    "make": (PERSON_SUB, THING_OBJ),
    "do": (PERSON_SUB, THING_OBJ),
    "give": (PERSON_SUB, THING_OBJ),
    "give back": (PERSON_SUB, THING_OBJ),
    "take": (PERSON_SUB, THING_OBJ),
    "take away": (PERSON_SUB, THING_OBJ),
    "take over": (PERSON_SUB, THING_OBJ),
    "take up": (PERSON_SUB, THING_OBJ),
    "bring": (PERSON_SUB, THING_OBJ),
    "bring together": (PERSON_SUB, ["person", "thing"]),
    "get": (PERSON_SUB, THING_OBJ),
    "obtain": (PERSON_SUB, THING_OBJ),
    "receive": (PERSON_SUB, THING_OBJ),
    "acquire": (PERSON_SUB, THING_OBJ),
    "keep": (PERSON_SUB, THING_OBJ),
    "hold": (PERSON_SUB, THING_OBJ),
    "put": (PERSON_SUB, THING_OBJ),
    "put on": (PERSON_SUB, THING_OBJ),
    "set": (PERSON_SUB, THING_OBJ),
    "set up": (PERSON_SUB, THING_OBJ),
    "lay": (PERSON_SUB, THING_OBJ),
    "raise": (PERSON_SUB, THING_OBJ),
    "lift": (PERSON_SUB, THING_OBJ),
    "pull": (PERSON_SUB, THING_OBJ),
    "pull out": (PERSON_SUB, THING_OBJ),
    "push": (PERSON_SUB, THING_OBJ),
    "throw": (PERSON_SUB, THING_OBJ),
    "carry": (PERSON_SUB, THING_OBJ),
    "carry out": (PERSON_SUB, THING_OBJ),
    "send": (PERSON_SUB, THING_OBJ),
    "transfer": (PERSON_SUB, THING_OBJ),
    "deliver": (PERSON_SUB, THING_OBJ),
    "offer": (PERSON_SUB, THING_OBJ),
    "show": (PERSON_SUB, THING_OBJ),
    "open": (PERSON_SUB, ["thing", "place"]),
    "close": (PERSON_SUB, ["thing", "place"]),
    "use": (PERSON_SUB, THING_OBJ),
    "build": (PERSON_SUB, ["thing", "place"]),
    "create": (PERSON_SUB, THING_OBJ),
    "produce": (PERSON_SUB, THING_OBJ),
    "form": (PERSON_SUB, THING_OBJ),
    "shape": (PERSON_SUB, THING_OBJ),
    "found": (PERSON_SUB, ["thing", "place", "person"]),
    "establish": (PERSON_SUB, ["thing", "place"]),
    "erect": (PERSON_SUB, ["thing", "place"]),
    "destroy": (PERSON_SUB, THING_OBJ),
    "change": (PERSON_SUB, THING_OBJ),
    "replace": (PERSON_SUB, THING_OBJ),
    "add": (PERSON_SUB, THING_OBJ),
    "collect": (PERSON_SUB, THING_OBJ),
    "share": (PERSON_SUB, THING_OBJ),
    "choose": (PERSON_SUB, THING_OBJ),
    "prefer": (PERSON_SUB, THING_OBJ),
    "pay": (PERSON_SUB, ["thing", "person"]),
    "spend": (PERSON_SUB, ["thing"]),
    "spend (time": (PERSON_SUB, ["thing"]),
    "pass": (PERSON_SUB, THING_OBJ),
    "reach": (PERSON_SUB, ["place", "thing", "person"]),
    "achieve": (PERSON_SUB, THING_OBJ),
    "solve": (PERSON_SUB, THING_OBJ),
    "check": (PERSON_SUB, THING_OBJ),
    "count": (PERSON_SUB, THING_OBJ),
    "mark": (PERSON_SUB, THING_OBJ),
    "sign": (PERSON_SUB, ["readable", "thing"]),
    "say": (PERSON_SUB, ["thing", "readable", "person"]),
    "speak": (PERSON_SUB, ["thing", "readable", "person"]),
    "talk": (PERSON_SUB, ["person"]),
    "tell": (PERSON_SUB, ["person", "thing", "readable"]),
    "ask": (PERSON_SUB, ["person", "thing"]),
    "ask for": (PERSON_SUB, THING_OBJ),
    "answer": (PERSON_SUB, ["person", "thing", "readable"]),
    "call": (PERSON_SUB, ["person", "thing"]),
    "name": (PERSON_SUB, ["person", "thing"]),
    "teach": (PERSON_SUB, ["person", "thing"]),
    "learn": (PERSON_SUB, THING_OBJ),
    "study": (PERSON_SUB, ["readable", "thing"]),
    "understand": (PERSON_SUB, THING_OBJ),
    "mean": (PERSON_SUB, THING_OBJ),
    "believe": (PERSON_SUB, THING_OBJ),
    "remember": (PERSON_SUB, THING_OBJ),
    "forget": (PERSON_SUB, THING_OBJ),
    "recognize": (PERSON_SUB, ["person", "thing", "place"]),
    "notice": (PERSON_SUB, THING_OBJ),
    "observe": (PERSON_SUB, THING_OBJ),
    "expect": (PERSON_SUB, THING_OBJ),
    "anticipate": (PERSON_SUB, THING_OBJ),
    "fear": (ANIM_SUB, THING_OBJ),
    "feel": (ANIM_SUB, THING_OBJ),
    "help": (PERSON_SUB, PERSON_OBJ),
    "support": (PERSON_SUB, ["person", "thing"]),
    "serve": (PERSON_SUB, ["person", "thing"]),
    "treat": (PERSON_SUB, ["person", "thing"]),
    "kill": (PERSON_SUB, ANIM_OBJ),
    "injure": (PERSON_SUB, ANIM_OBJ),
    "hit": (PERSON_SUB, THING_OBJ),
    "hide": (ANIM_SUB, THING_OBJ),
    "meet": (PERSON_SUB, PERSON_OBJ),
    "visit": (PERSON_SUB, ["person", "place"]),
    "accompany": (PERSON_SUB, PERSON_OBJ),
    "follow": (ANIM_SUB, ["person", "animal", "thing"]),
    "join": (PERSON_SUB, ["person", "thing", "place"]),
    "look for": (ANIM_SUB, THING_OBJ),
    "find": (ANIM_SUB, THING_OBJ),
    "lose": (PERSON_SUB, THING_OBJ),
    "win": (PERSON_SUB, THING_OBJ),
    "play": (PERSON_SUB, ["thing", "person"]),
    "fight": (PERSON_SUB, ["person", "thing"]),
    "drive": (PERSON_SUB, ["thing", "place"]),
    "ride": (PERSON_SUB, ["thing", "animal", "place"]),
    "leave": (ANIM_SUB, ["place", "person", "thing"]),
    "enter": (ANIM_SUB, PLACE_OBJ),
    "occupy": (PERSON_SUB, ["place", "thing"]),
    "abandon": (PERSON_SUB, THING_OBJ),
    "accept": (PERSON_SUB, THING_OBJ),
    "allow": (PERSON_SUB, THING_OBJ),
    "announce": (PERSON_SUB, THING_OBJ),
    "appoint": (PERSON_SUB, PERSON_OBJ),
    "award": (PERSON_SUB, ["person", "thing"]),
    "cause": (BROAD_SUB, THING_OBJ),
    "celebrate": (PERSON_SUB, THING_OBJ),
    "claim": (PERSON_SUB, THING_OBJ),
    "complete": (PERSON_SUB, THING_OBJ),
    "conclude": (PERSON_SUB, THING_OBJ),
    "confirm": (PERSON_SUB, THING_OBJ),
    "connect": (PERSON_SUB, THING_OBJ),
    "convince": (PERSON_SUB, PERSON_OBJ),
    "demand": (PERSON_SUB, THING_OBJ),
    "describe": (PERSON_SUB, THING_OBJ),
    "designate": (PERSON_SUB, THING_OBJ),
    "determine": (PERSON_SUB, THING_OBJ),
    "direct": (PERSON_SUB, ["person", "thing"]),
    "distinguish": (PERSON_SUB, THING_OBJ),
    "embrace": (PERSON_SUB, ["person", "thing"]),
    "emphasize": (PERSON_SUB, THING_OBJ),
    "employ": (PERSON_SUB, PERSON_OBJ),
    "enable": (PERSON_SUB, THING_OBJ),
    "equip": (PERSON_SUB, THING_OBJ),
    "explain": (PERSON_SUB, THING_OBJ),
    "express": (PERSON_SUB, THING_OBJ),
    "grant": (PERSON_SUB, THING_OBJ),
    "hand": (PERSON_SUB, THING_OBJ),
    "hire": (PERSON_SUB, PERSON_OBJ),
    "implement": (PERSON_SUB, THING_OBJ),
    "inform": (PERSON_SUB, PERSON_OBJ),
    "intend": (PERSON_SUB, THING_OBJ),
    "introduce": (PERSON_SUB, ["person", "thing"]),
    "judge": (PERSON_SUB, THING_OBJ),
    "justify": (PERSON_SUB, THING_OBJ),
    "lead": (PERSON_SUB, ["person", "thing", "place"]),
    "let": (PERSON_SUB, THING_OBJ),
    "mention": (PERSON_SUB, THING_OBJ),
    "oblige": (PERSON_SUB, PERSON_OBJ),
    "offer": (PERSON_SUB, THING_OBJ),
    "order": (PERSON_SUB, THING_OBJ),
    "organize": (PERSON_SUB, THING_OBJ),
    "perform": (PERSON_SUB, THING_OBJ),
    "pick up": (PERSON_SUB, THING_OBJ),
    "plan": (PERSON_SUB, THING_OBJ),
    "please": (BROAD_SUB, PERSON_OBJ),
    "point": (PERSON_SUB, THING_OBJ),
    "prepare": (PERSON_SUB, THING_OBJ),
    "prevent": (PERSON_SUB, THING_OBJ),
    "profess": (PERSON_SUB, THING_OBJ),
    "publish": (PERSON_SUB, READ_OBJ),
    "regard": (PERSON_SUB, THING_OBJ),
    "remind": (PERSON_SUB, PERSON_OBJ),
    "repeat": (PERSON_SUB, THING_OBJ),
    "report": (PERSON_SUB, THING_OBJ),
    "represent": (PERSON_SUB, ["person", "thing"]),
    "require": (PERSON_SUB, THING_OBJ),
    "rule": (PERSON_SUB, ["person", "place", "thing"]),
    "sacrifice": (PERSON_SUB, THING_OBJ),
    "secure": (PERSON_SUB, THING_OBJ),
    "spread": (PERSON_SUB, THING_OBJ),
    "state": (PERSON_SUB, THING_OBJ),
    "support": (PERSON_SUB, ["person", "thing"]),
    "teach": (PERSON_SUB, ["person", "thing"]),
    "transfer": (PERSON_SUB, THING_OBJ),
    "treat": (PERSON_SUB, ["person", "thing"]),
    "try": (PERSON_SUB, THING_OBJ),
    "underline": (PERSON_SUB, THING_OBJ),
    "vote": (PERSON_SUB, ["person", "thing"]),
    "watch out": (PERSON_SUB, THING_OBJ),
    "benefit from": (PERSON_SUB, THING_OBJ),
    "deprive": (PERSON_SUB, PERSON_OBJ),
    "deploy": (PERSON_SUB, THING_OBJ),
    "experience": (PERSON_SUB, THING_OBJ),
    "fold": (PERSON_SUB, THING_OBJ),
    "gratify": (PERSON_SUB, PERSON_OBJ),
    "have an effect": (BROAD_SUB, THING_OBJ),
    "have at one's disposal": (PERSON_SUB, THING_OBJ),
    "interpret": (PERSON_SUB, THING_OBJ),
    "knit": (PERSON_SUB, THING_OBJ),
    "lean onto": (ANIM_SUB, THING_OBJ),
    "mystify": (PERSON_SUB, PERSON_OBJ),
    "recommend": (PERSON_SUB, THING_OBJ),
    "recommend further": (PERSON_SUB, THING_OBJ),
    "reminisce": (PERSON_SUB, THING_OBJ),
    "resign": (PERSON_SUB, THING_OBJ),
    "split": (PERSON_SUB, THING_OBJ),
    "take care": (PERSON_SUB, ["person", "thing"]),
    "acknowledge": (PERSON_SUB, THING_OBJ),
    "admit": (PERSON_SUB, THING_OBJ),
    "assure": (PERSON_SUB, PERSON_OBJ),
    "attempt": (PERSON_SUB, THING_OBJ),
    "award": (PERSON_SUB, ["person", "thing"]),
    "cause": (BROAD_SUB, THING_OBJ),
    "connect": (PERSON_SUB, THING_OBJ),
    "demand": (PERSON_SUB, THING_OBJ),
    "designate": (PERSON_SUB, THING_OBJ),
    "direct": (PERSON_SUB, ["person", "thing"]),
    "embrace": (PERSON_SUB, ["person", "thing"]),
    "enable": (PERSON_SUB, THING_OBJ),
    "equip": (PERSON_SUB, THING_OBJ),
    "grant": (PERSON_SUB, THING_OBJ),
    "hand": (PERSON_SUB, THING_OBJ),
    "implement": (PERSON_SUB, THING_OBJ),
    "introduce": (PERSON_SUB, ["person", "thing"]),
    "justify": (PERSON_SUB, THING_OBJ),
    "oblige": (PERSON_SUB, PERSON_OBJ),
    "perform": (PERSON_SUB, THING_OBJ),
    "pick up": (PERSON_SUB, THING_OBJ),
    "please": (BROAD_SUB, PERSON_OBJ),
    "prepare": (PERSON_SUB, THING_OBJ),
    "prevent": (PERSON_SUB, THING_OBJ),
    "profess": (PERSON_SUB, THING_OBJ),
    "regard": (PERSON_SUB, THING_OBJ),
    "repeat": (PERSON_SUB, THING_OBJ),
    "represent": (PERSON_SUB, ["person", "thing"]),
    "require": (PERSON_SUB, THING_OBJ),
    "sacrifice": (PERSON_SUB, THING_OBJ),
    "secure": (PERSON_SUB, THING_OBJ),
    "spread": (PERSON_SUB, THING_OBJ),
    "state": (PERSON_SUB, THING_OBJ),
    "underline": (PERSON_SUB, THING_OBJ),
}

# Intransitives that stay vi (even if agentive).
VI_FORCE = {
    "sleep", "wait", "walk", "walk for some time", "walk out", "work", "come",
    "come back", "come from", "go", "go in", "go across", "arrive", "run",
    "sit", "stand", "lie", "live", "stay", "die", "awaken", "fall", "fall in",
    "rise", "grow", "appear", "disappear", "happen", "occur", "take place",
    "take part", "succeed", "fail", "make it", "proceed", "act", "function",
    "operate", "exist", "seem", "sound", "belong", "depend", "hinge on",
    "consist of", "comprise", "constitute", "contain", "concern", "result in",
    "amount to", "correspond", "suffice", "last", "end", "ensue", "arise",
    "be", "become", "be able to", "be called", "be located", "be missing",
    "be subject to", "be widespread", "be (habitually", "can be seen",
    "it is known", "it is needed", "it is worth", "one can", "may", "must",
    "should", "ought", "can",
}

# ---------------------------------------------------------------------------
# Adjectives: concept → domains
# ---------------------------------------------------------------------------

ADJ_DOMAINS: dict[str, list[str]] = {
    # human / animate-leaning
    "young": ["human"],
    "ill": ["human"],
    "curious": ["human", "evaluative"],
    "friendly": ["human", "evaluative"],
    "satisfied": ["human"],
    "competent": ["human", "evaluative"],
    "personal": ["human"],
    "alone": ["human"],
    "tall": ["human", "physical"],
    "nice": ["human", "evaluative", "physical"],
    "famous": ["human", "evaluative"],
    "well-known": ["human", "evaluative"],
    "holy": ["human", "evaluative"],
    "human": ["human"],
    "active": ["human", "evaluative"],
    "ready": ["human", "evaluative", "physical"],
    # taste
    "tasty": ["taste"],
    # nationality / origin
    "polish": ["nationality"],
    "german": ["nationality"],
    "american": ["nationality"],
    "british": ["nationality"],
    "french": ["nationality"],
    "italian": ["nationality"],
    "spanish": ["nationality"],
    "russian": ["nationality"],
    "chinese": ["nationality"],
    "japanese": ["nationality"],
    "greek": ["nationality"],
    "swedish": ["nationality"],
    "austrian": ["nationality"],
    "bavarian": ["nationality"],
    "prussian": ["nationality"],
    "english": ["nationality"],
    "european": ["nationality"],
    "roman": ["nationality"],
    "warsaw (adj": ["nationality"],
    "national": ["nationality", "evaluative"],
    "international": ["nationality", "evaluative"],
    "local": ["nationality", "physical"],
    # temporal
    "first": ["temporal", "evaluative"],
    "second": ["temporal"],
    "third": ["temporal"],
    "last": ["temporal", "evaluative"],
    "next": ["temporal"],
    "previous": ["temporal"],
    "former": ["temporal", "evaluative"],
    "early": ["temporal"],
    "late": ["temporal"],
    "future": ["temporal"],
    "present": ["temporal", "evaluative"],
    "present-day": ["temporal"],
    "contemporary": ["temporal", "evaluative"],
    "then": ["temporal"],
    "earlier": ["temporal"],
    "subsequent": ["temporal"],
    "successive": ["temporal"],
    "following": ["temporal"],
    "simultaneous": ["temporal"],
    "frequent": ["temporal", "evaluative"],
    "rare": ["temporal", "evaluative"],
    "regular": ["temporal", "evaluative"],
    "modern": ["temporal", "evaluative"],
    "traditional": ["temporal", "evaluative"],
    "historical": ["temporal", "evaluative"],
    "old": ["temporal", "physical", "human"],
    "new": ["temporal", "physical", "evaluative"],
    # physical
    "big": ["physical", "open"],
    "small": ["physical", "open"],
    "not big": ["physical"],
    "great": ["physical", "evaluative"],
    "immense": ["physical", "evaluative"],
    "long": ["physical"],
    "short": ["physical", "temporal"],
    "high": ["physical"],
    "low": ["physical"],
    "wide": ["physical"],
    "narrow": ["physical"],
    "deep": ["physical"],
    "heavy": ["physical"],
    "dense": ["physical"],
    "tight": ["physical"],
    "full": ["physical", "evaluative"],
    "empty": ["physical"],
    "clean": ["physical", "evaluative"],
    "bright": ["physical"],
    "dark": ["physical"],
    "black": ["physical"],
    "white": ["physical"],
    "red": ["physical"],
    "green": ["physical"],
    "golden": ["physical"],
    "fast": ["physical", "evaluative"],
    "slow": ["physical", "evaluative"],
    "strong": ["physical", "human", "evaluative"],
    "weak": ["physical", "human", "evaluative"],
    "hard": ["physical"],
    "soft": ["physical"],
    "hot": ["physical", "taste"],
    "cold": ["physical", "taste"],
    "warm": ["physical"],
    "open": ["physical", "evaluative"],
    "close": ["physical"],
    "near": ["physical"],
    "far": ["physical"],
    "distant": ["physical", "temporal"],
    "central": ["physical"],
    "internal": ["physical"],
    "outer": ["physical"],
    "upper": ["physical"],
    "middle": ["physical", "temporal"],
    "whole": ["physical", "evaluative"],
    "entire": ["physical", "evaluative"],
    "total": ["physical", "evaluative"],
    "complete": ["physical", "evaluative"],
    "straight": ["physical", "evaluative"],
    "round": ["physical"],
    "situated": ["physical"],
    "available": ["physical", "evaluative"],
    # evaluative / open-leaning
    "good": ["evaluative", "open"],
    "bad": ["evaluative", "open"],
    "beautiful": ["evaluative", "physical"],
    "important": ["evaluative", "open"],
    "difficult": ["evaluative", "open"],
    "easy": ["evaluative", "open"],
    "possible": ["evaluative", "open"],
    "necessary": ["evaluative", "open"],
    "needed": ["evaluative", "open"],
    "true": ["evaluative", "open"],
    "real": ["evaluative", "open"],
    "actual": ["evaluative", "open"],
    "correct": ["evaluative"],
    "sure": ["evaluative"],
    "safe": ["evaluative", "physical"],
    "serious": ["evaluative", "human"],
    "strange": ["evaluative", "open"],
    "special": ["evaluative", "open"],
    "significant": ["evaluative", "open"],
    "essential": ["evaluative", "open"],
    "critical": ["evaluative"],
    "positive": ["evaluative"],
    "favourable": ["evaluative"],
    "successful": ["evaluative"],
    "outstanding": ["evaluative"],
    "suitable": ["evaluative", "open"],
    "befitting": ["evaluative"],
    "common": ["evaluative", "open"],
    "usual": ["evaluative", "open"],
    "typical": ["evaluative", "open"],
    "different": ["evaluative", "open"],
    "similar": ["evaluative", "open"],
    "same": ["evaluative", "open"],
    "other": ["evaluative", "open"],
    "various": ["evaluative", "open"],
    "free": ["evaluative", "physical"],
    "private": ["evaluative"],
    "public": ["evaluative"],
    "official": ["evaluative"],
    "political": ["evaluative"],
    "economic": ["evaluative"],
    "financial": ["evaluative"],
    "social": ["evaluative", "human"],
    "military": ["evaluative"],
    "scientific": ["evaluative"],
    "technical": ["evaluative"],
    "natural": ["evaluative", "physical"],
    "independent": ["evaluative", "human"],
    "main": ["evaluative", "open"],
    "basic": ["evaluative", "open"],
    "general": ["evaluative", "open"],
    "absolute": ["evaluative"],
    "relative": ["evaluative"],
    "probable": ["evaluative"],
    "presumed": ["evaluative"],
    "so-called": ["evaluative"],
    "own": ["evaluative", "open"],
    "only": ["evaluative", "open"],
    "all": ["evaluative", "open"],
    "each": ["evaluative", "open"],
    "some": ["evaluative", "open"],
    "numerous": ["evaluative", "physical"],
    "additional": ["evaluative", "open"],
    "remaining": ["evaluative", "open"],
    "original": ["evaluative"],
    "pure": ["evaluative", "physical"],
    "clear": ["evaluative", "physical"],
    "exact": ["evaluative"],
    "concrete": ["evaluative"],
    "direct": ["evaluative"],
    "immediate": ["evaluative", "temporal"],
    "exclusive": ["evaluative"],
    "extensive": ["evaluative", "physical"],
    "comprehensive": ["evaluative"],
    "increasing": ["evaluative", "temporal"],
    "maximum": ["evaluative", "physical"],
    "predominant": ["evaluative"],
    "corresponding": ["evaluative"],
    "pertaining": ["evaluative"],
    "recommended": ["evaluative"],
    "documented": ["evaluative"],
    "planned": ["evaluative", "temporal"],
    "fixed": ["evaluative", "physical"],
    "certain": ["evaluative", "open"],
    "quite": ["evaluative", "open"],
    "anew": ["temporal"],
    "family": ["human", "evaluative"],
    "city": ["physical", "nationality"],
    "state": ["evaluative", "nationality"],
    "state-owned": ["evaluative"],
    "world": ["evaluative", "physical"],
    "worldwide": ["evaluative"],
    "catholic": ["human", "evaluative"],
    "protestant": ["human", "evaluative"],
    "eastern": ["physical", "nationality"],
    "western": ["physical", "nationality"],
    "northern": ["physical", "nationality"],
    "southern": ["physical", "nationality"],
    "classical": ["evaluative", "temporal"],
    "individual": ["human", "evaluative"],
    "unfamiliar": ["evaluative", "human"],
    "head": ["evaluative"],
}

# ---------------------------------------------------------------------------
# Morphology surface repairs in grammar.json
# ---------------------------------------------------------------------------

PL_FIN_FIX = {
    "powiedzieć": "powie",
    "opowiedzieć": "opowie",
    "wiedzieć": "wie",
    "jechać": "jedzie",
    "przyjechać": "przyjedzie",
    "dotrzeć": "dotrze",
    "zrobić": "zrobi",
    "dać": "da",
    "zabrać": "zabierze",
    "dostać": "dostanie",
    "zostać": "zostanie",
    "wybrać": "wybierze",
    "spotkać": "spotka",
    "otworzyć": "otworzy",
    "zatrzymać": "zatrzyma",
    "zapomnieć": "zapomni",
    "ukryć": "ukryje",
    "wygrać": "wygra",
    "kupić": "kupi",
    "stracić": "straci",
    "zachować": "zachowa",
    "zostawić": "zostawi",
    "postawić": "postawi",
    "rozumieć": "rozumie",
    "zrozumieć": "zrozumie",
    "myśleć": "myśli",
    "pomyśleć": "pomyśli",
    "słyszeć": "słyszy",
    "usłyszeć": "usłyszy",
    "patrzeć": "patrzy",
    "spojrzeć": "spojrzy",
    "siedzieć": "siedzi",
    "stać": "stoi",
    "musieć": "musi",
    "chcieć": "chce",
    "móc": "może",
    "żyć": "żyje",
    "brać": "bierze",
    "iść": "idzie",
    "jeść": "je",
    "pić": "pije",
    "mieć": "ma",
    "być": "jest",
}

DE_LEMMA_PARTICIPLE_HINT = {
    # Fixed at morph runtime; also normalize fin when clearly wrong.
}


def en_lemma(word: dict[str, Any]) -> str:
    en = (word.get("langs") or {}).get("en") or {}
    lemma = (en.get("lemma") or "").strip().lower()
    return re.sub(r"^to\s+", "", lemma)


def concept_key(word: dict[str, Any]) -> str:
    c = (word.get("concept") or "").strip().lower()
    return c or en_lemma(word)


def noun_sem(concept: str) -> list[str]:
    c = concept.lower().strip()
    tags: list[str] = []
    if c in PERSON or c.endswith("man") or c.endswith("woman") or c.endswith("person"):
        tags.append("person")
    if c in ANIMAL:
        tags.append("animal")
    if c in PLACE or c.endswith("land") or c.endswith("town") or c.endswith("city"):
        tags.append("place")
    if c in FOOD or "food" in c or c.endswith("meal"):
        tags.append("food")
    if c in DRINK or c in {"tea", "coffee", "milk", "beer", "wine", "juice"}:
        tags.append("drink")
    if c in READABLE:
        tags.append("readable")
    if c in THING_EXPLICIT:
        tags.append("thing")
    # Heuristics for leftover person-like roles.
    if not tags and any(
        c.endswith(sfx)
        for sfx in ("teacher", "worker", "player", "member", "leader", "owner")
    ):
        tags.append("person")
    if not tags and c in {"police", "army", "troop", "national team", "team", "group", "society", "committee", "organization", "association", "corporation", "company", "government", "public"}:
        # Collective: treat as person for agentive frames, plus thing.
        tags.extend(["person", "thing"])
    if not tags:
        tags.append("thing")
    # Dedup preserving order
    out: list[str] = []
    for t in tags:
        if t not in out and t in SEM:
            out.append(t)
    return out or ["thing"]


def noun_domains(concept: str, sem: list[str]) -> list[str]:
    c = concept.lower().strip()
    dom: list[str] = []
    if "person" in sem:
        dom.extend(["human", "physical", "evaluative", "nationality"])
    if "animal" in sem:
        dom.extend(["human", "physical", "evaluative"])
    if "place" in sem:
        dom.extend(["physical", "evaluative", "nationality"])
    if "food" in sem or "drink" in sem:
        dom.extend(["physical", "taste", "evaluative"])
    if "readable" in sem:
        dom.extend(["physical", "evaluative"])
    if "thing" in sem:
        dom.extend(["physical", "evaluative"])
    for extra in NOUN_DOMAIN_EXTRA.get(c, []):
        dom.append(extra)
    # Temporal nouns: no human/taste/physical (blocks "tall year", "tasty hour").
    if c in TEMPORAL_NOUNS:
        dom = [d for d in dom if d not in {"human", "taste", "physical"}]
        if "temporal" not in dom:
            dom.append("temporal")
        if "evaluative" not in dom:
            dom.append("evaluative")
    out: list[str] = []
    for d in dom:
        if d not in out and d in DOMAINS:
            out.append(d)
    return out


def verb_frame(concept: str) -> tuple[str, list[str], list[str] | None]:
    c = concept.lower().strip()

    # Exact VT table wins over VI_FORCE (have/want/know are listed in both).
    if c in VT:
        subj, obj = VT[c]
        return "vt", list(subj), list(obj)
    for key, (subj, obj) in VT.items():
        if c.startswith(key + " ") or c.startswith(key + "("):
            return "vt", list(subj), list(obj)

    if c in {"must", "may", "should", "ought", "be able to", "one can", "can"}:
        return "vi", list(PERSON_SUB), None
    if c in VI_FORCE or c in VI_BROAD or c.startswith("be ") or c.startswith("it is"):
        if c in VI_BROAD or (c.startswith("be ") and c not in {"be able to"}) or c.startswith("it is"):
            return "vi", list(BROAD_SUB), None
        if c in {"sleep", "wait", "run", "sit", "stand", "lie", "die", "awaken", "fall", "grow", "appear", "disappear", "come", "come back", "go", "arrive", "walk", "walk for some time", "walk out"}:
            return "vi", list(ANIM_SUB), None
        return "vi", list(PERSON_SUB), None

    # Stem heuristics for unlisted transitives.
    transitive_stems = (
        "have", "want", "need", "make", "give", "take", "know", "buy", "find",
        "get", "put", "set", "keep", "hold", "bring", "send", "show", "use",
        "love", "like", "eat", "drink", "read", "write", "see", "hear", "tell",
        "say", "ask", "call", "open", "close", "build", "create", "destroy",
        "change", "choose", "pay", "sell", "help", "meet", "visit", "teach",
        "learn", "study", "understand", "remember", "forget", "believe",
        "expect", "prefer", "offer", "receive", "obtain", "reach", "achieve",
        "solve", "check", "count", "mark", "sign", "kill", "hit", "hide",
        "carry", "push", "pull", "throw", "lift", "raise", "lay", "leave",
        "follow", "join", "support", "serve", "treat", "order", "allow",
        "require", "accept", "abandon", "announce", "describe", "explain",
        "publish", "produce", "form", "found", "establish", "organize", "plan",
        "prepare", "prevent", "replace", "collect", "share", "spend", "pass",
        "drive", "ride", "play", "watch", "observe", "notice", "discover",
        "recognize", "inform", "convince", "appoint", "employ", "hire",
        "award", "grant", "deliver", "transfer", "occupy", "secure",
    )
    for stem in transitive_stems:
        if c == stem or c.startswith(stem + " ") or c.startswith(stem + "("):
            if stem == "eat":
                return "vt", list(ANIM_SUB), list(FOOD_OBJ)
            if stem == "drink":
                return "vt", list(ANIM_SUB), list(DRINK_OBJ)
            if stem in {"read", "write", "publish"}:
                return "vt", list(PERSON_SUB), list(READ_OBJ)
            if stem in {"see", "hear", "watch", "love", "like"}:
                return "vt", list(ANIM_SUB), list(THING_OBJ)
            if stem in {"help", "meet", "appoint", "employ", "hire", "inform", "convince"}:
                return "vt", list(PERSON_SUB), list(PERSON_OBJ)
            if stem == "visit":
                return "vt", list(PERSON_SUB), ["person", "place"]
            if stem == "kill":
                return "vt", list(PERSON_SUB), list(ANIM_OBJ)
            return "vt", list(PERSON_SUB), list(THING_OBJ)

    if c in VI_PERSON_ONLY or c in VI_PERSON:
        return "vi", list(PERSON_SUB if c in VI_PERSON_ONLY else ANIM_SUB), None
    return "vi", list(PERSON_SUB), None


def adj_domains(concept: str) -> list[str]:
    c = concept.lower().strip()
    if c in ADJ_DOMAINS:
        return list(ADJ_DOMAINS[c])
    # Nationality-looking adjectives
    if c.endswith("ian") or c.endswith("ish") or c.endswith("ese") or c.endswith("ic"):
        if c in {"basic", "classic", "public", "specific", "economic", "historic"}:
            return ["evaluative", "open"]
        # weak heuristic — prefer evaluative open for unknown -ic
        if c.endswith("ese") or c in {"polish", "english", "spanish", "swedish", "turkish", "danish", "finnish"}:
            return ["nationality"]
    # Default: open evaluative so common adjectives still attach.
    return ["evaluative", "open"]


def fix_surfaces(word: dict[str, Any]) -> None:
    langs = word.get("langs") or {}
    pl = langs.get("pl")
    if isinstance(pl, dict):
        lemma = (pl.get("lemma") or "").strip().lower()
        if lemma in PL_FIN_FIX:
            pl["fin"] = PL_FIN_FIX[lemma]
        # Broken -ieć → *…e fin from naive strip.
        fin = (pl.get("fin") or "").strip().lower()
        if lemma.endswith("iedzieć") and fin.endswith("iedzie"):
            pl["fin"] = PL_FIN_FIX.get(lemma, fin)
        if lemma == "powiedzieć" and fin in {"powiedzie", "powiedzieć"}:
            pl["fin"] = "powie"
        if lemma == "opowiedzieć" and fin.startswith("opowiedzie"):
            pl["fin"] = "opowie"
    de = langs.get("de")
    if isinstance(de, dict):
        lemma = (de.get("lemma") or "").strip().lower()
        # wollen 3sg is will (not wollt); müssen → muss; wissen → weiß
        de_fin = {
            "wollen": "will",
            "müssen": "muss",
            "wissen": "weiß",
            "können": "kann",
            "dürfen": "darf",
            "mögen": "mag",
            "sollen": "soll",
            "arbeiten": "arbeitet",
            "erreichen": "erreicht",
            "nehmen": "nimmt",
            "geben": "gibt",
            "helfen": "hilft",
            "halten": "hält",
            "lassen": "lässt",
            "verlassen": "verlässt",
            "treffen": "trifft",
            "vergessen": "vergisst",
            "wachsen": "wächst",
            "fallen": "fällt",
            "schlagen": "schlägt",
            "fahren": "fährt",
            "laufen": "läuft",
            "sehen": "sieht",
            "lesen": "liest",
            "essen": "isst",
            "sprechen": "spricht",
            "brechen": "bricht",
            "nehmen": "nimmt",
            "geben": "gibt",
            "treten": "tritt",
            "gelten": "gilt",
            "werden": "wird",
            "sein": "ist",
            "haben": "hat",
            "gehen": "geht",
            "kommen": "kommt",
            "stehen": "steht",
            "tun": "tut",
        }
        if lemma in de_fin:
            de["fin"] = de_fin[lemma]
    en = langs.get("en")
    if isinstance(en, dict):
        lemma = re.sub(r"^to\s+", "", (en.get("lemma") or "").strip().lower())
        # Ensure 3sg for be/go/do/have and invariant modals (*musts, *be able tos).
        en_fin = {
            "be": "is",
            "go": "goes",
            "do": "does",
            "have": "has",
            "say": "says",
            "must": "must",
            "can": "can",
            "may": "may",
            "should": "should",
            "ought": "ought",
            "will": "will",
            "shall": "shall",
            "would": "would",
            "could": "could",
            "might": "might",
            "be able to": "is able to",
            "one can": "one can",
        }
        if lemma in en_fin:
            en["fin"] = en_fin[lemma]


def annotate_word(word: dict[str, Any]) -> None:
    pos = word.get("pos")
    concept = concept_key(word)
    if not concept:
        return
    if pos == "noun":
        sem = noun_sem(concept)
        word["sem"] = sem
        word["domains"] = noun_domains(concept, sem)
        word.pop("valence", None)
        word.pop("subject", None)
        word.pop("object", None)
    elif pos == "verb":
        valence, subject, obj = verb_frame(concept)
        word["valence"] = valence
        word["subject"] = subject
        if obj:
            word["object"] = obj
        else:
            word.pop("object", None)
        word.pop("sem", None)
        word.pop("domains", None)
    elif pos == "adjective":
        word["domains"] = adj_domains(concept)
        word.pop("sem", None)
        word.pop("valence", None)
        word.pop("subject", None)
        word.pop("object", None)
    fix_surfaces(word)


def copy_tags_across_concept(words: dict[str, dict[str, Any]]) -> None:
    """Ensure all entries sharing a concept get the same restriction tags."""
    by_concept: dict[str, list[str]] = {}
    for wid, word in words.items():
        c = concept_key(word)
        if not c:
            continue
        by_concept.setdefault(f"{word.get('pos')}:{c}", []).append(wid)

    for _key, ids in by_concept.items():
        if len(ids) < 2:
            continue
        # Prefer an already-annotated entry; otherwise first.
        canonical = words[ids[0]]
        for wid in ids[1:]:
            other = words[wid]
            for field in ("sem", "domains", "valence", "subject", "object"):
                if field in canonical:
                    other[field] = json.loads(json.dumps(canonical[field]))
                elif field in other:
                    other.pop(field, None)


def summarize(words: dict[str, dict[str, Any]]) -> None:
    nouns = [w for w in words.values() if w.get("pos") == "noun"]
    verbs = [w for w in words.values() if w.get("pos") == "verb"]
    adjs = [w for w in words.values() if w.get("pos") == "adjective"]
    thing_only = sum(1 for w in nouns if w.get("sem") == ["thing"])
    vt = sum(1 for w in verbs if w.get("valence") == "vt")
    loose_subj = sum(
        1
        for w in verbs
        if set(w.get("subject") or []) >= {"person", "animal", "thing", "place"}
    )
    with_dom = sum(1 for w in adjs if w.get("domains"))
    print(
        f"nouns={len(nouns)} thing_only={thing_only} "
        f"verbs={len(verbs)} vt={vt} loose_subj={loose_subj} "
        f"adjs={len(adjs)} with_domains={with_dom}",
        file=sys.stderr,
    )


def main() -> int:
    data = json.loads(GRAMMAR_PATH.read_text(encoding="utf-8"))
    words: dict[str, dict[str, Any]] = data["words"]
    for word in words.values():
        annotate_word(word)
    copy_tags_across_concept(words)
    # Second pass: re-copy after annotation so pl-/de- duplicates match.
    copy_tags_across_concept(words)
    data["version"] = max(int(data.get("version") or 1), 2)
    GRAMMAR_PATH.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    summarize(words)
    print(f"Wrote {GRAMMAR_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
