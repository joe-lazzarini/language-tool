import { languageName } from "./languages";
import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, Entry, LangCode, RangeId, SessionSize } from "../types";

export const RANGES: { id: RangeId; label: string; hint: string; start: number; end: number }[] = [
  { id: "top100", label: "First 100", hint: "Most frequent lemmas", start: 0, end: 100 },
  { id: "top250", label: "First 250", hint: "Core beginner set", start: 0, end: 250 },
  { id: "top500", label: "First 500", hint: "Solid everyday coverage", start: 0, end: 500 },
  { id: "all", label: "All", hint: "Full deck", start: 0, end: Number.POSITIVE_INFINITY },
  { id: "band2", label: "101–200", hint: "Next hundred", start: 100, end: 200 },
  { id: "band3", label: "201–300", hint: "Keep stretching", start: 200, end: 300 },
  { id: "band4", label: "301–500", hint: "Mid-frequency", start: 300, end: 500 },
  { id: "band5", label: "501+", hint: "Less common words", start: 500, end: Number.POSITIVE_INFINITY },
  { id: "mine", label: "My words", hint: "Words you added", start: 0, end: 0 },
];

export function hasForm(entry: Entry, lang: LangCode): boolean {
  const form = entry.forms[lang];
  return Boolean(form?.text.trim());
}

export function formText(entry: Entry, lang: LangCode): string {
  return entry.forms[lang]?.text ?? "";
}

/** Answer-language rank, then prompt rank, then the best rank stored on the card. */
export function pairRank(entry: Entry, from: LangCode, to: LangCode): number {
  const direct = entry.ranks[to] ?? entry.ranks[from];
  if (direct != null) return direct;
  let best = Number.MAX_SAFE_INTEGER;
  for (const value of Object.values(entry.ranks)) {
    if (typeof value === "number" && value < best) best = value;
  }
  return best;
}

function betterConcept(entry: Entry, prev: Entry, from: LangCode, to: LangCode): boolean {
  const rank = pairRank(entry, from, to);
  const prevRank = pairRank(prev, from, to);
  if (rank !== prevRank) return rank < prevRank;
  return entry.id.localeCompare(prev.id) < 0;
}

/** Pairs with no frequency list share concepts, so the same English head is one card. */
function dedupeConcepts(entries: Entry[], from: LangCode, to: LangCode): Entry[] {
  const kept = new Map<string, Entry>();
  const customs: Entry[] = [];
  for (const entry of entries) {
    if (entry.custom) {
      customs.push(entry);
      continue;
    }
    const key = entry.concept || entry.id;
    const prev = kept.get(key);
    if (!prev || betterConcept(entry, prev, from, to)) kept.set(key, entry);
  }
  return [...kept.values(), ...customs];
}

export function entriesForPair(entries: Entry[], from: LangCode, to: LangCode): Entry[] {
  if (from === to) return [];
  const usable = entries.filter((entry) => hasForm(entry, from) && hasForm(entry, to));
  // A language that stores frequency ranks keeps that ranked deck (Polish list,
  // German list, …). Pairs with no ranks use every card that has both forms.
  const rankLang = ([to, from] as const).find((code) =>
    usable.some((entry) => !entry.custom && entry.ranks[code] != null),
  );
  let chosen = usable;
  if (rankLang) {
    const ranked = usable.filter((entry) => entry.custom || entry.ranks[rankLang] != null);
    if (ranked.some((entry) => !entry.custom)) chosen = ranked;
  }
  if (chosen === usable) chosen = dedupeConcepts(chosen, from, to);
  chosen.sort((a, b) => {
    const delta = pairRank(a, from, to) - pairRank(b, from, to);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
  return chosen;
}

export function wordsForRange(entries: Entry[], range: RangeId): Entry[] {
  const custom = entries.filter((entry) => entry.custom);
  const bundled = entries.filter((entry) => !entry.custom);
  if (range === "mine") return custom;
  const spec = RANGES.find((item) => item.id === range) ?? RANGES[0];
  const slice = bundled.slice(spec.start, spec.end);
  if (range === "all") return [...slice, ...custom];
  return slice;
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
