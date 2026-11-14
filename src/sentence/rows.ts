import { isKnown, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { slotLabel } from "./generate";
import type { GrammarFile, SlotWord } from "./types";
import { buildVocabIndex, isEligibleStat, listGrammarCandidates } from "./vocab";

export type SentenceWordRow = {
  id: string;
  pos: "noun" | "verb" | "adjective";
  prompt: string;
  answer: string;
  promptKnown: boolean;
  answerKnown: boolean;
  promptManual: boolean;
  answerManual: boolean;
  eligible: boolean;
};

function sideState(stats: ReadonlyMap<string, WordStat>, id: string): { known: boolean; manual: boolean } {
  const stat = stats.get(id);
  return {
    known: isKnown(stat),
    manual: Boolean(stat?.manual && isKnown(stat)),
  };
}

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
    const prompt = sideState(promptStats, entry.id);
    const answer = sideState(answerStats, entry.id);
    // Lobby lists words you have practiced or added — not the entire deck.
    if (!entry.custom && !prompt.known && !answer.known) continue;
    const display = displaySlot(entry, grammar, promptLang, answerLang);
    if (!display) continue;
    rows.push({
      id: entry.id,
      pos: display.pos,
      prompt: slotLabel(display, "prompt"),
      answer: slotLabel(display, "answer"),
      promptKnown: prompt.known,
      answerKnown: answer.known,
      promptManual: prompt.manual,
      answerManual: answer.manual,
      eligible: isEligibleStat(promptStats.get(entry.id)) && isEligibleStat(answerStats.get(entry.id)),
    });
  }

  rows.sort((a, b) => a.pos.localeCompare(b.pos) || a.prompt.localeCompare(b.prompt));
  return rows;
}
