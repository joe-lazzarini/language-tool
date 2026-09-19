#!/usr/bin/env python3
"""Build public/data/words.json from the KWJP lemma list + English Wiktionary glosses."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KWJP_DUMP = Path(__file__).resolve().parent / "kwjp-lemmas.txt"
OUT = ROOT / "public" / "data" / "words.json"
USER_AGENT = "PolishVocabFlashcards/1.0 (educational; https://github.com)"

POS_MAP = {
    "Noun": "noun",
    "Verb": "verb",
    "Adjective": "adjective",
    "Adverb": "adverb",
    "Pronoun": "pronoun",
    "Preposition": "preposition",
    "Conjunction": "conjunction",
    "Particle": "particle",
    "Interjection": "interjection",
    "Numeral": "numeral",
    "Determiner": "determiner",
    "Proper noun": "proper noun",
    "Article": "article",
    "Contraction": "contraction",
    "Prefix": "prefix",
    "Suffix": "suffix",
}

SKIP_GLOSS_PREFIXES = (
    "alternative form of",
    "alternative spelling of",
    "plural of",
    "inflection of",
    "obsolete form of",
    "misspelling of",
    "eye dialect of",
    "soft mutation of",
    "abbreviation of",
    "clipping of",
    "form of",
    "latin letter",
    "letter",
)

# Learner-facing overrides for high-frequency function words and parser-hard entries.
# Keys are Polish lemmas; values are (pos, display gloss, accepted English answers).
CORE: dict[str, tuple[str, str, list[str]]] = {
    "w": ("preposition", "in, at", ["in", "at", "on"]),
    "i": ("conjunction", "and", ["and"]),
    "być": ("verb", "to be", ["be", "to be", "exist"]),
    "się": ("pronoun", "oneself (reflexive)", ["oneself", "himself", "herself", "itself", "themselves", "reflexive"]),
    "z": ("preposition", "from, with", ["from", "with", "of", "out of", "since"]),
    "na": ("preposition", "on, onto, for", ["on", "onto", "for", "at"]),
    "nie": ("particle", "not, no", ["not", "no"]),
    "on": ("pronoun", "he", ["he", "it", "him"]),
    "to": ("pronoun", "this, it, that", ["this", "it", "that"]),
    "do": ("preposition", "to, into, until", ["to", "into", "until", "till", "toward", "towards"]),
    "że": ("conjunction", "that", ["that"]),
    "ten": ("pronoun", "this, that", ["this", "that"]),
    "który": ("pronoun", "which, who", ["which", "who", "that"]),
    "mieć": ("verb", "to have", ["have", "to have"]),
    "o": ("preposition", "about, of", ["about", "of", "at"]),
    "jak": ("adverb", "how, as, like", ["how", "as", "like"]),
    "po": ("preposition", "after, along", ["after", "along", "around", "over"]),
    "co": ("pronoun", "what", ["what"]),
    "ale": ("conjunction", "but", ["but"]),
    "od": ("preposition", "from, since", ["from", "since"]),
    "rok": ("noun", "year", ["year"]),
    "za": ("preposition", "behind, for", ["behind", "for", "beyond", "after", "too"]),
    "móc": ("verb", "to be able to, can", ["can", "be able", "to be able", "to be able to", "may", "might"]),
    "przez": ("preposition", "through, by", ["through", "by", "via", "across"]),
    "tak": ("adverb", "yes, so", ["yes", "so", "thus"]),
    "by": ("particle", "would", ["would"]),
    "już": ("adverb", "already", ["already", "yet"]),
    "ja": ("pronoun", "I", ["i", "I"]),
    "swój": ("pronoun", "one's own", ["one's own", "own", "my", "his", "her", "its", "our", "your", "their"]),
    "dla": ("preposition", "for", ["for"]),
    "tylko": ("adverb", "only, just", ["only", "just", "except"]),
    "taki": ("pronoun", "such, like this", ["such", "like this", "this kind"]),
    "czy": ("particle", "whether (question word)", ["whether", "or", "if"]),
    "bardzo": ("adverb", "very", ["very"]),
    "jeden": ("numeral", "one", ["one"]),
    "czas": ("noun", "time", ["time"]),
    "sam": ("adjective", "alone, himself", ["alone", "himself", "itself", "same"]),
    "inny": ("adjective", "other, another", ["other", "another", "different"]),
    "też": ("adverb", "also, too", ["also", "too", "as well"]),
    "jednak": ("conjunction", "however", ["however", "nevertheless", "yet"]),
    "bo": ("conjunction", "because", ["because", "for", "since"]),
    "chcieć": ("verb", "to want", ["want", "to want"]),
    "mówić": ("verb", "to speak, to say", ["speak", "to speak", "say", "to say", "tell", "to tell"]),
    "przed": ("preposition", "before, in front of", ["before", "in front of", "ahead of"]),
    "jeszcze": ("adverb", "still, yet, more", ["still", "yet", "more", "another"]),
    "człowiek": ("noun", "human, person", ["human", "person", "man", "human being"]),
    "zostać": ("verb", "to become, to remain", ["become", "to become", "remain", "to remain", "stay", "to stay"]),
    "raz": ("noun", "time, once", ["time", "once"]),
    "nawet": ("adverb", "even", ["even"]),
    "my": ("pronoun", "we", ["we", "us"]),
    "pierwszy": ("adjective", "first", ["first"]),
    "wszystko": ("pronoun", "everything", ["everything", "all"]),
    "musieć": ("verb", "must, to have to", ["must", "have to", "to have to", "need to"]),
    "pod": ("preposition", "under", ["under", "underneath", "below"]),
    "cały": ("adjective", "whole, entire", ["whole", "entire", "complete", "all"]),
    "przy": ("preposition", "by, next to", ["by", "next to", "near", "at"]),
    "dwa": ("numeral", "two", ["two"]),
    "wiedzieć": ("verb", "to know", ["know", "to know"]),
    "gdy": ("conjunction", "when", ["when", "as"]),
    "życie": ("noun", "life", ["life"]),
    "miejsce": ("noun", "place", ["place", "spot", "site"]),
    "dzień": ("noun", "day", ["day"]),
    "oraz": ("conjunction", "and, as well as", ["and", "as well as"]),
    "nowy": ("adjective", "new", ["new"]),
    "nasz": ("pronoun", "our", ["our", "ours"]),
    "duży": ("adjective", "big, large", ["big", "large"]),
    "każdy": ("pronoun", "each, every", ["each", "every", "everyone"]),
    "więc": ("conjunction", "so, therefore", ["so", "therefore", "thus"]),
    "mój": ("pronoun", "my", ["my", "mine"]),
    "dobry": ("adjective", "good", ["good"]),
    "można": ("verb", "one can, it is possible", ["one can", "it is possible", "can"]),
    "drugi": ("adjective", "second, other", ["second", "other"]),
    "jaki": ("pronoun", "what, what kind of", ["what", "what kind", "what kind of", "which"]),
    "kiedy": ("adverb", "when", ["when"]),
    "jako": ("preposition", "as", ["as"]),
    "stać": ("verb", "to stand; to afford", ["stand", "to stand", "afford", "to afford"]),
    "także": ("adverb", "also", ["also", "too", "as well"]),
    "wszystek": ("adjective", "all, every", ["all", "every"]),
    "powiedzieć": ("verb", "to say, to tell", ["say", "to say", "tell", "to tell", "speak", "to speak"]),
    "wiele": ("numeral", "many, much", ["many", "much", "a lot"]),
    "u": ("preposition", "at, at the home of", ["at", "by", "with", "chez", "at the home of"]),
    "ty": ("pronoun", "you", ["you"]),
    "oni": ("pronoun", "they", ["they"]),
    "ona": ("pronoun", "she", ["she", "her"]),
    "ono": ("pronoun", "it", ["it"]),
    "wy": ("pronoun", "you (plural)", ["you", "you all", "y'all"]),
    "bez": ("preposition", "without", ["without"]),
    "ze": ("preposition", "from, with (before cluster)", ["from", "with", "of"]),
    "ku": ("preposition", "toward", ["toward", "towards", "to"]),
    "we": ("preposition", "in (before cluster)", ["in", "at"]),
    "że": ("conjunction", "that", ["that"]),
    "jeśli": ("conjunction", "if", ["if"]),
    "jeżeli": ("conjunction", "if", ["if"]),
    "gdyby": ("conjunction", "if (hypothetical)", ["if"]),
    "żeby": ("conjunction", "so that, in order to", ["so that", "in order to", "to"]),
    "aby": ("conjunction", "so that, in order to", ["so that", "in order to", "to"]),
    "czyli": ("conjunction", "that is, or", ["that is", "or", "i.e."]),
    "albo": ("conjunction", "or", ["or"]),
    "lub": ("conjunction", "or", ["or"]),
    "ani": ("conjunction", "nor, neither", ["nor", "neither", "or"]),
    "lecz": ("conjunction", "but", ["but"]),
    "natomiast": ("conjunction", "whereas, however", ["whereas", "however", "on the other hand"]),
    "znowu": ("adverb", "again", ["again"]),
    "znów": ("adverb", "again", ["again"]),
    "teraz": ("adverb", "now", ["now"]),
    "tu": ("adverb", "here", ["here"]),
    "tutaj": ("adverb", "here", ["here"]),
    "tam": ("adverb", "there", ["there"]),
    "zawsze": ("adverb", "always", ["always"]),
    "nigdy": ("adverb", "never", ["never"]),
    "często": ("adverb", "often", ["often", "frequently"]),
    "potem": ("adverb", "then, afterwards", ["then", "afterwards", "after", "later"]),
    "dlatego": ("adverb", "therefore, that's why", ["therefore", "that's why", "thus"]),
    "dlaczego": ("adverb", "why", ["why"]),
    "jako": ("preposition", "as", ["as"]),
    "między": ("preposition", "between, among", ["between", "among"]),
    "wśród": ("preposition", "among", ["among", "amongst"]),
    "przeciw": ("preposition", "against", ["against"]),
    "przeciwko": ("preposition", "against", ["against"]),
    "według": ("preposition", "according to", ["according to"]),
    "dzięki": ("preposition", "thanks to", ["thanks to", "due to"]),
    "podczas": ("preposition", "during", ["during"]),
    "wokół": ("preposition", "around", ["around"]),
    "obok": ("preposition", "beside, next to", ["beside", "next to", "alongside"]),
    "nad": ("preposition", "above, over", ["above", "over"]),
    "ponad": ("preposition", "over, more than", ["over", "above", "more than"]),
    "poza": ("preposition", "beyond, except", ["beyond", "except", "outside"]),
    "wobec": ("preposition", "towards, in the face of", ["towards", "toward", "in the face of", "vis-à-vis"]),
    "Polska": ("proper noun", "Poland", ["poland", "Poland"]),
    "Europa": ("proper noun", "Europe", ["europe", "Europe"]),
    "Kraków": ("proper noun", "Kraków, Cracow", ["kraków", "krakow", "cracow", "Kraków", "Krakow", "Cracow"]),
    "Niemcy": ("proper noun", "Germany", ["germany", "Germany", "germans", "Germans"]),
    "problem": ("noun", "problem", ["problem", "issue"]),
    "pani": ("noun", "Mrs, ma'am, lady", ["mrs", "ms", "miss", "ma'am", "madam", "lady", "woman"]),
    "pan": ("noun", "Mr, sir, gentleman", ["mr", "sir", "gentleman", "lord", "man"]),
    "śmierć": ("noun", "death", ["death"]),
    "okres": ("noun", "period", ["period", "time", "era"]),
    "program": ("noun", "program, programme", ["program", "programme"]),
    "funkcja": ("noun", "function", ["function", "role"]),
    "styczeń": ("noun", "January", ["january", "January"]),
    "luty": ("noun", "February", ["february", "February"]),
    "marzec": ("noun", "March", ["march", "March"]),
    "kwiecień": ("noun", "April", ["april", "April"]),
    "maj": ("noun", "May", ["may", "May"]),
    "czerwiec": ("noun", "June", ["june", "June"]),
    "lipiec": ("noun", "July", ["july", "July"]),
    "sierpień": ("noun", "August", ["august", "August"]),
    "wrzesień": ("noun", "September", ["september", "September"]),
    "październik": ("noun", "October", ["october", "October"]),
    "listopad": ("noun", "November", ["november", "November"]),
    "grudzień": ("noun", "December", ["december", "December"]),
    "bywać": ("verb", "to be (habitually); to frequent", ["be", "to be", "frequent", "to frequent", "happen to be"]),
    "warszawski": ("adjective", "Warsaw (adj.), Varsovian", ["warsaw", "varsovian", "of warsaw"]),
    "rozmawiać": ("verb", "to talk, to converse", ["talk", "to talk", "converse", "to converse", "speak", "to speak"]),
}


def parse_kwjp(path: Path) -> list[tuple[int, str]]:
    words: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(\d+)[.\t]\s*(.+)$", line.strip())
        if m:
            words.append((int(m.group(1)), m.group(2)))
    return words


def strip_templates(text: str) -> str:
    while True:
        start = text.rfind("{{")
        if start < 0:
            return text
        end = text.find("}}", start)
        if end < 0:
            return text[:start]
        text = text[:start] + " " + text[end + 2 :]


def replace_links(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        inner = m.group(1)
        if "|" in inner:
            return inner.split("|", 1)[1]
        return inner.split("#", 1)[0]

    return re.sub(r"\[\[([^\]]+)\]\]", repl, text)


def clean_markup(text: str) -> str:
    text = strip_templates(text)
    text = replace_links(text)
    text = re.sub(r"'''+|''", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("[[", "").replace("]]", "")
    text = re.sub(r"\s+", " ", text).strip(" \t.,;:·–—")
    return text


def polish_section(wikitext: str) -> str | None:
    m = re.search(r"^==Polish==\s*$", wikitext, re.M)
    if not m:
        return None
    start = m.end()
    n = re.search(r"^==[^=].*?==\s*$", wikitext[start:], re.M)
    end = start + n.start() if n else len(wikitext)
    return wikitext[start:end]


def gloss_from_templates(line: str) -> str | None:
    patterns = [
        r"\{\{tcl\|pl\|([^|}]+)",
        r"\{\{l\|en\|([^|}]+)",
        r"\{\{place\|pl\|[^}]*?\|t=([^|}]+)",
        r"\{\{demonym-adj\|pl\|([^|}]+)",
        r"\{\{femeq\|pl\|[^}]*?\|t=\[\[([^\]]+)\]\]",
        r"\{\{femeq\|pl\|[^}]*?\|t=([^|}]+)",
        r"\{\{syn of\|pl\|[^}]*?\|t=\[\[([^\]]+)\]\]",
        r"\{\{synonym of\|pl\|[^}]*?\|t=\[\[([^\]]+)\]\]",
        r"\{\{frequentative of\|pl\|([^|}]+)",
    ]
    for pat in patterns:
        m = re.search(pat, line)
        if m:
            value = replace_links(m.group(1)).strip()
            if value:
                if "frequentative of" in pat:
                    return f"to {value} (habitually)" if not value.startswith("to ") else f"{value} (habitually)"
                return value
    t = re.search(r"\|t=\[\[([^\]]+)\]\]", line)
    if t:
        return replace_links(t.group(1)).strip()
    return None


def is_form_of_line(line: str) -> bool:
    return bool(
        re.search(
            r"\{\{(?:alt form|alternative form of|inflection of|infl of|plural of|obsolete form of|misspelling of)\s*\|",
            line,
        )
    )


def extract_entry(wikitext: str) -> dict | None:
    section = polish_section(wikitext)
    if not section:
        return None

    pos = None
    glosses: list[str] = []

    for raw_line in section.splitlines():
        header = re.match(r"^={3,4}([^=]+?)={3,4}\s*$", raw_line)
        if header:
            name = header.group(1).strip()
            if name in POS_MAP and name != "Letter":
                if pos is None:
                    pos = POS_MAP[name]
            continue

        if not raw_line.startswith("# "):
            continue
        if is_form_of_line(raw_line):
            continue
        if "{{Latn-def" in raw_line:
            continue
        if re.search(r"\{\{lb\|pl\|[^}]*Middle Polish", raw_line):
            continue

        gloss = gloss_from_templates(raw_line)
        if not gloss:
            gloss = clean_markup(raw_line[2:])
        gloss = re.sub(r"\s+", " ", gloss or "").strip(" \t.,;:·–—")
        if not gloss or len(gloss) < 1:
            continue
        low = gloss.lower()
        if any(low.startswith(p) for p in SKIP_GLOSS_PREFIXES):
            continue
        if len(gloss) > 140:
            gloss = re.split(r"[.;]", gloss, maxsplit=1)[0].strip()
            if len(gloss) > 140:
                continue
        glosses.append(gloss)
        if len(glosses) >= 4:
            break

    if not glosses:
        return None

    primary = glosses[0]
    accepted: list[str] = []
    seen: set[str] = set()

    def add_accept(value: str) -> None:
        value = re.sub(r"\s+", " ", value).strip(" \t.,;:()[]")
        value = value.strip("'\"")
        if not value or len(value) > 60:
            return
        key = value.casefold()
        if key in seen:
            return
        seen.add(key)
        accepted.append(value)
        if key.startswith("to ") and len(key) > 3:
            add_accept(value[3:])
        for prefix in ("a ", "an ", "the "):
            if key.startswith(prefix):
                add_accept(value[len(prefix) :])

    for g in glosses:
        add_accept(g)
        for part in re.split(r"[,;/]| or ", g):
            add_accept(part)

    return {
        "pos": pos or "word",
        "en": primary,
        "accepted": accepted[:12],
    }


def fetch_batch(titles: list[str]) -> dict[str, str]:
    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "titles": "|".join(titles),
        "redirects": "1",
        "format": "json",
        "formatversion": "2",
    }
    url = "https://en.wiktionary.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    title_map: dict[str, str] = {t: t for t in titles}
    for n in data.get("query", {}).get("normalized", []):
        title_map[n["from"]] = n["to"]
    redirects: dict[str, str] = {}
    for r in data.get("query", {}).get("redirects", []):
        redirects[r["from"]] = r["to"]

    pages: dict[str, str] = {}
    for page in data.get("query", {}).get("pages", []):
        if page.get("missing"):
            continue
        title = page.get("title")
        revisions = page.get("revisions") or []
        if not revisions:
            continue
        content = revisions[0].get("slots", {}).get("main", {}).get("content")
        if title and content:
            pages[title] = content

    out: dict[str, str] = {}
    for original in titles:
        dest = title_map.get(original, original)
        seen: set[str] = set()
        while dest in redirects and dest not in seen:
            seen.add(dest)
            dest = redirects[dest]
        if dest in pages:
            out[original] = pages[dest]
    return out


def core_entry(lemma: str) -> dict | None:
    if lemma not in CORE:
        return None
    pos, en, accepted = CORE[lemma]
    extra = [en, *accepted]
    seen: set[str] = set()
    clean: list[str] = []
    for item in extra:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean.append(item)
    return {"pos": pos, "en": en, "accepted": clean}


def main() -> None:
    lemmas = parse_kwjp(KWJP_DUMP)
    target = 1000
    pool = lemmas[:1200]  # a little extra in case some lack glosses

    contents: dict[str, str] = {}
    batch_size = 40
    titles = [w for _, w in pool]
    for i in range(0, len(titles), batch_size):
        batch = titles[i : i + batch_size]
        print(f"Fetching {i + 1}-{i + len(batch)} / {len(titles)}")
        try:
            contents.update(fetch_batch(batch))
        except Exception as exc:
            print("batch failed", exc)
            time.sleep(2)
            contents.update(fetch_batch(batch))
        time.sleep(0.4)

    words = []
    skipped = []
    for rank, lemma in pool:
        parsed = core_entry(lemma)
        if parsed is None and lemma in contents:
            parsed = extract_entry(contents[lemma])
        if parsed is None:
            skipped.append((rank, lemma))
            continue
        words.append(
            {
                "id": rank,
                "pl": lemma,
                "pos": parsed["pos"],
                "en": parsed["en"],
                "accepted": parsed["accepted"],
            }
        )
        if len(words) >= target:
            break

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "title": "1000 most common Polish lemmas",
            "count": len(words),
            "frequencySource": {
                "name": "Wiktionary: Frequency lists/Polish/KWJP",
                "url": "https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP",
                "corpus": "Korpus Współczesnego Języka Polskiego (KWJP), 2011–2020",
                "note": "Lemmas merged across parts of speech and ranked by average reduced frequency.",
                "citation": "W. Kieraś et al., Korpus Współczesnego Języka Polskiego. Dekada 2011–2020, Język Polski 105(2):5–20, 2025.",
            },
            "glossSource": {
                "name": "English Wiktionary",
                "url": "https://en.wiktionary.org/",
                "license": "CC BY-SA 4.0 / GFDL",
            },
        },
        "words": words,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT, "count", len(words), "skipped", len(skipped))
    print("skipped sample", skipped[:30])


if __name__ == "__main__":
    main()
