import { isKnownPair, isManualPair, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { slotLabel } from "./generate";
import type { GrammarFile, SlotWord } from "./types";
import { buildVocabIndex, isEligiblePair, listGrammarCandidates } from "./vocab";

export type SentenceWordRow = {
  id: string;
  pos: "noun" | "verb" | "adjective";
  prompt: string;
  answer: string;
  /** Known for the unordered language pair (combined A↔B score). */
  pairKnown: boolean;
  /** Manual mark on either direction (OR via combinePairStat). */
  pairManual: boolean;
  eligible: boolean;
};

/** Pretend the card is known so we can reuse surface resolution for lobby labels. */
function displaySlot(
  entry: Entry,
  grammar: GrammarFile,
  promptLang: LangCode,
  answerLang: LangCode,
): SlotWord | undefined {
  const known: WordStat = {
    correct: 2,
    attempts: 2,
    lastSeen: 1,
    windowBits: 0b11,
    windowLen: 2,
    manual: false,
  };
  const stats = new Map([[entry.id, known]]);
  return buildVocabIndex([entry], grammar, promptLang, answerLang, stats, stats).byId.get(entry.id);
}

export function sentenceRows(
  studyEntries: readonly Entry[],
  grammar: GrammarFile,
  promptLang: LangCode,
  answerLang: LangCode,
  promptStats: ReadonlyMap<string, WordStat>,
  answerStats: ReadonlyMap<string, WordStat>,
): SentenceWordRow[] {
  const candidates = listGrammarCandidates(studyEntries, grammar, promptLang, answerLang);
  const rows: SentenceWordRow[] = [];

  for (const entry of candidates) {
    const forward = answerStats.get(entry.id);
    const reverse = promptStats.get(entry.id);
    const pairKnown = isKnownPair(forward, reverse);
    // Lobby lists words you have practiced or added — not the entire deck.
    if (!entry.custom && !pairKnown) continue;
    const display = displaySlot(entry, grammar, promptLang, answerLang);
    if (!display) continue;
    rows.push({
      id: entry.id,
      pos: display.pos,
      prompt: slotLabel(display, "prompt"),
      answer: slotLabel(display, "answer"),
      pairKnown,
      pairManual: isManualPair(forward, reverse),
      eligible: isEligiblePair(reverse, forward),
    });
  }

  rows.sort((a, b) => a.pos.localeCompare(b.pos) || a.prompt.localeCompare(b.prompt));
  return rows;
}
