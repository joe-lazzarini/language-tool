import type { LangCode } from "../lib/languages";
import { composePool, sampleComposed, type StructureKind } from "./compose";
import type { GeneratorProgress, PracticeSentence, SentencePack, SlotWord, VocabIndex } from "./types";
import { wordsNeededHint } from "./vocab";

export const MIN_READY_SENTENCES = 4;
export const SENTENCE_ROUND = 8;

export { difficultyLevel, structuresForLevel } from "./compose";
export type { StructureKind };

function defaultProgress(index: VocabIndex): GeneratorProgress {
  return {
    knownCount: eligibleKnownCount(index),
    avgAccuracy: 0.75,
  };
}

/**
 * Build a pool of grammatical sentences from eligible study words using the
 * compositional generator. Pack frames are retained for load compatibility;
 * rendering is driven by per-language closed-class data and morphology.
 */
export function generateSentences(
  index: VocabIndex,
  promptLang: LangCode,
  _promptPack: SentencePack,
  answerLang: LangCode,
  _answerPack: SentencePack,
  progress?: GeneratorProgress,
  rng: () => number = Math.random,
): PracticeSentence[] {
  void _promptPack;
  void _answerPack;
  return composePool(index, promptLang, answerLang, progress ?? defaultProgress(index), {
    max: 160,
    rng,
  });
}

export function eligibleKnownCount(index: VocabIndex): number {
  return index.nouns.length + index.verbs.length + index.adjectives.length;
}

export function unlockHint(ready: number, index: VocabIndex): string {
  return wordsNeededHint(ready, index, MIN_READY_SENTENCES);
}

/**
 * Sample a round with no immediate sentence-id or structure repeats from the
 * previous round when enough alternatives exist.
 */
export function sampleSentences(
  sentences: readonly PracticeSentence[],
  size: number,
  rng: () => number = Math.random,
  previousIds: ReadonlySet<string> = new Set(),
  previousStructures: ReadonlySet<string> = new Set(),
): PracticeSentence[] {
  return sampleComposed(sentences, size, rng, previousIds, previousStructures);
}

export function slotLabel(word: SlotWord, side: "prompt" | "answer"): string {
  const surface = side === "prompt" ? word.prompt : word.answer;
  if (word.pos === "verb") return surface.fin || surface.lemma;
  if (word.pos === "adjective") {
    const forms = [surface.m, surface.f, surface.n].filter(Boolean) as string[];
    return [...new Set(forms)].join(" / ") || surface.lemma;
  }
  return surface.npNom || surface.lemma;
}

/** Average lifetime accuracy across eligible slot words for the selected pair. */
export function progressFromStats(
  index: VocabIndex,
  pairStats: ReadonlyMap<string, { correct: number; attempts: number }>,
): GeneratorProgress {
  const ids = [...index.byId.keys()];
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    const stat = pairStats.get(id);
    if (stat && stat.attempts > 0) {
      sum += stat.correct / stat.attempts;
      n += 1;
    }
  }
  return {
    knownCount: eligibleKnownCount(index),
    avgAccuracy: n === 0 ? 1 : sum / n,
  };
}
