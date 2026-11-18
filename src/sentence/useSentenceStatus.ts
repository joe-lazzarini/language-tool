import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { summarizePairKnown, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { generateSentences, progressFromStats, unlockHint } from "./generate";
import { loadGrammar, loadSentencePack } from "./load";
import { buildVocabIndex, listGrammarCandidates } from "./vocab";

export type SentenceStatus = {
  loading: boolean;
  error: string | null;
  /** Words known in both directions for this unordered pair. */
  knownBoth: number;
  /** Words known in exactly one direction. */
  knownOneWay: number;
  knownForwardOnly: number;
  knownReverseOnly: number;
  ready: number;
  unlockHint: string;
};

const empty: SentenceStatus = {
  loading: true,
  error: null,
  knownBoth: 0,
  knownOneWay: 0,
  knownForwardOnly: 0,
  knownReverseOnly: 0,
  ready: 0,
  unlockHint: "",
};

type CacheKey = string;

const statusCache = new Map<CacheKey, SentenceStatus>();

function statusKey(
  from: LangCode,
  to: LangCode,
  revision: number,
  studyEntries: readonly Entry[],
): CacheKey {
  // Entry list identity + length covers deck assembly and custom-word changes.
  return `${from}_${to}|r${revision}|n${studyEntries.length}|e${studyEntries[0]?.id ?? ""}|x${studyEntries[studyEntries.length - 1]?.id ?? ""}`;
}

function scheduleIdle(work: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => work(), { timeout: 120 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, 0);
  return () => window.clearTimeout(id);
}

/** Test helper. */
export function resetSentenceStatusCacheForTests(): void {
  statusCache.clear();
}

export function useSentenceStatus(
  from: LangCode,
  to: LangCode,
  revision: number,
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>,
  studyEntries: readonly Entry[],
): SentenceStatus {
  // Defer heavy lexicon / generate work so language pickers paint first on swap.
  const deferredFrom = useDeferredValue(from);
  const deferredTo = useDeferredValue(to);
  const deferredEntries = useDeferredValue(studyEntries);
  const deferredRevision = useDeferredValue(revision);

  const urgentKey = statusKey(from, to, revision, studyEntries);
  const deferredKey = statusKey(deferredFrom, deferredTo, deferredRevision, deferredEntries);

  const [status, setStatus] = useState<SentenceStatus>(() => statusCache.get(urgentKey) ?? empty);

  // Instant path: serve a cached direction without waiting on deferred values.
  useEffect(() => {
    const cached = statusCache.get(urgentKey);
    if (cached) {
      setStatus(cached);
    }
  }, [urgentKey]);

  useEffect(() => {
    let cancelled = false;
    const key = deferredKey;
    const cached = statusCache.get(key);
    if (cached) {
      startTransition(() => {
        if (!cancelled) setStatus(cached);
      });
      return () => {
        cancelled = true;
      };
    }

    // Keep the previous card content while recomputing — avoid flashing "Loading…"
    // on swap when another direction was already settled.
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      void Promise.all([loadGrammar(), loadSentencePack(deferredFrom), loadSentencePack(deferredTo)])
        .then(([grammar, promptPack, answerPack]) => {
          if (cancelled) return;
          // answerStats = selected direction from→to; promptStats = reverse to→from.
          const promptStats = read(deferredTo, deferredFrom);
          const answerStats = read(deferredFrom, deferredTo);
          const candidates = listGrammarCandidates(deferredEntries, grammar, deferredFrom, deferredTo);
          const index = buildVocabIndex(
            deferredEntries,
            grammar,
            deferredFrom,
            deferredTo,
            promptStats,
            answerStats,
          );
          const progress = progressFromStats(index, promptStats, answerStats);
          const ready = generateSentences(
            index,
            deferredFrom,
            promptPack,
            deferredTo,
            answerPack,
            progress,
          ).length;
          const pair = summarizePairKnown(
            candidates.map((entry) => entry.id),
            answerStats,
            promptStats,
          );
          const next: SentenceStatus = {
            loading: false,
            error: null,
            knownBoth: pair.knownBoth,
            knownOneWay: pair.knownOneWay,
            knownForwardOnly: pair.knownForwardOnly,
            knownReverseOnly: pair.knownReverseOnly,
            ready,
            unlockHint: unlockHint(ready, index),
          };
          statusCache.set(key, next);
          startTransition(() => {
            if (!cancelled) setStatus(next);
          });
        })
        .catch(() => {
          if (!cancelled) {
            startTransition(() => {
              setStatus({ ...empty, loading: false, error: "Couldn't load sentence patterns." });
            });
          }
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [deferredKey, deferredFrom, deferredTo, deferredRevision, deferredEntries, read]);

  return status;
}
