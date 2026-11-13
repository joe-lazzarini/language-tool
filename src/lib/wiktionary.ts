import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, LangCode } from "../types";

const LANG_NAME: Record<LangCode, string> = {
  en: "English",
  pl: "Polish",
  de: "German",
};

const NAME_TO_CODE: Record<string, LangCode> = {
  English: "en",
  Polish: "pl",
  German: "de",
};

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

function findFormOf(section: string, lang: LangCode): string | undefined {
  for (const line of section.split("\n")) {
    if (!line.startsWith("# ") || line.startsWith("#:")) continue;
    const match = /\{\{(?:plural of|inflection of|infl of|form of)\|([a-z-]+)\|([^|}]+)/.exec(line);
    if (!match) {
      if (line.includes("[[") || line.includes("{{")) return undefined;
      continue;
    }
    if (match[1] !== lang) continue;
    const lemma = cleanWikiText(match[2]);
    return lemma || undefined;
  }
  return undefined;
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
    if (!skip && text && !text.includes("{") && text.length <= 48 && !text.includes(":")) {
      const context = joinContext(genderFrom(match[3]), qual);
      answers.push(context ? { text, context } : { text });
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
    const bullet = /^\*\s*([A-Za-z][A-Za-z -]*?):\s*(.*)$/.exec(line.trim());
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
