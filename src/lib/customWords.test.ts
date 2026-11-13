import { describe, expect, it } from "vitest";
import {
  customWordsForPair,
  entrySignature,
  parseStoredWord,
  parseWordStore,
  planSync,
  prepareWords,
  readWordStore,
  toEntry,
  withCustomEntries,
  WORD_STORAGE_KEY,
  type CustomWord,
  type WordStore,
} from "./customWords";
import { findDeckEntry } from "./findDeck";
import type { Entry } from "../types";

function word(id: string, updatedAt: string, en = "cat"): CustomWord {
  return {
    id,
    pos: "noun",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt,
    pair: ["en", "pl"],
    forms: {
      en: { text: en, accepted: [{ text: en }] },
      pl: { text: "kot", accepted: [{ text: "kot", context: "masculine" }] },
      de: { text: "Katze", accepted: [{ text: "Katze" }] },
    },
  };
}

function store(partial: Partial<WordStore> & Pick<WordStore, "words">): WordStore {
  return {
    words: partial.words,
    tombstones: partial.tombstones ?? [],
    accountRevision: partial.accountRevision ?? {},
  };
}

describe("planSync", () => {
  it("uploads words that exist only on this device", () => {
    const localOnly = word("custom-1", "2024-01-01T00:00:00.000Z");
    const plan = planSync(store({ words: [localOnly] }), []);
    expect(plan.upload.map((item) => item.id)).toEqual(["custom-1"]);
    expect(plan.nextWords).toEqual([localOnly]);
  });

  it("does not upload a second copy of the same citation forms", () => {
    const remote = word("custom-remote", "2024-02-01T00:00:00.000Z");
    const local = word("custom-local", "2024-03-01T00:00:00.000Z");
    const plan = planSync(store({ words: [local] }), [remote]);
    expect(plan.upload).toEqual([]);
    expect(plan.nextWords.map((item) => item.id)).toEqual(["custom-remote"]);
  });

  it("keeps the newer edit when both sides have the same id", () => {
    const remote = word("custom-1", "2024-01-01T00:00:00.000Z", "cat");
    const local = word("custom-1", "2024-05-01T00:00:00.000Z", "tomcat");
    const newerLocal = planSync(store({ words: [local] }), [remote]);
    expect(newerLocal.upload[0]?.forms.en?.text).toBe("tomcat");

    const newerRemote = planSync(store({ words: [remote] }), [local]);
    expect(newerRemote.upload).toEqual([]);
    expect(newerRemote.nextWords[0]?.forms.en?.text).toBe("tomcat");
  });

  it("deletes an account word when this device tombstoned it", () => {
    const remote = word("custom-1", "2024-01-01T00:00:00.000Z");
    const plan = planSync(store({ words: [], tombstones: ["custom-1"] }), [remote]);
    expect(plan.removeRemoteIds).toEqual(["custom-1"]);
    expect(plan.nextWords).toEqual([]);
    expect(plan.upload).toEqual([]);
  });

  it("does not resurrect a word the account already deleted", () => {
    const cached = word("custom-1", "2024-01-01T00:00:00.000Z");
    const plan = planSync(
      store({
        words: [cached],
        accountRevision: { "custom-1": cached.updatedAt },
      }),
      [],
    );
    expect(plan.upload).toEqual([]);
    expect(plan.nextWords).toEqual([]);
  });
});

describe("storage and deck merge", () => {
  it("parses a saved word and ignores junk", () => {
    expect(parseStoredWord({ id: "custom-1" })).toBeNull();
    const parsed = parseStoredWord(word("custom-1", "2024-01-01T00:00:00.000Z"));
    expect(parsed?.forms.pl?.accepted[0]).toEqual({ text: "kot", context: "masculine" });
    expect(parsed?.pair).toEqual(["en", "pl"]);
  });

  it("reads the local store shape, including a legacy array", () => {
    const saved = word("custom-1", "2024-01-01T00:00:00.000Z");
    expect(parseWordStore(JSON.stringify([saved])).words).toHaveLength(1);
    expect(parseWordStore("{").words).toEqual([]);
  });

  it("hides a custom card from the full deck when it repeats a bundled card", () => {
    const bundled: Entry = {
      id: "pl-9",
      pos: "noun",
      ranks: { pl: 9 },
      forms: word("bundled", "2024-01-01T00:00:00.000Z").forms,
    };
    const custom = toEntry(word("custom-1", "2024-01-01T00:00:00.000Z"));
    expect(entrySignature(bundled)).toBe(entrySignature(custom));
    expect(withCustomEntries([bundled], [custom])).toEqual([bundled]);
    const edited = toEntry(word("custom-2", "2024-01-01T00:00:00.000Z", "tomcat"));
    expect(withCustomEntries([bundled], [edited]).map((item) => item.id)).toEqual(["pl-9", "custom-2"]);
  });

  it("keeps hiding a saved en/pl/de card when the bundled card gained more languages", () => {
    const saved = word("custom-1", "2024-01-01T00:00:00.000Z");
    const bundled: Entry = {
      id: "pl-9",
      pos: "noun",
      ranks: { pl: 9 },
      forms: {
        ...saved.forms,
        es: { text: "gato", accepted: [{ text: "gato" }] },
      },
    };
    expect(withCustomEntries([bundled], [toEntry(saved)]).map((item) => item.id)).toEqual(["pl-9"]);
  });

  it("loads an older three-language word and a newer Spanish form", () => {
    const saved = word("custom-1", "2024-01-01T00:00:00.000Z");
    const parsed = parseStoredWord({
      ...saved,
      forms: {
        ...saved.forms,
        es: { text: "gato", accepted: [{ text: "gato" }] },
        xx: { text: "nope", accepted: [{ text: "nope" }] },
      },
    });
    expect(parsed?.forms.en?.text).toBe("cat");
    expect(parsed?.forms.pl?.text).toBe("kot");
    expect(parsed?.forms.de?.text).toBe("Katze");
    expect(parsed?.forms.es?.text).toBe("gato");
    expect(parsed?.pair).toEqual(["en", "pl"]);
    expect((parsed?.forms as Record<string, unknown>).xx).toBeUndefined();
  });
});

function legacyCard(id = "custom-1"): CustomWord {
  return { ...word(id, "2024-01-01T00:00:00.000Z"), pair: null };
}

describe("language pair migration", () => {
  it("assigns a legacy card to every pair that has both forms", () => {
    const legacy = legacyCard();
    const prepared = prepareWords([legacy]);
    expect(prepared.migratedIds).toHaveLength(3);
    expect(prepared.words.map((item) => item.pair && `${item.pair[0]}-${item.pair[1]}`).sort()).toEqual([
      "de-en",
      "de-pl",
      "en-pl",
    ]);

    const primary = prepared.words.find((item) => item.id === legacy.id);
    expect(primary?.pair).toEqual(["de", "en"]);
    expect(primary?.forms.de?.text).toBe("Katze");
    expect(primary?.forms.en?.text).toBe("cat");
    expect(primary?.forms.pl).toBeUndefined();
    expect(primary?.updatedAt).toBe(legacy.updatedAt);

    const enPl = prepared.words.find((item) => item.pair?.[0] === "en" && item.pair[1] === "pl");
    expect(enPl?.id).toBe("custom-1--en-pl");
    expect(enPl?.forms.en?.accepted).toEqual([{ text: "cat" }]);
    expect(enPl?.forms.pl?.accepted).toEqual([{ text: "kot", context: "masculine" }]);
    expect(enPl?.forms.de).toBeUndefined();
    expect(enPl?.createdAt).toBe(legacy.createdAt);
  });

  it("keeps every accepted answer and its context on the pair card", () => {
    const legacy = legacyCard();
    legacy.forms.en = {
      text: "cat",
      accepted: [{ text: "cat" }, { text: "tomcat", context: "male" }],
    };
    legacy.forms.pl = {
      text: "kot",
      accepted: [
        { text: "kot", context: "masculine" },
        { text: "kocur", context: "tomcat" },
      ],
    };
    const enPl = prepareWords([legacy]).words.find((item) => item.id === "custom-1--en-pl");
    expect(enPl?.forms.en?.accepted).toEqual([{ text: "cat" }, { text: "tomcat", context: "male" }]);
    expect(enPl?.forms.pl?.accepted).toEqual([
      { text: "kot", context: "masculine" },
      { text: "kocur", context: "tomcat" },
    ]);
  });

  it("is idempotent and does not split a card that already has a pair", () => {
    const once = prepareWords([legacyCard()]);
    const twice = prepareWords(once.words);
    expect(twice.migratedIds).toEqual([]);
    expect(twice.words.map((item) => item.id).sort()).toEqual(once.words.map((item) => item.id).sort());

    const paired = word("custom-kept", "2024-01-01T00:00:00.000Z");
    const kept = prepareWords([paired]);
    expect(kept.migratedIds).toEqual([]);
    expect(kept.words).toHaveLength(1);
    expect(kept.words[0]?.forms.de?.text).toBe("Katze");
  });

  it("keeps split ids inside the 80-character Firestore limit", () => {
    const legacy = legacyCard("c".repeat(80));
    const ids = prepareWords([legacy]).words.map((item) => item.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length > 0 && id.length <= 80)).toBe(true);
  });

  it("keeps a one-language legacy card instead of dropping it", () => {
    const solo = legacyCard();
    solo.forms = { en: { text: "cat", accepted: [{ text: "cat" }] } };
    const prepared = prepareWords([solo]);
    expect(prepared.migratedIds).toEqual([]);
    expect(prepared.words).toEqual([solo]);
    expect(customWordsForPair(prepared.words, "en", "pl")).toEqual([]);
  });

  it("treats a malformed pair as legacy and canonicalizes a swapped pair", () => {
    const legacy = legacyCard();
    expect(parseStoredWord({ ...legacy, pair: ["nope", "en"] })?.pair).toBeNull();
    const swapped = parseStoredWord({ ...word("custom-2", "2024-01-01T00:00:00.000Z"), pair: ["pl", "en"] });
    expect(swapped?.pair).toEqual(["en", "pl"]);
    expect(prepareWords(swapped ? [swapped] : []).migratedIds).toEqual([]);
  });

  it("shows a card for either direction of its pair and hides it from other pairs", () => {
    const words = prepareWords([legacyCard()]).words;
    const forward = customWordsForPair(words, "en", "pl").map((item) => item.id);
    const backward = customWordsForPair(words, "pl", "en").map((item) => item.id);
    expect(forward).toEqual(["custom-1--en-pl"]);
    expect(backward).toEqual(forward);
    expect(customWordsForPair(words, "en", "de").map((item) => item.id)).toEqual(["custom-1"]);
    expect(customWordsForPair(words, "fr", "it")).toEqual([]);
  });

  it("rewrites a legacy local store and leaves an already-paired store alone", () => {
    const memory = {
      raw: JSON.stringify([legacyCard()]),
      getItem(key: string) {
        return key === WORD_STORAGE_KEY ? this.raw : null;
      },
      setItem(key: string, value: string) {
        if (key === WORD_STORAGE_KEY) this.raw = value;
      },
    };
    const first = readWordStore(memory);
    expect(first.words).toHaveLength(3);
    expect(JSON.parse(memory.raw).words.every((item: CustomWord) => item.pair)).toBe(true);
    const written = memory.raw;
    const second = readWordStore(memory);
    expect(second.words.map((item) => item.id).sort()).toEqual(first.words.map((item) => item.id).sort());
    expect(memory.raw).toBe(written);
  });

  it("uploads each migrated pair once, including a card that exists only on the account", () => {
    const legacy = legacyCard();
    const fromAccount = planSync(store({ words: [] }), [legacy]);
    expect(fromAccount.nextWords).toHaveLength(3);
    expect(fromAccount.upload.map((item) => item.id).sort()).toEqual(
      fromAccount.nextWords.map((item) => item.id).sort(),
    );
    expect(fromAccount.upload.every((item) => item.pair)).toBe(true);

    const retry = planSync(
      store({ words: fromAccount.nextWords, accountRevision: fromAccount.accountRevision }),
      [legacy],
    );
    expect(retry.upload.map((item) => item.id).sort()).toEqual(fromAccount.upload.map((item) => item.id).sort());

    const settled = planSync(
      store({ words: fromAccount.nextWords, accountRevision: retry.accountRevision }),
      fromAccount.upload,
    );
    expect(settled.upload).toEqual([]);
    expect(settled.nextWords).toHaveLength(3);
  });

  it("does not recreate pair copies for a legacy card this device deleted", () => {
    const legacy = legacyCard();
    const plan = planSync(store({ words: [], tombstones: [legacy.id] }), [legacy]);
    expect(plan.removeRemoteIds).toEqual([legacy.id]);
    expect(plan.upload).toEqual([]);
    expect(plan.nextWords).toEqual([]);
  });

  it("reads a legacy array without dropping it before migration", () => {
    const saved = legacyCard();
    const parsed = parseWordStore(JSON.stringify([saved]));
    expect(parsed.words).toHaveLength(1);
    expect(parsed.words[0]?.pair).toBeNull();
    expect(prepareWords(parsed.words).words).toHaveLength(3);
  });
});

describe("findDeckEntry", () => {
  const entries: Entry[] = [
    {
      id: "gloss",
      pos: "noun",
      ranks: { en: 1 },
      forms: {
        en: { text: "feline", accepted: [{ text: "feline" }, { text: "cat" }] },
      },
    },
    {
      id: "head",
      pos: "noun",
      ranks: { en: 40 },
      forms: {
        en: { text: "cat", accepted: [{ text: "cat" }] },
        pl: { text: "kot", accepted: [{ text: "kot" }] },
      },
    },
  ];

  it("prefers the headword over a gloss that merely lists the same string", () => {
    expect(findDeckEntry(entries, "en", "  CAT ")?.id).toBe("head");
  });
});
