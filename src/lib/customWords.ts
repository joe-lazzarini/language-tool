import { LANG_CODES } from "./languages";
import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, CustomWord, Entry, Form, LangCode } from "../types";

export type { CustomWord };

export const WORD_STORAGE_KEY = "slowka-custom-words-v1";

export type WordStore = {
  words: CustomWord[];
  tombstones: string[];
  /** Last updatedAt seen on the account for each id. A missing id was deleted remotely. */
  accountRevision: Record<string, string>;
};

export type SyncPlan = {
  upload: CustomWord[];
  removeRemoteIds: string[];
  nextWords: CustomWord[];
  pendingTombstones: string[];
  accountRevision: Record<string, string>;
};

export function newWordId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom-${uuid}`;
}

export function createCustomWord(
  input: { id?: string; pos: string; forms: CustomWord["forms"]; createdAt?: string },
  now = new Date().toISOString(),
): CustomWord {
  return {
    id: input.id ?? newWordId(),
    pos: input.pos.trim() || "word",
    forms: input.forms,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

export function toEntry(word: CustomWord): Entry {
  return {
    id: word.id,
    pos: word.pos || "word",
    custom: true,
    ranks: {},
    forms: word.forms,
  };
}

function answerKey(form: Form | undefined): string {
  return (form?.accepted ?? [])
    .map((item) => normalizeAnswer(item.text))
    .filter(Boolean)
    .sort()
    .join("|");
}

export function wordSignature(word: { forms: Partial<Record<LangCode, Form>> }): string {
  return LANG_CODES.map((code) => `${code}:${answerKey(word.forms[code])}`).join("§");
}

/** True when every language the custom card filled matches the bundled card.
 *  Extra bundled languages (added after the word was saved) do not count. */
export function repeatsBundled(
  custom: { forms: Partial<Record<LangCode, Form>> },
  bundled: { forms: Partial<Record<LangCode, Form>> },
): boolean {
  const codes = LANG_CODES.filter((code) => answerKey(custom.forms[code]));
  if (codes.length === 0) return false;
  return codes.every((code) => answerKey(bundled.forms[code]) === answerKey(custom.forms[code]));
}

export function entrySignature(entry: Entry): string {
  return wordSignature(entry);
}

/** Drop custom cards that repeat a bundled card so the full deck does not quiz them twice. */
export function withCustomEntries(bundled: Entry[], custom: Entry[]): Entry[] {
  const extras = custom.filter((entry) => entry.custom && !bundled.some((item) => repeatsBundled(entry, item)));
  return [...bundled, ...extras];
}

export function upsertWord(words: CustomWord[], word: CustomWord): CustomWord[] {
  const index = words.findIndex((item) => item.id === word.id);
  if (index === -1) return [...words, word];
  const next = words.slice();
  next[index] = word;
  return next;
}

/**
 * Merge this device's words into an account snapshot.
 * The account wins when it is newer. A local deletion (tombstone) wins over both.
 * Same citation forms under a different id are not uploaded again.
 */
export function planSync(local: WordStore, remote: CustomWord[]): SyncPlan {
  const tombstones = new Set(local.tombstones.filter(Boolean));
  const known = local.accountRevision ?? {};
  const remoteById = new Map(remote.map((word) => [word.id, word]));
  const removeRemoteIds = [...tombstones].filter((id) => remoteById.has(id));
  const remoteKept = remote.filter((word) => !tombstones.has(word.id));
  const remoteSigs = new Set(remoteKept.map((word) => wordSignature(word)));

  const upload: CustomWord[] = [];
  for (const word of local.words) {
    if (tombstones.has(word.id)) continue;
    const remoteWord = remoteById.get(word.id);
    if (remoteWord) {
      if (word.updatedAt > remoteWord.updatedAt) upload.push(word);
      continue;
    }
    const seenAt = known[word.id];
    if (seenAt && word.updatedAt <= seenAt) continue;
    if (remoteSigs.has(wordSignature(word))) continue;
    upload.push(word);
  }

  const nextById = new Map<string, CustomWord>();
  for (const word of remoteKept) nextById.set(word.id, word);
  for (const word of upload) {
    const current = nextById.get(word.id);
    if (!current || word.updatedAt >= current.updatedAt) nextById.set(word.id, word);
  }

  const seen = new Set<string>();
  const nextWords: CustomWord[] = [];
  for (const word of nextById.values()) {
    const signature = wordSignature(word);
    if (seen.has(signature)) continue;
    seen.add(signature);
    nextWords.push(word);
  }
  nextWords.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const accountRevision: Record<string, string> = {};
  for (const word of remoteKept) accountRevision[word.id] = word.updatedAt;

  return {
    upload,
    removeRemoteIds,
    nextWords,
    pendingTombstones: removeRemoteIds,
    accountRevision,
  };
}

function isAnswer(value: unknown): value is AcceptedAnswer {
  if (!value || typeof value !== "object") return false;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string";
}

function parseForm(value: unknown): Form | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: unknown }).text;
  const accepted = (value as { accepted?: unknown }).accepted;
  if (typeof text !== "string" || !Array.isArray(accepted)) return null;
  const rows = accepted.filter(isAnswer).map((item) => {
    const context = item.context?.trim();
    return context ? { text: item.text, context } : { text: item.text };
  });
  if (!text.trim() || rows.length === 0) return null;
  return { text, accepted: rows };
}

export function parseStoredWord(value: unknown): CustomWord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<CustomWord> & { forms?: unknown };
  if (typeof record.id !== "string" || !record.id || record.id.length > 80) return null;
  if (!record.forms || typeof record.forms !== "object") return null;
  const forms: CustomWord["forms"] = {};
  for (const code of LANG_CODES) {
    const form = parseForm((record.forms as Partial<Record<LangCode, unknown>>)[code]);
    if (form) forms[code] = form;
  }
  if (Object.keys(forms).length === 0) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : record.updatedAt;
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") return null;
  const pos = typeof record.pos === "string" && record.pos.trim() ? record.pos.trim() : "word";
  return { id: record.id, pos: pos.slice(0, 40), forms, createdAt, updatedAt };
}

export function toFirestoreWord(word: CustomWord): CustomWord {
  const forms: CustomWord["forms"] = {};
  for (const code of LANG_CODES) {
    const form = word.forms[code];
    if (!form) continue;
    forms[code] = {
      text: form.text,
      accepted: form.accepted.map((item) =>
        item.context?.trim() ? { text: item.text, context: item.context.trim() } : { text: item.text },
      ),
    };
  }
  return {
    id: word.id,
    pos: word.pos.slice(0, 40),
    forms,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
  };
}

function emptyStore(): WordStore {
  return { words: [], tombstones: [], accountRevision: {} };
}

export function parseWordStore(raw: string | null): WordStore {
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        words: parsed.map(parseStoredWord).filter((word): word is CustomWord => word !== null),
        tombstones: [],
        accountRevision: {},
      };
    }
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const words = Array.isArray((parsed as { words?: unknown }).words)
      ? (parsed as { words: unknown[] }).words
          .map(parseStoredWord)
          .filter((word): word is CustomWord => word !== null)
      : [];
    const tombstones = Array.isArray((parsed as { tombstones?: unknown }).tombstones)
      ? (parsed as { tombstones: unknown[] }).tombstones.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    const accountRevision: Record<string, string> = {};
    const rawRevision = (parsed as { accountRevision?: unknown }).accountRevision;
    if (rawRevision && typeof rawRevision === "object") {
      for (const [id, updatedAt] of Object.entries(rawRevision)) {
        if (typeof updatedAt === "string" && id) accountRevision[id] = updatedAt;
      }
    }
    return { words, tombstones, accountRevision };
  } catch {
    return emptyStore();
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

export function readWordStore(storage: Pick<Storage, "getItem"> | null = browserStorage()): WordStore {
  if (!storage) return emptyStore();
  return parseWordStore(storage.getItem(WORD_STORAGE_KEY));
}

export function writeWordStore(
  store: WordStore,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(WORD_STORAGE_KEY, JSON.stringify(store));
}
