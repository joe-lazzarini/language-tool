"""Attach translations for every registry language the Polish/German build does not already fill.

Closed-class cards are hand-written (BY_PL / BY_DE). Everything else comes from
scripts/cache/wiki-forms.json, produced by scripts/fetch-translations.py.
A hand entry that lists a language as [] is an intentional gap (Russian and
Japanese have no articles) and is not filled from Wiktionary.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from registry import load_registry

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / "cache" / "wiki-forms.json"

# Forms already produced by build-deck.py. A new registry language is not listed
# here; attach_extra_languages fills it from overrides or the Wiktionary cache.
BASE_LANGS = {"en", "pl", "de"}

ROMANIZATION = "romanization"
RU_STRESS = {"\u0301", "\u0300"}
RU_MAP = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}
MACRON = {"ā": ("a", "aa"), "ī": ("i", "ii"), "ū": ("u", "uu"), "ē": ("e", "ee"), "ō": ("o", "ou")}


def rows(*items: str | tuple[str, str]) -> list[dict]:
    out: list[dict] = []
    for item in items:
        if isinstance(item, tuple):
            text, context = item
            row = {"text": text}
            if context:
                row["context"] = context
            out.append(row)
        else:
            out.append({"text": item})
    return out


def j(*triples: tuple[str, str, str]) -> list[dict]:
    """Japanese native form plus romaji. Context on the native form may be empty."""
    out: list[dict] = []
    for native, romaji, context in triples:
        row = {"text": native}
        if context:
            row["context"] = context
        out.append(row)
        if romaji:
            out.append({"text": romaji, "context": ROMANIZATION})
    return out


def L(**kwargs: list) -> dict[str, list]:
    return kwargs


GAP: list = []

BE = L(
    es=rows(("ser", "essence / identity"), ("estar", "state / location")),
    fr=rows("être"),
    it=rows("essere"),
    pt=rows(("ser", "essence / identity"), ("estar", "state / location")),
    nl=rows("zijn"),
    ru=rows("быть"),
    ja=j(
        ("だ", "da", "plain copula"),
        ("です", "desu", "polite"),
        ("である", "dearu", "formal"),
        ("いる", "iru", "animate existence"),
        ("ある", "aru", "inanimate existence"),
    ),
)
HAVE = L(
    es=rows(("tener", "possession"), ("haber", "auxiliary")),
    fr=rows("avoir"),
    it=rows("avere"),
    pt=rows(("ter", "possession"), ("haver", "auxiliary")),
    nl=rows("hebben"),
    ru=rows("иметь"),
    ja=j(("持つ", "motsu", "hold / have"), ("ある", "aru", "possession")),
)
AND = L(
    es=rows(("y", "basic"), ("e", "before i-")),
    fr=rows("et"),
    it=rows(("e", "basic"), ("ed", "before a vowel")),
    pt=rows("e"),
    nl=rows("en"),
    ru=rows("и"),
    ja=j(("と", "to", "and")),
)
OR = L(
    es=rows(("o", "basic"), ("u", "before o-")),
    fr=rows("ou"),
    it=rows(("o", "basic"), ("oppure", "or else")),
    pt=rows("ou"),
    nl=rows("of"),
    ru=rows("или"),
    ja=j(("または", "matawa", ""), ("か", "ka", "or")),
)
NOT = L(
    es=rows(("no", "not / no")),
    fr=rows(("pas", "not"), ("ne", "with a verb"), ("ne pas", "not")),
    it=rows("non"),
    pt=rows("não"),
    nl=rows(("niet", "not"), ("nee", "no")),
    ru=rows(("не", "not"), ("нет", "no")),
    ja=j(("ない", "nai", "not"), ("いいえ", "iie", "no")),
)
THIS = L(
    es=rows(
        ("este", "masculine this"),
        ("esta", "feminine this"),
        ("esto", "neuter this"),
        ("ese", "masculine that"),
        ("esa", "feminine that"),
        ("eso", "neuter that"),
    ),
    fr=rows(("ce", "this / that"), ("cet", "this / that before a vowel"), ("cette", "feminine"), ("ça", "this / that")),
    it=rows(("questo", "masculine this"), ("questa", "feminine this"), ("quello", "masculine that"), ("quella", "feminine that")),
    pt=rows(("este", "masculine this"), ("esta", "feminine this"), ("isto", "neuter this"), ("esse", "that"), ("essa", "feminine that"), ("isso", "neuter that")),
    nl=rows(("deze", "this, common"), ("dit", "this, neuter"), ("die", "that, common"), ("dat", "that, neuter")),
    ru=rows(("этот", "masculine this"), ("эта", "feminine this"), ("это", "neuter this"), ("тот", "masculine that"), ("та", "feminine that"), ("то", "neuter that")),
    ja=j(("この", "kono", "this + noun"), ("これ", "kore", "this"), ("その", "sono", "that + noun"), ("それ", "sore", "that"), ("あの", "ano", "that over there + noun"), ("あれ", "are", "that over there")),
)
THAT_FAR = L(
    es=rows(("ese", "masculine"), ("esa", "feminine"), ("eso", "neuter"), ("aquel", "far, masculine"), ("aquella", "far, feminine")),
    fr=rows(("ce", "this / that"), ("cette", "feminine"), ("cela", "that"), ("ça", "that")),
    it=rows(("quello", "masculine"), ("quella", "feminine")),
    pt=rows(("esse", "masculine"), ("essa", "feminine"), ("aquilo", "neuter far"), ("aquele", "far, masculine")),
    nl=rows(("die", "common"), ("dat", "neuter")),
    ru=rows(("тот", "masculine"), ("та", "feminine"), ("то", "neuter")),
    ja=j(("あの", "ano", "that + noun"), ("あれ", "are", "that")),
)
THE = L(
    es=rows(("el", "masculine"), ("la", "feminine"), ("lo", "neuter")),
    fr=rows(("le", "masculine"), ("la", "feminine"), ("les", "plural")),
    it=rows(("il", "masculine"), ("lo", "masculine before special consonants"), ("la", "feminine")),
    pt=rows(("o", "masculine"), ("a", "feminine")),
    nl=rows(("de", "common"), ("het", "neuter")),
    ru=GAP,
    ja=GAP,
)
A = L(
    es=rows(("un", "masculine"), ("una", "feminine")),
    fr=rows(("un", "masculine"), ("une", "feminine")),
    it=rows(("un", "masculine"), ("uno", "masculine before s+consonant / z"), ("una", "feminine")),
    pt=rows(("um", "masculine"), ("uma", "feminine")),
    nl=rows("een"),
    ru=GAP,
    ja=GAP,
)
IN = L(
    es=rows("en"),
    fr=rows(("dans", "in"), ("à", "at / on"), ("en", "in")),
    it=rows(("in", "in"), ("a", "at")),
    pt=rows("em"),
    nl=rows(("in", "in"), ("op", "on"), ("bij", "at")),
    ru=rows(("в", "in / at"), ("на", "on / at")),
    ja=j(("に", "ni", "at / in"), ("で", "de", "at the place of an action")),
)
FROM = L(
    es=rows(("de", "from / of"), ("con", "with")),
    fr=rows(("de", "from / of"), ("avec", "with")),
    it=rows(("di", "of"), ("da", "from"), ("con", "with")),
    pt=rows(("de", "from / of"), ("com", "with")),
    nl=rows(("van", "from / of"), ("met", "with"), ("uit", "out of")),
    ru=rows(("из", "from / out of"), ("от", "from"), ("с", "with / from")),
    ja=j(("から", "kara", "from"), ("と", "to", "with"), ("の", "no", "of")),
)
I = L(
    es=rows("yo"),
    fr=rows("je"),
    it=rows("io"),
    pt=rows("eu"),
    nl=rows("ik"),
    ru=rows("я"),
    ja=j(("私", "watashi", "I"), ("僕", "boku", "I, often masculine")),
)
YOU = L(
    es=rows(("tú", "informal"), ("usted", "formal")),
    fr=rows(("tu", "informal"), ("vous", "formal / plural")),
    it=rows(("tu", "informal"), ("Lei", "formal")),
    pt=rows(("tu", "informal"), ("você", "you")),
    nl=rows(("jij", "informal"), ("je", "unstressed"), ("u", "formal")),
    ru=rows(("ты", "informal"), ("вы", "formal")),
    ja=j(("あなた", "anata", "you"), ("君", "kimi", "informal")),
)
YOU_PL = L(
    es=rows(("vosotros", "informal masculine, Spain"), ("vosotras", "informal feminine, Spain"), ("ustedes", "plural")),
    fr=rows("vous"),
    it=rows("voi"),
    pt=rows("vocês"),
    nl=rows("jullie"),
    ru=rows("вы"),
    ja=j(("あなたたち", "anatatachi", "you plural")),
)
HE = L(
    es=rows(("él", "he"), ("ello", "it")),
    fr=rows(("il", "he / it")),
    it=rows(("lui", "he"), ("egli", "he, formal")),
    pt=rows("ele"),
    nl=rows("hij"),
    ru=rows("он"),
    ja=j(("彼", "kare", "he")),
)
WE = L(
    es=rows(("nosotros", "masculine / mixed"), ("nosotras", "feminine")),
    fr=rows("nous"),
    it=rows("noi"),
    pt=rows("nós"),
    nl=rows(("wij", "stressed"), ("we", "unstressed")),
    ru=rows("мы"),
    ja=j(("私たち", "watashitachi", "we")),
)
WHAT = L(
    es=rows("qué"),
    fr=rows(("que", "what"), ("quoi", "what, stressed")),
    it=rows(("che", "what"), ("cosa", "what")),
    pt=rows(("que", "what"), ("o que", "what")),
    nl=rows("wat"),
    ru=rows("что", ("shto", "romanization")),
    ja=j(("何", "nani", "what")),
)
WHO = L(
    es=rows("quién"),
    fr=rows("qui"),
    it=rows("chi"),
    pt=rows("quem"),
    nl=rows("wie"),
    ru=rows("кто"),
    ja=j(("誰", "dare", "who")),
)
WHICH = L(
    es=rows(("que", "that / which"), ("cual", "which"), ("quien", "who")),
    fr=rows(("qui", "who"), ("que", "which / that"), ("lequel", "which one, masculine")),
    it=rows(("che", "that / which"), ("quale", "which"), ("cui", "whom / which")),
    pt=rows(("que", "that / which"), ("qual", "which"), ("quem", "who")),
    nl=rows(("die", "who / which, common"), ("dat", "which, neuter"), ("welk", "which")),
    ru=rows(("который", "masculine"), ("которая", "feminine"), ("которое", "neuter")),
    ja=j(("どの", "dono", "which + noun"), ("どれ", "dore", "which")),
)
THAT_COMP = L(
    es=rows("que"),
    fr=rows("que"),
    it=rows("che"),
    pt=rows("que"),
    nl=rows("dat"),
    ru=rows("что", ("shto", "romanization")),
    ja=j(("と", "to", "that, quotation"), ("こと", "koto", "that, nominalizer")),
)
IF = L(
    es=rows("si"),
    fr=rows("si"),
    it=rows("se"),
    pt=rows("se"),
    nl=rows("als"),
    ru=rows("если"),
    ja=j(("もし", "moshi", "if"), ("なら", "nara", "if / given that")),
)
HERE = L(
    es=rows("aquí"),
    fr=rows("ici"),
    it=rows(("qui", "here"), ("qua", "here")),
    pt=rows("aqui"),
    nl=rows("hier"),
    ru=rows(("здесь", "here"), ("тут", "here")),
    ja=j(("ここ", "koko", "here")),
)
TODAY = L(
    es=rows("hoy"),
    fr=rows("aujourd'hui"),
    it=rows("oggi"),
    pt=rows("hoje"),
    nl=rows("vandaag"),
    ru=rows("сегодня"),
    ja=j(("今日", "kyō", "")),
)
AGAIN = L(
    es=rows(("otra vez", "again"), ("de nuevo", "again")),
    fr=rows(("encore", "again"), ("de nouveau", "again")),
    it=rows(("di nuovo", "again"), ("ancora", "again / still")),
    pt=rows(("outra vez", "again"), ("de novo", "again")),
    nl=rows(("weer", "again"), ("opnieuw", "again")),
    ru=rows(("снова", "again"), ("опять", "again")),
    ja=j(("また", "mata", "again"), ("再び", "futatabi", "again")),
)
ALSO = L(
    es=rows("también"),
    fr=rows("aussi"),
    it=rows("anche"),
    pt=rows("também"),
    nl=rows("ook"),
    ru=rows(("тоже", "also"), ("также", "also")),
    ja=j(("も", "mo", "also")),
)
ONE = L(
    es=rows(("uno", "one"), ("una", "feminine"), ("un", "before a noun")),
    fr=rows(("un", "masculine"), ("une", "feminine")),
    it=rows(("uno", "one"), ("una", "feminine")),
    pt=rows(("um", "masculine"), ("uma", "feminine")),
    nl=rows("een"),
    ru=rows(("один", "masculine"), ("одна", "feminine"), ("одно", "neuter")),
    ja=j(("一", "ichi", "one"), ("ひとつ", "hitotsu", "one, general counter")),
)
TWO = L(
    es=rows("dos"),
    fr=rows("deux"),
    it=rows("due"),
    pt=rows(("dois", "masculine"), ("duas", "feminine")),
    nl=rows("twee"),
    ru=rows(("два", "masculine / neuter"), ("две", "feminine")),
    ja=j(("二", "ni", "two"), ("ふたつ", "futatsu", "two, general counter")),
)
MY = L(
    es=rows(("mi", "my"), ("mío", "mine, masculine")),
    fr=rows(("mon", "masculine"), ("ma", "feminine"), ("mes", "plural")),
    it=rows(("mio", "masculine"), ("mia", "feminine")),
    pt=rows(("meu", "masculine"), ("minha", "feminine")),
    nl=rows("mijn"),
    ru=rows(("мой", "masculine"), ("моя", "feminine"), ("моё", "neuter")),
    ja=j(("私の", "watashi no", "my")),
)
YOUR = L(
    es=rows(("tu", "your"), ("tuyo", "yours, masculine")),
    fr=rows(("ton", "informal masculine"), ("ta", "informal feminine"), ("votre", "formal")),
    it=rows(("tuo", "masculine"), ("tua", "feminine")),
    pt=rows(("teu", "informal masculine"), ("tua", "informal feminine"), ("seu", "your")),
    nl=rows(("jouw", "informal"), ("uw", "formal")),
    ru=rows(("твой", "masculine"), ("твоя", "feminine"), ("твоё", "neuter")),
    ja=j(("あなたの", "anata no", "your")),
)
OUR = L(
    es=rows(("nuestro", "masculine"), ("nuestra", "feminine")),
    fr=rows(("notre", "singular"), ("nos", "plural")),
    it=rows(("nostro", "masculine"), ("nostra", "feminine")),
    pt=rows(("nosso", "masculine"), ("nossa", "feminine")),
    nl=rows(("ons", "neuter"), ("onze", "common")),
    ru=rows(("наш", "masculine"), ("наша", "feminine"), ("наше", "neuter")),
    ja=j(("私たちの", "watashitachi no", "our")),
)
OWN = L(
    es=rows(("su", "one's"), ("suyo", "one's own")),
    fr=rows(("son", "masculine"), ("sa", "feminine"), ("ses", "plural")),
    it=rows(("suo", "masculine"), ("sua", "feminine")),
    pt=rows(("seu", "masculine"), ("sua", "feminine")),
    nl=rows(("zijn", "his / one's"), ("haar", "her")),
    ru=rows(("свой", "masculine"), ("своя", "feminine"), ("своё", "neuter")),
    ja=j(("自分の", "jibun no", "one's own")),
)
ALL = L(
    es=rows(("todo", "masculine"), ("toda", "feminine"), ("todos", "plural")),
    fr=rows(("tout", "masculine"), ("toute", "feminine"), ("tous", "plural")),
    it=rows(("tutto", "masculine"), ("tutta", "feminine"), ("tutti", "plural")),
    pt=rows(("todo", "masculine"), ("toda", "feminine"), ("todos", "plural")),
    nl=rows(("al", "all"), ("alle", "all")),
    ru=rows(("весь", "masculine"), ("вся", "feminine"), ("всё", "neuter"), ("все", "plural")),
    ja=j(("全て", "subete", "all"), ("皆", "mina", "everyone")),
)
EACH = L(
    es=rows(("cada", "each / every"), ("todos", "every")),
    fr=rows(("chaque", "each"), ("tous", "every")),
    it=rows(("ogni", "each / every"), ("ciascuno", "each one")),
    pt=rows(("cada", "each"), ("todo", "every")),
    nl=rows(("elk", "each"), ("ieder", "every")),
    ru=rows(("каждый", "masculine"), ("каждая", "feminine"), ("каждое", "neuter")),
    ja=j(("毎", "mai", "every"), ("それぞれ", "sorezore", "each")),
)
SUCH = L(
    es=rows(("tal", "such"), ("así", "like this")),
    fr=rows(("tel", "masculine"), ("telle", "feminine")),
    it=rows("tale"),
    pt=rows("tal"),
    nl=rows(("zulke", "such"), ("zo'n", "such a")),
    ru=rows(("такой", "masculine"), ("такая", "feminine"), ("такое", "neuter")),
    ja=j(("そのような", "sonoyouna", "such"), ("こんな", "konna", "like this")),
)
SOME = L(
    es=rows(("algún", "masculine"), ("alguna", "feminine"), ("algo", "something")),
    fr=rows(("quelque", "some"), ("un certain", "a certain")),
    it=rows(("qualche", "some"), ("alcuno", "some, masculine")),
    pt=rows(("algum", "masculine"), ("alguma", "feminine")),
    nl=rows(("een of ander", "some"), ("wat", "some")),
    ru=rows(("какой-то", "some"), ("какой-нибудь", "some / any")),
    ja=j(("何か", "nanika", "something"), ("ある", "aru", "a certain")),
)
NONE = L(
    es=rows(("ningún", "masculine"), ("ninguna", "feminine"), ("ninguno", "none")),
    fr=rows(("aucun", "masculine"), ("aucune", "feminine"), ("nul", "none")),
    it=rows(("nessun", "masculine"), ("nessuna", "feminine"), ("nessuno", "nobody")),
    pt=rows(("nenhum", "masculine"), ("nenhuma", "feminine")),
    nl=rows("geen"),
    ru=rows(("никакой", "no / none"), ("никто", "nobody")),
    ja=j(("何も", "nanimo", "nothing, with a negative"), ("誰も", "daremo", "nobody, with a negative")),
)
REFLEX = L(
    es=rows("se"),
    fr=rows("se"),
    it=rows("si"),
    pt=rows("se"),
    nl=rows("zich"),
    ru=rows(("ся", "verb suffix")),
    ja=j(("自分", "jibun", "oneself")),
)
BUT = L(
    es=rows("pero"),
    fr=rows("mais"),
    it=rows("ma"),
    pt=rows("mas"),
    nl=rows("maar"),
    ru=rows("но"),
    ja=j(("でも", "demo", "but"), ("しかし", "shikashi", "however")),
)
ALTHOUGH = L(
    es=rows("aunque"),
    fr=rows(("bien que", "although"), ("quoique", "although")),
    it=rows(("sebbene", "although"), ("anche se", "even if")),
    pt=rows("embora"),
    nl=rows("hoewel"),
    ru=rows("хотя"),
    ja=j(("けれども", "keredomo", "although"), ("のに", "noni", "although / despite")),
)
OTHER = L(
    es=rows(("otro", "masculine"), ("otra", "feminine")),
    fr=rows("autre"),
    it=rows(("altro", "masculine"), ("altra", "feminine")),
    pt=rows(("outro", "masculine"), ("outra", "feminine")),
    nl=rows(("ander", "neuter"), ("andere", "common")),
    ru=rows(("другой", "masculine"), ("другая", "feminine"), ("другое", "neuter")),
    ja=j(("他", "hoka", "other"), ("別", "betsu", "another")),
)
BECOME = L(
    es=rows(("convertirse", "become"), ("volverse", "become")),
    fr=rows("devenir"),
    it=rows("diventare"),
    pt=rows("tornar-se"),
    nl=rows(("worden", "become"), ("zullen", "will, auxiliary")),
    ru=rows("стать"),
    ja=j(("なる", "naru", "become")),
)
SHE_THEY = L(
    es=rows(("ella", "she"), ("ellas", "they, feminine"), ("ellos", "they, masculine / mixed")),
    fr=rows(("elle", "she"), ("elles", "they, feminine"), ("ils", "they, masculine / mixed")),
    it=rows(("lei", "she"), ("loro", "they")),
    pt=rows(("ela", "she"), ("elas", "they, feminine"), ("eles", "they, masculine / mixed")),
    nl=rows(("zij", "she / they"), ("ze", "unstressed")),
    ru=rows(("она", "she"), ("они", "they")),
    ja=j(("彼女", "kanojo", "she"), ("彼ら", "karera", "they")),
)
IT = L(
    es=rows(("ello", "it"), ("lo", "it, object")),
    fr=rows(("ce", "it"), ("ça", "it")),
    it=rows(("esso", "it"), ("ciò", "that / it")),
    pt=rows(("isso", "it / that"), ("ele", "it, masculine")),
    nl=rows("het"),
    ru=rows(("это", "it / this"), ("оно", "it, neuter")),
    ja=j(("それ", "sore", "it / that")),
)
HER_THEIR = L(
    es=rows(("su", "her / their"), ("ella", "she / her"), ("ustedes", "you plural")),
    fr=rows(("son", "her, masculine noun"), ("sa", "her, feminine noun"), ("elle", "she"), ("vous", "you plural")),
    it=rows(("suo", "her"), ("lei", "she"), ("voi", "you plural")),
    pt=rows(("seu", "her / their"), ("ela", "she"), ("vocês", "you plural")),
    nl=rows(("haar", "her"), ("hun", "their"), ("jullie", "you plural")),
    ru=rows(("её", "her"), ("их", "their"), ("вы", "you plural")),
    ja=j(("彼女の", "kanojo no", "her"), ("彼らの", "karera no", "their")),
)
WHAT_KIND = L(
    es=rows(("qué", "what"), ("cuál", "which")),
    fr=rows(("quel", "masculine"), ("quelle", "feminine")),
    it=rows("quale"),
    pt=rows(("qual", "which"), ("que", "what")),
    nl=rows(("wat voor", "what kind of"), ("welk", "which")),
    ru=rows(("какой", "masculine"), ("какая", "feminine"), ("какое", "neuter")),
    ja=j(("どんな", "donna", "what kind")),
)
NO_ANY = L(
    es=rows(("ningún", "masculine"), ("ninguna", "feminine")),
    fr=rows(("aucun", "none"), ("pas de", "not any")),
    it=rows(("nessun", "masculine"), ("non", "not")),
    pt=rows(("nenhum", "masculine"), ("nenhuma", "feminine")),
    nl=rows("geen"),
    ru=rows(("никакой", "no"), ("нет", "there is no")),
    ja=j(("ない", "nai", "not / there is no")),
)
THIS_NEAR = L(
    es=rows(("este", "masculine"), ("esta", "feminine"), ("esto", "neuter"), ("estos", "masculine plural"), ("estas", "feminine plural")),
    fr=rows(("ce", "this"), ("cet", "before a vowel"), ("cette", "feminine"), ("ces", "plural")),
    it=rows(("questo", "masculine"), ("questa", "feminine"), ("questi", "masculine plural"), ("queste", "feminine plural")),
    pt=rows(("este", "masculine"), ("esta", "feminine"), ("estes", "masculine plural"), ("estas", "feminine plural")),
    nl=rows(("deze", "common"), ("dit", "neuter")),
    ru=rows(("этот", "masculine"), ("эта", "feminine"), ("это", "neuter"), ("эти", "plural")),
    ja=j(("この", "kono", "this + noun"), ("これ", "kore", "this")),
)

BY_PL: dict[str, dict[str, list]] = {
    "w": IN,
    "i": AND,
    "być": BE,
    "się": REFLEX,
    "z": FROM,
    "nie": NOT,
    "on": HE,
    "ten": THIS,
    "że": THAT_COMP,
    "który": WHICH,
    "mieć": HAVE,
    "co": WHAT,
    "ja": I,
    "swój": OWN,
    "taki": SUCH,
    "jeden": ONE,
    "też": ALSO,
    "my": WE,
    "dwa": TWO,
    "nasz": OUR,
    "każdy": EACH,
    "mój": MY,
    "jaki": WHAT_KIND,
    "wszystek": ALL,
    "jeśli": IF,
    "jakiś": SOME,
    "tu": HERE,
    "lub": OR,
    "ty": YOU,
    "kto": WHO,
    "żaden": NONE,
    "choć": ALTHOUGH,
    "dziś": TODAY,
    "twój": YOUR,
    "tamten": THAT_FAR,
    "znów": AGAIN,
    "wy": YOU_PL,
    "ów": THAT_FAR,
}

BY_DE: dict[str, dict[str, list]] = {
    "der": THE,
    "ein": A,
    "und": AND,
    "sein": BE,
    "werden": BECOME,
    "er": HE,
    "haben": HAVE,
    "dieser": THIS_NEAR,
    "sie": SHE_THEY,
    "es": IT,
    "nicht": NOT,
    "ich": I,
    "ihr": HER_THEIR,
    "oder": OR,
    "alle": ALL,
    "aber": BUT,
    "wir": WE,
    "anderer": OTHER,
    "kein": NO_ANY,
    "mein": MY,
    "jeder": EACH,
    "unser": OUR,
    "welcher": WHICH,
    "solcher": SUCH,
    "du": YOU,
    "jener": THAT_FAR,
}

# Optional concept-keyed packs. A missing language falls through to Wiktionary.
BY_CONCEPT: dict[str, dict[str, list]] = {}


def concept_key(entry: dict) -> str:
    accepted = (entry.get("forms") or {}).get("en", {}).get("accepted") or []
    if not accepted:
        return entry["id"]
    text = (accepted[0].get("text") or "").strip()
    text = re.sub(r"^(?:to|a|an|the)\s+", "", text, flags=re.I)
    return text.casefold() or entry["id"]


def _first(entry: dict, code: str) -> str:
    accepted = (entry.get("forms") or {}).get(code, {}).get("accepted") or []
    if not accepted:
        return ""
    return (accepted[0].get("text") or "").casefold()


def override_for(entry: dict) -> dict[str, list] | None:
    ranks = entry.get("ranks") or {}
    if "pl" in ranks:
        pack = BY_PL.get(_first(entry, "pl"))
        if pack:
            return pack
    elif "de" in ranks:
        pack = BY_DE.get(_first(entry, "de"))
        if pack:
            return pack
    return BY_CONCEPT.get(concept_key(entry))


def strip_ru_stress(text: str) -> str:
    if not re.search(r"[А-Яа-яЁё]", text):
        return text
    decomposed = unicodedata.normalize("NFD", text)
    kept = "".join(ch for ch in decomposed if ch not in RU_STRESS)
    return unicodedata.normalize("NFC", kept)


def romanize_ru(text: str) -> str:
    lowered = strip_ru_stress(text).casefold()
    return "".join(RU_MAP.get(ch, ch) for ch in lowered)


def romaji_variants(text: str) -> list[str]:
    if not any(ch in text for ch in MACRON):
        return [text]
    short = text
    long = text
    for macron, (brief, spelled) in MACRON.items():
        short = short.replace(macron, brief)
        long = long.replace(macron, spelled)
    out: list[str] = []
    for item in (text, short, long):
        if item and item not in out:
            out.append(item)
    return out


def _clean(text: str, code: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if code == "ru":
        text = strip_ru_stress(text)
    return text


def to_form(pairs: list | None, code: str) -> dict | None:
    if not pairs:
        return None
    accepted: list[dict] = []
    seen: set[str] = set()

    def add(text: str, context: str | None) -> None:
        text = _clean(text, code)
        if not text or len(text) > 48:
            return
        key = text.casefold()
        if key in seen:
            return
        seen.add(key)
        row = {"text": text}
        if context:
            row["context"] = context
        accepted.append(row)

    for item in pairs:
        if isinstance(item, str):
            add(item, None)
            continue
        add(item.get("text") or "", item.get("context") or None)

    extras: list[dict] = []
    for item in list(accepted):
        if code == "ru" and re.search(r"[А-Яа-яЁё]", item["text"]):
            latin = romanize_ru(item["text"])
            if latin and latin.casefold() not in seen and re.search(r"[a-z]", latin):
                seen.add(latin.casefold())
                extras.append({"text": latin, "context": ROMANIZATION})
        if item.get("context") == ROMANIZATION:
            for variant in romaji_variants(item["text"]):
                if variant.casefold() not in seen:
                    seen.add(variant.casefold())
                    extras.append({"text": variant, "context": ROMANIZATION})
    accepted.extend(extras)
    accepted = accepted[:16]
    if not accepted:
        return None
    shown = [item["text"] for item in accepted if item.get("context") != ROMANIZATION]
    if not shown:
        shown = [accepted[0]["text"]]
    return {"text": " / ".join(shown[:8]), "accepted": accepted}


def load_cache() -> dict:
    if not CACHE.exists():
        return {}
    return json.loads(CACHE.read_text(encoding="utf-8"))


def attach_extra_languages(entries: list[dict]) -> None:
    codes = [item["code"] for item in load_registry()]
    cache = load_cache()
    for entry in entries:
        override = override_for(entry)
        for code in codes:
            if entry["forms"].get(code):
                continue
            form = None
            if override is not None and code in override:
                form = to_form(override[code], code)
            else:
                wiki = (cache.get(concept_key(entry)) or {}).get(code) or []
                form = to_form(wiki, code)
            if form:
                entry["forms"][code] = form
        entry["concept"] = concept_key(entry)


def write_split_deck(meta: dict, entries: list[dict]) -> None:
    registry = load_registry()
    codes = [item["code"] for item in registry]
    meta = dict(meta)
    meta["languages"] = [
        {"code": item["code"], "name": item["name"], "nativeName": item["nativeName"]} for item in registry
    ]
    packs: dict[str, dict] = {code: {} for code in codes}
    catalog_entries: list[dict] = []
    for entry in entries:
        catalog_entries.append(
            {
                "id": entry["id"],
                "pos": entry["pos"],
                "ranks": entry.get("ranks") or {},
                "concept": entry.get("concept") or concept_key(entry),
            }
        )
        for code, form in (entry.get("forms") or {}).items():
            if code in packs and form:
                packs[code][entry["id"]] = form

    out_dir = ROOT / "public" / "data"
    lang_dir = out_dir / "langs"
    lang_dir.mkdir(parents=True, exist_ok=True)
    catalog = {"meta": meta, "entries": catalog_entries}
    (out_dir / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    for code, pack in packs.items():
        (lang_dir / f"{code}.json").write_text(
            json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    legacy = out_dir / "words.json"
    if legacy.exists():
        legacy.unlink()
    print("wrote", out_dir / "catalog.json")
    for code in codes:
        print(f"  {code}: {len(packs[code])} forms")
