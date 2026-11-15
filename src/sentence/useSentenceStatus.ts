import { useEffect, useState } from "react";
import type { WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { generateSentences, unlockHint } from "./generate";
import { loadGrammar, loadSentencePack } from "./load";
import { buildVocabIndex, isEligibleStat, listGrammarCandidates } from "./vocab";

export type SentenceStatus = {
  loading: boolean;
  error: string | null;
  knownPrompt: number;
  knownAnswer: number;
  ready: number;
  unlockHint: string;
};

const empty: SentenceStatus = {
  loading: true,
  error: null,
  knownPrompt: 0,
  knownAnswer: 0,
  ready: 0,
  unlockHint: "",
};

export function useSentenceStatus(
  from: LangCode,
  to: LangCode,
  revision: number,
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>,
  studyEntries: readonly Entry[],
): SentenceStatus {
  const [status, setStatus] = useState<SentenceStatus>(empty);

  useEffect(() => {
    let cancelled = false;
    setStatus((current) => ({ ...current, loading: true, error: null }));
    Promise.all([loadGrammar(), loadSentencePack(from), loadSentencePack(to)])
      .then(([grammar, promptPack, answerPack]) => {
        if (cancelled) return;
        const promptStats = read(to, from);
        const answerStats = read(from, to);
        const candidates = listGrammarCandidates(studyEntries, grammar, from, to);
        const index = buildVocabIndex(studyEntries, grammar, from, to, promptStats, answerStats);
        const ready = generateSentences(index, from, promptPack, to, answerPack).length;
        setStatus({
          loading: false,
          error: null,
          knownPrompt: candidates.filter((entry) => isEligibleStat(promptStats.get(entry.id))).length,
          knownAnswer: candidates.filter((entry) => isEligibleStat(answerStats.get(entry.id))).length,
          ready,
          unlockHint: unlockHint(ready, index),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ ...empty, loading: false, error: "Couldn't load sentence patterns." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, revision, read, studyEntries]);

  return status;
}
