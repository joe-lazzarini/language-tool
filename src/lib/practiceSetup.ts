import { pairNames, type LangCode, type LangPair } from "./languages";
import { RANGES } from "./deck";
import type { CustomWord, Mode, RangeId } from "../types";

export type OtherPairWords = {
  pair: LangPair;
  count: number;
  label: string;
};

/** Practice-source chips: My words first, then the frequency bands. */
export function practiceRanges(): typeof RANGES {
  const mine = RANGES.find((item) => item.id === "mine");
  const rest = RANGES.filter((item) => item.id !== "mine");
  return mine ? [mine, ...rest] : rest;
}

export function rangeChoiceLabel(range: RangeId, customCount: number): string {
  if (range === "mine") {
    return `My words (${customCount})`;
  }
  return RANGES.find((item) => item.id === range)?.label ?? range;
}

/** Primary CTA, e.g. "Start quiz · My words (12)" or "Start study · First 100". */
export function startActionLabel(mode: Mode, range: RangeId, customCount: number): string {
  const verb = mode === "quiz" ? "Start quiz" : "Start study";
  return `${verb} · ${rangeChoiceLabel(range, customCount)}`;
}

/** Saved-word counts for every pair except the current prompt/answer pair. */
export function otherPairsWithWords(
  words: CustomWord[],
  from: LangCode,
  to: LangCode,
): OtherPairWords[] {
  const current = from < to ? `${from}-${to}` : `${to}-${from}`;
  const counts = new Map<string, { pair: LangPair; count: number }>();
  for (const word of words) {
    if (!word.pair) continue;
    const key = `${word.pair[0]}-${word.pair[1]}`;
    if (key === current) continue;
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { pair: word.pair, count: 1 });
    }
  }
  return [...counts.values()]
    .map(({ pair, count }) => ({
      pair,
      count,
      label: pairNames(pair[0], pair[1]),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
