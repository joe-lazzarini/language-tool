import { formText } from "./deck";
import type { LangCode } from "./languages";
import type { CardResult, Entry } from "../types";

/**
 * Cards the learner got wrong during a session, each id once, in first-miss order.
 * A later correct retry of the same id does not remove an earlier miss.
 */
export function uniqueMissed(results: readonly CardResult[]): CardResult[] {
  const seen = new Set<string>();
  const out: CardResult[] = [];
  for (const item of results) {
    if (item.correct) continue;
    if (seen.has(item.word.id)) continue;
    seen.add(item.word.id);
    out.push(item);
  }
  return out;
}

/** Quiz score: correct attempts vs all graded cards (not unique misses). */
export function scoreSummary(results: readonly CardResult[]): {
  right: number;
  total: number;
  missed: CardResult[];
} {
  const right = results.filter((item) => item.correct).length;
  return { right, total: results.length, missed: uniqueMissed(results) };
}

export type SentenceResultLike = {
  sentence: { id: string; prompt: string; accepted: readonly string[]; wordIds: readonly string[] };
  correct: boolean;
  given: string;
  /** Surface tokens marked wrong on reveal, when available. */
  wrongTokens?: readonly string[];
};

/** Missed sentences once each (by sentence id), first-miss order. */
export function uniqueMissedSentences<T extends SentenceResultLike>(results: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of results) {
    if (item.correct) continue;
    if (seen.has(item.sentence.id)) continue;
    seen.add(item.sentence.id);
    out.push(item);
  }
  return out;
}

export type MissedSentenceWord = {
  id: string;
  answer: string;
  prompt: string;
};

/**
 * Study words / wrong tokens from missed sentences, once each.
 * Prefers highlighted wrongTokens; otherwise lists content wordIds from the deck.
 */
export function uniqueMissedSentenceWords(
  results: readonly SentenceResultLike[],
  entriesById: ReadonlyMap<string, Entry>,
  from: LangCode,
  to: LangCode,
): MissedSentenceWord[] {
  const seen = new Set<string>();
  const out: MissedSentenceWord[] = [];

  for (const item of uniqueMissedSentences(results)) {
    if (item.wrongTokens && item.wrongTokens.length > 0) {
      for (const token of item.wrongTokens) {
        const key = `token:${token}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: key, answer: token, prompt: item.sentence.prompt });
      }
      continue;
    }

    for (const id of item.sentence.wordIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = entriesById.get(id);
      out.push({
        id,
        answer: entry ? formText(entry, to) || id : id,
        prompt: entry ? formText(entry, from) || item.sentence.prompt : item.sentence.prompt,
      });
    }
  }
  return out;
}
