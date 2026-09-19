import type { RangeId, SessionSize, Word } from "../types";

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

export function wordsForRange(words: Word[], range: RangeId): Word[] {
  const spec = RANGES.find((item) => item.id === range) ?? RANGES[0];
  return words.slice(spec.start, spec.end);
}

export function buildSession(words: Word[], size: SessionSize): Word[] {
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (size === "all") return shuffled;
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

export function promptFor(word: Word, direction: "en-pl" | "pl-en"): string {
  return direction === "en-pl" ? word.en : word.pl;
}

export function expectedFor(word: Word, direction: "en-pl" | "pl-en"): string {
  return direction === "en-pl" ? word.pl : word.en;
}

export function acceptedFor(word: Word, direction: "en-pl" | "pl-en"): string[] {
  return direction === "en-pl" ? [word.pl] : [word.en, ...word.accepted];
}
