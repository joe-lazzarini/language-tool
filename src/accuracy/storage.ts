import { docToStats, parseDirKey, statsToDoc, type AccuracyDoc } from "./stats";

export const ACCURACY_STORAGE_KEY = "slowka-accuracy-v1";

export type AccuracyStore = Record<string, AccuracyDoc>;

export function parseAccuracyDoc(id: string, value: unknown): AccuracyDoc | null {
  if (!parseDirKey(id) || !value || typeof value !== "object") return null;
  const words = (value as { words?: unknown }).words;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  if (!words || typeof words !== "object" || Array.isArray(words)) return null;
  if (typeof updatedAt !== "string" || !updatedAt || updatedAt.length >= 40) return null;
  const doc: AccuracyDoc = { words: {}, updatedAt };
  for (const [wordId, tuple] of Object.entries(words as Record<string, unknown>)) {
    if (!wordId || wordId.length > 80 || !Array.isArray(tuple)) continue;
    const nums = tuple.slice(0, 6);
    if (nums.some((item) => typeof item !== "number" || !Number.isFinite(item))) continue;
    doc.words[wordId] = nums as AccuracyDoc["words"][string];
  }
  const stats = docToStats(doc);
  return statsToDoc(stats, updatedAt);
}

export function parseAccuracyStore(raw: string | null): AccuracyStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: AccuracyStore = {};
    for (const [id, value] of Object.entries(parsed)) {
      const doc = parseAccuracyDoc(id, value);
      if (doc) store[id] = doc;
    }
    return store;
  } catch {
    return {};
  }
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readAccuracyStore(storage: Pick<Storage, "getItem"> | null = browserStorage()): AccuracyStore {
  if (!storage) return {};
  return parseAccuracyStore(storage.getItem(ACCURACY_STORAGE_KEY));
}

export function writeAccuracyStore(
  store: AccuracyStore,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(ACCURACY_STORAGE_KEY, JSON.stringify(store));
}
