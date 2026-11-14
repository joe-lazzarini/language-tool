import { useEffect, useState } from "react";
import { knownIdSet, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import { generateSentences, lexiconKnownCount } from "./generate";
import { loadLexicon, loadSentencePack } from "./load";

export type SentenceStatus = {
  loading: boolean;
  error: string | null;
  knownPrompt: number;
  knownAnswer: number;
  ready: number;
};

const empty: SentenceStatus = {
  loading: true,
  error: null,
  knownPrompt: 0,
  knownAnswer: 0,
  ready: 0,
};

export function useSentenceStatus(
  from: LangCode,
  to: LangCode,
  revision: number,
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>,
): SentenceStatus {
  const [status, setStatus] = useState<SentenceStatus>(empty);

  useEffect(() => {
    let cancelled = false;
    setStatus((current) => ({ ...current, loading: true, error: null }));
    Promise.all([loadLexicon(), loadSentencePack(from), loadSentencePack(to)])
      .then(([lexicon, promptPack, answerPack]) => {
        if (cancelled) return;
        const promptStats = read(to, from);
        const answerStats = read(from, to);
        const promptKnown = knownIdSet(promptStats);
        const answerKnown = knownIdSet(answerStats);
        const ready = generateSentences(lexicon, from, promptPack, to, answerPack, promptKnown, answerKnown).length;
        setStatus({
          loading: false,
          error: null,
          knownPrompt: lexiconKnownCount(lexicon, promptKnown),
          knownAnswer: lexiconKnownCount(lexicon, answerKnown),
          ready,
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
  }, [from, to, revision, read]);

  return status;
}
