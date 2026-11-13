import { canonicalPair, LANG_CODES, sameLanguagePair, type LangPair } from "./languages";
import { cloneForm } from "./forms";
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

const MAX_WORD_ID = 80;

export function pairKey(pair: LangPair): string {
  return `${pair[0]}-${pair[1]}`;
}

/** Stable id for a legacy card copied onto one pair. The first pair keeps the original id. */
export function scopedWordId(baseId: string, pair: LangPair, primary: boolean): string {
  const root = baseId.slice(0, MAX_WORD_ID);
  if (primary) return root;
  const suffix = `--${pairKey(pair)}`;
  if (root.length + suffix.length <= MAX_WORD_ID) return `${root}${suffix}`;
  const hash = fnv1a(`${baseId}${suffix}`);
  const room = MAX_WORD_ID - suffix.length - hash.length;
  const prefix = room > 0 ? root.slice(0, room) : "";
  return `${prefix}${hash}${suffix}`.slice(0, MAX_WORD_ID);
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createCustomWord(
  input: { id?: string; pos: string; forms: CustomWord["forms"]; pair: LangPair; createdAt?: string },
  now = new Date().toISOString(),
): CustomWord {
  const pair = canonicalPair(input.pair[0], input.pair[1]);
  if (!pair) throw new Error("A custom word needs two different languages.");
  const forms: CustomWord["forms"] = {};
  for (const code of pair) {
    const form = input.forms[code];
    if (form) forms[code] = cloneForm(form);
  }
  return {
    id: input.id ?? newWordId(),
    pos: input.pos.trim() || "word",
    forms,
    pair,
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

export function wordSignature(word: {
  forms: Partial<Record<LangCode, Form>>;
  pair?: LangPair | null;
}): string {
  const pair = word.pair ? pairKey(word.pair) : "";
  return `${pair}§${LANG_CODES.map((code) => `${code}:${answerKey(word.forms[code])}`).join("§")}`;
}

/** Cards for this prompt/answer pair. Direction does not matter. */
export function customWordsForPair(words: CustomWord[], from: LangCode, to: LangCode): CustomWord[] {
  return words.filter((word) => sameLanguagePair(word.pair, from, to));
}

function filledCodes(forms: Partial<Record<LangCode, Form>>): LangCode[] {
  return LANG_CODES.filter((code) => {
    const form = forms[code];
    return Boolean(form?.text.trim() && form.accepted.some((item) => item.text.trim()));
  });
}

function pairForms(forms: Partial<Record<LangCode, Form>>, pair: LangPair): CustomWord["forms"] {
  const next: CustomWord["forms"] = {};
  for (const code of pair) {
    const form = forms[code];
    if (form) next[code] = cloneForm(form);
  }
  return next;
}

/**
 * A saved card with no pair was filled for every language the lookup found and
 * showed up in all of them. Give it one card per unordered pair that has both
 * forms, keeping accepted answers and context. The original id stays on the
 * lexicographically first pair; the other pairs get a deterministic id so a
 * second migration, or two devices, cannot fork duplicates.
 */
export function expandLegacyWord(word: CustomWord): CustomWord[] {
  if (word.pair) return [word];
  const codes = filledCodes(word.forms);
  if (codes.length < 2) return [word];
  const pairs: LangPair[] = [];
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const pair = canonicalPair(codes[i], codes[j]);
      if (pair) pairs.push(pair);
    }
  }
  pairs.sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
  return pairs.map((pair, index) => ({
    id: scopedWordId(word.id, pair, index === 0),
    pos: word.pos,
    forms: pairForms(word.forms, pair),
    pair,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
  }));
}

export function prepareWords(words: CustomWord[]): { words: CustomWord[]; migratedIds: string[] } {
  const migratedIds: string[] = [];
  const out: CustomWord[] = [];
  const seen = new Set<string>();

  const legacy: CustomWord[] = [];
  for (const word of words) {
    if (word.pair) {
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      out.push(word);
    } else {
      legacy.push(word);
    }
  }

  for (const word of legacy) {
    const copies = expandLegacyWord(word);
    const assigned = copies.some((copy) => copy.pair);
    for (const copy of copies) {
      if (seen.has(copy.id)) continue;
      seen.add(copy.id);
      out.push(copy);
      if (assigned && copy.pair) migratedIds.push(copy.id);
    }
  }

  return { words: out, migratedIds };
}

export function normalizeWordStore(store: WordStore): { store: WordStore; changed: boolean } {
  const prepared = prepareWords(store.words);
  return {
    store: {
      words: prepared.words,
      tombstones: store.tombstones,
      accountRevision: store.accountRevision,
    },
    changed: prepared.migratedIds.length > 0,
  };
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
  // Drop tombstoned cards before expanding a legacy card, so a deleted id
  // cannot come back as a pair copy.
  const remoteRaw = remote.filter((word) => !tombstones.has(word.id));
  const remoteNorm = prepareWords(remoteRaw);
  const localNorm = prepareWords(local.words.filter((word) => !tombstones.has(word.id)));
  const migratedRemote = new Set(remoteNorm.migratedIds);
  const remoteById = new Map(remoteNorm.words.map((word) => [word.id, word]));
  const removeRemoteIds = [...tombstones].filter((id) => remote.some((word) => word.id === id));
  const remoteKept = remoteNorm.words;
  const remoteSigs = new Set(remoteKept.map((word) => wordSignature(word)));

  const upload: CustomWord[] = [];
  const queued = new Set<string>();
  function queue(word: CustomWord) {
    if (!word.pair || queued.has(word.id) || tombstones.has(word.id)) return;
    queued.add(word.id);
    upload.push(toFirestoreWord(word));
  }

  for (const word of localNorm.words) {
    // A legacy card with fewer than two languages cannot be placed on a pair.
    // Keep it in the store so the migration never deletes it.
    if (!word.pair) continue;
    const remoteWord = remoteById.get(word.id);
    if (remoteWord) {
      if (word.updatedAt > remoteWord.updatedAt || migratedRemote.has(word.id)) queue(word);
      continue;
    }
    const seenAt = known[word.id];
    if (seenAt && word.updatedAt <= seenAt && !migratedRemote.has(word.id)) continue;
    if (remoteSigs.has(wordSignature(word))) continue;
    queue(word);
  }

  const nextById = new Map<string, CustomWord>();
  for (const word of remoteKept) nextById.set(word.id, word);
  for (const word of localNorm.words) {
    if (word.pair || tombstones.has(word.id)) continue;
    const current = nextById.get(word.id);
    if (!current || word.updatedAt > current.updatedAt) nextById.set(word.id, word);
  }
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

  // A legacy account card is expanded in memory. Write every resulting pair
  // back, including copies that existed only on the account.
  for (const id of migratedRemote) {
    const word = nextWords.find((item) => item.id === id);
    if (word) queue(word);
  }

  const accountRevision: Record<string, string> = {};
  for (const word of remote) {
    if (!tombstones.has(word.id)) accountRevision[word.id] = word.updatedAt;
  }

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
  return {
    id: record.id,
    pos: pos.slice(0, 40),
    forms,
    pair: parsePair((record as { pair?: unknown }).pair),
    createdAt,
    updatedAt,
  };
}

function parsePair(value: unknown): LangPair | null {
  if (typeof value === "string") {
    const [left, right] = value.split("-");
    if (left && right && isKnownCode(left) && isKnownCode(right)) return canonicalPair(left, right);
    return null;
  }
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [left, right] = value;
  if (typeof left !== "string" || typeof right !== "string") return null;
  if (!isKnownCode(left) || !isKnownCode(right)) return null;
  return canonicalPair(left, right);
}

function isKnownCode(value: string): value is LangCode {
  return LANG_CODES.some((code) => code === value);
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
    pair: word.pair ? canonicalPair(word.pair[0], word.pair[1]) : null,
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

export function readWordStore(
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
): WordStore {
  if (!storage) return emptyStore();
  const parsed = parseWordStore(storage.getItem(WORD_STORAGE_KEY));
  const norm = normalizeWordStore(parsed);
  // Rewrite a legacy store in place so a refresh does not depend on sign-in
  // to keep the pair copies.
  if (norm.changed) writeWordStore(norm.store, storage);
  return norm.store;
}

export function writeWordStore(
  store: WordStore,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(WORD_STORAGE_KEY, JSON.stringify(store));
}
