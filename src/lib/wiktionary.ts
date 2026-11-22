import { LANGUAGES, type LangCode } from "./languages";
import { normalizeAnswer } from "./match";
import type { AcceptedAnswer } from "../types";

const LANG_NAME: Record<LangCode, string> = Object.fromEntries(
  LANGUAGES.map((item) => [item.code, item.wiktionary]),
) as Record<LangCode, string>;

const NAME_TO_CODE: Record<string, LangCode> = {};
for (const item of LANGUAGES) {
  NAME_TO_CODE[item.wiktionary] = item.code;
  for (const alias of item.wiktionaryAliases) NAME_TO_CODE[alias] = item.code;
}

const POS_MAP: Record<string, string> = {
  noun: "noun",
  "proper noun": "noun",
  verb: "verb",
  adjective: "adjective",
  adverb: "adverb",
  pronoun: "pronoun",
  preposition: "preposition",
  conjunction: "conjunction",
  determiner: "determiner",
  article: "article",
  numeral: "numeral",
  number: "numeral",
  interjection: "interjection",
  particle: "particle",
  phrase: "phrase",
};

const REGISTER = new Set([
  "colloquial",
  "slang",
  "informal",
  "formal",
  "humorous",
  "literary",
  "dialect",
  "diminutive",
  "figurative",
  "polite",
  "vulgar",
  "offensive",
  "idiomatic",
  "euphemistic",
]);

const GENDER: Record<string, string> = {
  m: "masculine",
  "m-an": "masculine",
  "m-in": "masculine",
  "m-anml": "masculine",
  f: "feminine",
  n: "neuter",
  c: "common",
  mf: "common",
  p: "plural",
};

export type LangParse = {
  pos: string;
  glosses: AcceptedAnswer[];
  translations: Partial<Record<LangCode, AcceptedAnswer[]>>;
  formOfLemma?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanWikiText(value: string): string {
  let text = value.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;|&#32;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLanguageSection(wikitext: string, lang: LangCode): string | null {
  const name = escapeRegExp(LANG_NAME[lang]);
  const match = new RegExp(`^==\\s*${name}\\s*==\\s*$`, "m").exec(wikitext);
  if (!match) return null;
  const rest = wikitext.slice(match.index + match[0].length);
  const next = /^==[^=]/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function firstPos(section: string): string {
  // Etymology blocks use === ===, and the part of speech under them is often ==== ====.
  for (const match of section.matchAll(/^={3,4}\s*([^=\n]+?)\s*={3,4}\s*$/gm)) {
    const mapped = POS_MAP[match[1].trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return "";
}

/** Strip Wiktionary sense ids and Cyrillic stress marks from a citation lemma. */
export function cleanFormOfLemma(raw: string): string {
  let lemma = cleanWikiText(raw);
  // {{pl-head|verb form|robić<id:make>}} → robić
  lemma = lemma.replace(/<id:[^>]*>/gi, "").trim();
  // Russian headwords often carry combining acute on Cyrillic vowels only.
  // Do NOT strip acute from Latin letters (Polish ć/ń/ó/ś/ź, Spanish á, …).
  lemma = lemma.replace(/([\u0400-\u04FF])\u0301/g, "$1");
  return lemma.trim();
}

type FormOfHit = { lemma: string; posHint?: string; source: "head" | "template" | "prose" };

/**
 * Find the citation lemma an inflected surface points at.
 *
 * English Wiktionary uses several patterns depending on the language:
 * - Polish: `{{pl-head|noun form|humor|…}}` / `{{pl-head|verb form|powtarzać}}`
 *   (often with no `#` gloss line at all)
 * - Generic: `{{inflection of|pl|…}}`, `{{infl of|…}}`, `{{plural of|…}}`,
 *   `{{verb form of|de|gehen|…}}`, `{{noun form of|es|habla|…}}`,
 *   `{{past participle of|de|machen}}`
 * - Language-prefixed: `{{de-adj form of|klein}}`, `{{es-verb form of|hablar}}`
 * - Prose: "genitive singular of [[humor]]"
 */
function findFormOf(section: string, lang: LangCode): string | undefined {
  const hits: FormOfHit[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined, source: FormOfHit["source"], posHint?: string) => {
    if (!raw) return;
    const lemma = cleanFormOfLemma(raw);
    if (!lemma || lemma.includes("{") || lemma.includes(":") || lemma.length > 64) return;
    const key = `${lemma.toLocaleLowerCase()}\0${posHint ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ lemma, posHint, source });
  };

  // 1) Language head templates that embed the lemma: {{pl-head|noun form|humor|g=m-in}}
  const headRe = new RegExp(
    `\\{\\{${escapeRegExp(lang)}-head\\|(noun form|verb form|adjective form|adj form)\\|([^|}]+)`,
    "gi",
  );
  for (const match of section.matchAll(headRe)) {
    const kind = match[1].toLowerCase();
    const posHint = kind.startsWith("verb")
      ? "verb"
      : kind.startsWith("adj")
        ? "adjective"
        : "noun";
    push(match[2], "head", posHint);
  }

  // 2) Language-prefixed form templates: {{es-verb form of|hablar}}, {{de-adj form of|klein}}
  const langFormRe = new RegExp(
    `\\{\\{${escapeRegExp(lang)}-(verb|noun|adj) form of\\|([^|}]+)`,
    "gi",
  );
  for (const match of section.matchAll(langFormRe)) {
    const kind = match[1].toLowerCase();
    const posHint = kind === "verb" ? "verb" : kind === "adj" ? "adjective" : "noun";
    push(match[2], "template", posHint);
  }

  // 3) Shared form-of / inflection templates with an explicit language code.
  const sharedNames =
    "plural of|inflection of|infl of|form of|verb form of|noun form of|adj form of|past participle of|participle of|conjugation of";
  const sharedRe = new RegExp(`\\{\\{(?:${sharedNames})\\|([a-z-]{2,3})\\|([^|}]+)`, "gi");
  for (const match of section.matchAll(sharedRe)) {
    if (match[1].toLowerCase() !== lang) continue;
    const name = match[0].slice(2).split("|")[0].toLowerCase();
    const posHint = name.includes("verb")
      ? "verb"
      : name.includes("adj")
        ? "adjective"
        : name.includes("noun") || name.includes("plural")
          ? "noun"
          : name.includes("participle") || name.includes("conjugation")
            ? "verb"
            : undefined;
    push(match[2], "template", posHint);
  }

  // 4) Prose “X of [[lemma]]” lines (legacy / incomplete entries).
  const proseRe =
    /\b(?:(?:first|second|third)[\s-]?person|singular|plural|genitive|dative|accusative|nominative|locative|instrumental|vocative|present|past|preterite|imperative|infinitive|masculine|feminine|neuter|comparative|superlative|participle|conjugated|inflected)\b[^.\n]{0,80}?\bof\s+\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/gi;
  for (const match of section.matchAll(proseRe)) {
    push(match[1], "prose");
  }

  if (hits.length === 0) return undefined;

  // Prefer a hit that matches the first POS heading when several lemmas appear
  // (e.g. Spanish "hablas" → noun habla vs verb hablar).
  const pos = firstPos(section);
  const matchingPos = pos ? hits.find((hit) => hit.posHint === pos) : undefined;
  // Prefer head-template lemmas (Polish) over later prose noise.
  const headHit = hits.find((hit) => hit.source === "head");
  return (matchingPos ?? headHit ?? hits[0])?.lemma;
}

function labelContext(line: string): string | undefined {
  const labels: string[] = [];
  for (const match of line.matchAll(/\{\{(?:lb|lbl|label)\|[^|}]+\|([^}]+)\}\}/g)) {
    for (const part of match[1].split("|")) {
      const text = part.trim().toLowerCase();
      if (!REGISTER.has(text)) continue;
      labels.push(text);
    }
  }
  if (labels.length === 0) return undefined;
  return labels.slice(0, 3).join(", ");
}

function firstGloss(section: string): AcceptedAnswer[] {
  for (const line of section.split("\n")) {
    if (!line.startsWith("# ") || line.startsWith("#:") || line.startsWith("#*")) continue;
    if (/\{\{(?:plural of|inflection of|infl of|form of)\|/.test(line)) continue;
    const context = labelContext(line);
    const links = [...line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)]
      .map((match) => cleanWikiText(match[2] ?? match[1]))
      .filter((text) => text && !text.includes(":") && text.length <= 48)
      .map((text) => (new RegExp(`to\\s+\\[\\[${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line) ? `to ${text}` : text));
    const unique = dedupeAnswers(links.map((text) => ({ text, context }))).slice(0, 4);
    if (unique.length > 0) return unique;
    const plain = cleanWikiText(line.replace(/^#\s*/, ""));
    if (plain && plain.length <= 40 && !plain.includes("{")) {
      return context ? [{ text: plain, context }] : [{ text: plain }];
    }
  }
  return [];
}

function genderFrom(params: string): string | undefined {
  for (const token of params.split("|")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const value = trimmed.includes("=") ? trimmed.split("=").slice(1).join("=").trim() : trimmed;
    if (GENDER[value]) return GENDER[value];
  }
  return undefined;
}

function readableQual(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.split("|")[0].trim();
  if (!text || /[♂♀]/.test(text) || text.length > 40) return undefined;
  return text;
}

function joinContext(gender: string | undefined, qual: string | undefined): string | undefined {
  const parts = [gender, qual].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : undefined;
}

function pinyinFromParams(params: string): string | undefined {
  const match = /(?:^|\|)tr=([^}|]+)/.exec(params);
  if (!match) return undefined;
  const tr = match[1].trim();
  if (!tr || !/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]/.test(tr)) return undefined;
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(tr)) return undefined;
  return tr.split(/[,;/]/)[0]?.trim() || undefined;
}

export function parseTranslationList(chunk: string): AcceptedAnswer[] {
  const pattern = /\{\{(?:tt|t)\+?\|([a-z]{2,3})\|([^|}]+)([^}]*)\}\}/g;
  const answers: AcceptedAnswer[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(chunk))) {
    const between = chunk.slice(cursor, match.index);
    const end = match.index + match[0].length;
    const qualAfter = /^\s*\{\{(?:q|qual|qualifier)\|([^}]+)\}\}/.exec(chunk.slice(end));
    const qualBefore = /\{\{(?:q|qual|qualifier)\|([^}]+)\}\}\s*$/.exec(between);
    const text = cleanWikiText(match[2]);
    const qual = readableQual(qualAfter?.[1] ?? qualBefore?.[1]);
    const skip = Boolean(qual && /humorous|archaic|obsolete|rare|dated/i.test(qual));
    const traditional = /(?:^|\|)sc=Hant(?:\||$)/.test(match[3] ?? "");
    if (
      !skip &&
      !traditional &&
      text &&
      !text.includes("{") &&
      text.length <= 48 &&
      !text.includes(":")
    ) {
      const code = match[1];
      const pinyin = code === "zh" ? pinyinFromParams(match[3] ?? "") : undefined;
      const gender = genderFrom(match[3]);
      const context =
        pinyin && gender ? `${pinyin} · ${gender}` : pinyin || joinContext(gender, qual);
      answers.push(context ? { text, context } : { text });
      if (pinyin && pinyin.toLowerCase() !== text.toLowerCase()) {
        answers.push({ text: pinyin, context: "pinyin" });
      }
    }
    cursor = end + (qualAfter ? qualAfter[0].length : 0);
  }
  return dedupeAnswers(answers).slice(0, 6);
}

function translationBlock(section: string): string {
  const match = /^={3,}\s*Translations\s*={3,}\s*$/m.exec(section);
  if (!match) return "";
  const rest = section.slice(match.index + match[0].length);
  const nextHeading = /^={2,4}[^=]/m.exec(rest);
  const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  const top = body.indexOf("{{trans-top");
  const fromTop = top >= 0 ? body.slice(top) : body;
  const bottom = fromTop.indexOf("{{trans-bottom}}");
  const second = top >= 0 ? fromTop.indexOf("{{trans-top", "{{trans-top".length) : -1;
  let end = fromTop.length;
  if (bottom >= 0) end = Math.min(end, bottom);
  if (second >= 0) end = Math.min(end, second);
  return fromTop.slice(0, end);
}

function firstTranslations(section: string): Partial<Record<LangCode, AcceptedAnswer[]>> {
  const block = translationBlock(section);
  if (!block) return {};
  const out: Partial<Record<LangCode, AcceptedAnswer[]>> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    const bullet =
      /^\*\s*([A-Za-z][A-Za-z -]*?):\s*(.*)$/.exec(trimmed) ||
      /^\*+:\s*([A-Za-z][A-Za-z -]*?):\s*(.*)$/.exec(trimmed);
    if (!bullet) continue;
    const code = NAME_TO_CODE[bullet[1].trim()];
    if (!code || out[code]?.length) continue;
    const answers = parseTranslationList(bullet[2]);
    if (answers.length) out[code] = answers;
  }
  return out;
}

function dedupeAnswers(answers: AcceptedAnswer[]): AcceptedAnswer[] {
  const seen = new Set<string>();
  const out: AcceptedAnswer[] = [];
  for (const item of answers) {
    const key = normalizeAnswer(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.context ? { text: item.text.trim(), context: item.context } : { text: item.text.trim() });
  }
  return out;
}

export function parseLangEntry(wikitext: string, lang: LangCode): LangParse | null {
  const section = extractLanguageSection(wikitext, lang);
  if (section == null) return null;
  const pos = firstPos(section);
  const formOfLemma = findFormOf(section, lang);
  const glosses = formOfLemma ? [] : firstGloss(section);
  const translations = firstTranslations(section);
  const hasTranslations = Object.values(translations).some((items) => items && items.length > 0);
  if (!pos && !formOfLemma && glosses.length === 0 && !hasTranslations) return null;
  return {
    pos: pos || "word",
    glosses,
    translations,
    formOfLemma,
  };
}
