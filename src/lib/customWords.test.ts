import { describe, expect, it } from "vitest";
import {
  entrySignature,
  parseStoredWord,
  parseWordStore,
  planSync,
  toEntry,
  withCustomEntries,
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
    expect((parsed?.forms as Record<string, unknown>).xx).toBeUndefined();
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
