import { useEffect, useState } from "react";
import { summarizePairKnown, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { generateSentences, progressFromStats, unlockHint } from "./generate";
import { loadGrammar, loadSentencePack } from "./load";
import { buildVocabIndex, listGrammarCandidates } from "./vocab";

export type SentenceStatus = {
  loading: boolean;
  error: string | null;
  /** Words known for this unordered pair (combined A↔B score). */
  known: number;
  ready: number;
  unlockHint: string;
};

const empty: SentenceStatus = {
  loading: true,
  error: null,
  known: 0,
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
        // answerStats = selected direction from→to; promptStats = reverse to→from.
        const promptStats = read(to, from);
        const answerStats = read(from, to);
        const candidates = listGrammarCandidates(studyEntries, grammar, from, to);
        const index = buildVocabIndex(studyEntries, grammar, from, to, promptStats, answerStats);
        const progress = progressFromStats(index, promptStats, answerStats);
        const ready = generateSentences(index, from, promptPack, to, answerPack, progress).length;
        const pair = summarizePairKnown(
          candidates.map((entry) => entry.id),
          answerStats,
          promptStats,
        );
        setStatus({
          loading: false,
          error: null,
          known: pair.known,
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
