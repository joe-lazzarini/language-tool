import { useCallback, useEffect, useRef, useState } from "react";
import type { LangCode } from "../lib/languages";
import { createFlushQueue } from "./schedule";
import { loadRemoteAccuracy, persistRemoteAccuracy } from "./remote";
import { readAccuracyStore, writeAccuracyStore, type AccuracyStore } from "./storage";
import {
  dirKey,
  docToStats,
  mergeStats,
  putStat,
  recordAttempt,
  sameWords,
  statsToDoc,
  withManual,
  type AccuracyDoc,
  type WordStat,
} from "./stats";

const SAVE_WAIT_MS = 1000;

export function useAccuracy(uid: string | null) {
  const storeRef = useRef<AccuracyStore>(readAccuracyStore());
  const uidRef = useRef<string | null>(uid);
  uidRef.current = uid;
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);

  const queueRef = useRef(
    createFlushQueue<AccuracyDoc>(async (key, doc) => {
      const current = uidRef.current;
      if (!current) return;
      await persistRemoteAccuracy(current, key, doc);
    }, SAVE_WAIT_MS),
  );

  const bump = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const fail = useCallback((message: string) => {
    if (errorRef.current === message) return;
    errorRef.current = message;
    setError(message);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void queueRef.current.flush().catch(() => {
          fail("Practice history stays on this device until the next sign-in.");
        });
      }
    };
    const onPageHide = () => {
      void queueRef.current.flush().catch(() => {
        fail("Practice history stays on this device until the next sign-in.");
      });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      void queueRef.current.flush().catch(() => undefined);
    };
  }, [fail]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void loadRemoteAccuracy(uid)
      .then((remote) => {
        if (cancelled || uidRef.current !== uid) return;
        const local = storeRef.current;
        const next: AccuracyStore = {};
        const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
        for (const key of keys) {
          const localDoc = local[key];
          const remoteDoc = remote[key];
          // An empty local document is a deletion. Keep it when it is newer so a
          // refresh cannot restore words the user just cleared.
          if (localDoc && Object.keys(localDoc.words).length === 0 && (!remoteDoc || localDoc.updatedAt >= remoteDoc.updatedAt)) {
            next[key] = localDoc;
            if (remoteDoc) queueRef.current.schedule(key, localDoc);
            continue;
          }
          const merged = mergeStats(docToStats(localDoc), docToStats(remoteDoc));
          if (merged.size === 0) continue;
          const updatedAt =
            (localDoc?.updatedAt ?? "") > (remoteDoc?.updatedAt ?? "")
              ? localDoc!.updatedAt
              : (remoteDoc?.updatedAt ?? new Date().toISOString());
          next[key] = statsToDoc(merged, updatedAt);
          if (!sameWords(next[key], remoteDoc)) queueRef.current.schedule(key, next[key]);
        }
        storeRef.current = next;
        writeAccuracyStore(next);
        bump();
      })
      .catch(() => {
        if (!cancelled) fail("Practice history stays on this device until the next sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [uid, bump, fail]);

  const read = useCallback((from: LangCode, to: LangCode): Map<string, WordStat> => {
    if (from === to) return new Map();
    return docToStats(storeRef.current[dirKey(from, to)]);
  }, []);

  function commit(from: LangCode, to: LangCode, next: Map<string, WordStat>) {
    if (from === to) return;
    const key = dirKey(from, to);
    const doc = statsToDoc(next, new Date().toISOString());
    const store = { ...storeRef.current, [key]: doc };
    storeRef.current = store;
    writeAccuracyStore(store);
    bump();
    if (uidRef.current) queueRef.current.schedule(key, doc);
  }

  function record(from: LangCode, to: LangCode, wordId: string, correct: boolean) {
    if (!wordId || from === to) return;
    const current = docToStats(storeRef.current[dirKey(from, to)]);
    commit(from, to, putStat(current, wordId, recordAttempt(current.get(wordId), correct, Date.now())));
  }

  function toggleManual(from: LangCode, to: LangCode, wordId: string, manual: boolean) {
    if (!wordId || from === to) return;
    const current = docToStats(storeRef.current[dirKey(from, to)]);
    commit(from, to, putStat(current, wordId, withManual(current.get(wordId), manual, Date.now())));
  }

  return { read, record, toggleManual, revision, error };
}
