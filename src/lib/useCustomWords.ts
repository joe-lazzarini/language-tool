import { useEffect, useRef, useState } from "react";
import { authErrorMessage, isFirebaseConfigured, loadFirebase, type Account } from "./account";
import {
  planSync,
  readWordStore,
  toFirestoreWord,
  upsertWord,
  writeWordStore,
  type CustomWord,
} from "./customWords";

export function useCustomWords() {
  const configured = isFirebaseConfigured();
  const [words, setWords] = useState<CustomWord[]>(() => readWordStore().words);
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(!configured);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const accountRef = useRef<Account | null>(null);
  const announcedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let unsubAuth = () => {};
    let unsubWords = () => {};
    let chain = Promise.resolve();

    void loadFirebase()
      .then((api) => {
        if (cancelled) return;
        if (!api) {
          setReady(true);
          return;
        }
        unsubAuth = api.watchAuth((next) => {
          if (cancelled) return;
          accountRef.current = next;
          setAccount(next);
          setReady(true);
          unsubWords();
          unsubWords = () => {};
          if (!next) {
            announcedRef.current = null;
            setWords(readWordStore().words);
            setStatus(null);
            return;
          }
          const uid = next.uid;
          unsubWords = api.watchWords(
            uid,
            (remote) => {
              if (cancelled || accountRef.current?.uid !== uid) return;
              const plan = planSync(readWordStore(), remote);
              writeWordStore({
                words: plan.nextWords,
                tombstones: plan.pendingTombstones,
                accountRevision: plan.accountRevision,
              });
              setWords(plan.nextWords);
              if (announcedRef.current !== uid) {
                announcedRef.current = uid;
                if (plan.upload.length > 0) {
                  const count = plan.upload.length;
                  setStatus(
                    count === 1
                      ? "Moved 1 word from this browser to your account."
                      : `Moved ${count} words from this browser to your account.`,
                  );
                }
              }
              if (plan.upload.length === 0 && plan.removeRemoteIds.length === 0) return;
              chain = chain
                .then(async () => {
                  if (cancelled || accountRef.current?.uid !== uid) return;
                  for (const id of plan.removeRemoteIds) await api.removeWord(uid, id);
                  for (const word of plan.upload) await api.writeWord(uid, word);
                  const current = readWordStore();
                  writeWordStore({
                    words: current.words,
                    tombstones: current.tombstones.filter((id) => !plan.removeRemoteIds.includes(id)),
                    accountRevision: current.accountRevision,
                  });
                })
                .catch(() => {
                  if (!cancelled) {
                    setError("Couldn't reach your account. Changes stay on this device until the next sign-in.");
                  }
                });
            },
            (message) => {
              if (!cancelled) setError(message);
            },
          );
        });
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
          setError("Cloud sync couldn't start. Words stay on this device.");
        }
      });

    return () => {
      cancelled = true;
      unsubAuth();
      unsubWords();
    };
  }, [configured]);

  async function signIn() {
    setError(null);
    if (!configured) {
      setError("Cloud sync isn't configured for this build. Words stay in this browser.");
      return;
    }
    setSigningIn(true);
    try {
      const api = await loadFirebase();
      if (!api) {
        setError("Cloud sync isn't configured for this build. Words stay in this browser.");
        return;
      }
      await api.signIn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    setError(null);
    const api = await loadFirebase();
    if (!api) return;
    await api.signOut();
  }

  async function saveWord(word: CustomWord) {
    const stored = toFirestoreWord(word);
    const store = readWordStore();
    writeWordStore({
      words: upsertWord(store.words, stored),
      tombstones: store.tombstones.filter((id) => id !== stored.id),
      accountRevision: store.accountRevision,
    });
    setWords(readWordStore().words);
    const uid = accountRef.current?.uid;
    if (!uid) return;
    try {
      const api = await loadFirebase();
      if (!api) return;
      await api.writeWord(uid, stored);
    } catch {
      setError("Saved on this device. It will sync to your account the next time sign-in works.");
    }
  }

  async function deleteWord(id: string) {
    const store = readWordStore();
    writeWordStore({
      words: store.words.filter((word) => word.id !== id),
      tombstones: store.tombstones.includes(id) ? store.tombstones : [...store.tombstones, id],
      accountRevision: store.accountRevision,
    });
    setWords(readWordStore().words);
    const uid = accountRef.current?.uid;
    if (!uid) return;
    try {
      const api = await loadFirebase();
      if (!api) return;
      await api.removeWord(uid, id);
      const current = readWordStore();
      writeWordStore({
        words: current.words,
        tombstones: current.tombstones.filter((item) => item !== id),
        accountRevision: current.accountRevision,
      });
    } catch {
      setError("Deleted on this device. It will be removed from your account the next time sign-in works.");
    }
  }

  return {
    words,
    account,
    configured,
    ready,
    status,
    error,
    signingIn,
    signIn,
    signOut,
    saveWord,
    deleteWord,
  };
}
