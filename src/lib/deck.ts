import { languageName } from "./languages";
import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, Entry, LangCode, RangeId, SessionSize } from "../types";

export const RANGES: { id: RangeId; label: string; hint: string; start: number; end: number }[] = [
  { id: "top100", label: "First 100", hint: "Most frequent lemmas", start: 0, end: 100 },
  { id: "top250", label: "First 250", hint: "Core beginner set", start: 0, end: 250 },
  { id: "top500", label: "First 500", hint: "Solid everyday coverage", start: 0, end: 500 },
  { id: "all", label: "All 1000", hint: "Full deck", start: 0, end: 1000 },
  { id: "band2", label: "101–200", hint: "Next hundred", start: 100, end: 200 },
  { id: "band3", label: "201–300", hint: "Keep stretching", start: 200, end: 300 },
  { id: "band4", label: "301–500", hint: "Mid-frequency", start: 300, end: 500 },
  { id: "band5", label: "501–1000", hint: "Less common half", start: 500, end: 1000 },
];

export function hasForm(entry: Entry, lang: LangCode): boolean {
  const form = entry.forms[lang];
  return Boolean(form?.text.trim());
}

export function formText(entry: Entry, lang: LangCode): string {
  return entry.forms[lang]?.text ?? "";
}

/** Rank used to order a pair: prefer the non-English side, then answer, then prompt. */
export function pairRank(entry: Entry, from: LangCode, to: LangCode): number {
  const preferred = to !== "en" ? to : from !== "en" ? from : to;
  const rank = entry.ranks[preferred] ?? entry.ranks[to] ?? entry.ranks[from];
  return rank ?? Number.MAX_SAFE_INTEGER;
}

function inPrimaryDeck(entry: Entry, from: LangCode, to: LangCode): boolean {
  const langs = new Set([from, to]);
  if (langs.has("pl") && langs.has("de")) return entry.ranks.pl != null;
  if (langs.has("de") && langs.has("en")) return entry.ranks.de != null;
  if (langs.has("pl") && langs.has("en")) return entry.ranks.pl != null;
  return true;
}

export function entriesForPair(entries: Entry[], from: LangCode, to: LangCode): Entry[] {
  if (from === to) return [];
  return entries
    .filter((entry) => hasForm(entry, from) && hasForm(entry, to) && inPrimaryDeck(entry, from, to))
    .sort((a, b) => {
      const delta = pairRank(a, from, to) - pairRank(b, from, to);
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    });
}

export function wordsForRange(entries: Entry[], range: RangeId): Entry[] {
  const spec = RANGES.find((item) => item.id === range) ?? RANGES[0];
  return entries.slice(spec.start, spec.end);
}

export function buildSession(entries: Entry[], size: SessionSize): Entry[] {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (size === "all") return shuffled;
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

export function promptFor(entry: Entry, from: LangCode): string {
  return formText(entry, from);
}

export function expectedFor(entry: Entry, to: LangCode): string {
  return formText(entry, to);
}

export function acceptedAnswers(entry: Entry, lang: LangCode): AcceptedAnswer[] {
  return entry.forms[lang]?.accepted ?? [];
}

export function acceptedFor(entry: Entry, to: LangCode): string[] {
  return acceptedAnswers(entry, to).map((item) => item.text);
}

/** Canonical answers to show after check / skip / study reveal. */
export function revealAnswers(entry: Entry, lang: LangCode): AcceptedAnswer[] {
  const seen = new Set<string>();
  const out: AcceptedAnswer[] = [];
  for (const item of acceptedAnswers(entry, lang)) {
    const key = normalizeAnswer(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  if (out.length === 0) {
    const text = formText(entry, lang).trim();
    if (text) out.push({ text });
  }
  return out;
}

export function sessionKicker(from: LangCode, to: LangCode): string {
  return `${languageName(from)} → type ${languageName(to)}`;
}
