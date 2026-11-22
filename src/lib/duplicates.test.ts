import { describe, expect, it } from "vitest";
import { findDraftDuplicate, findDuplicateWord } from "./duplicates";
import { buildLemmaIndex, duplicateContentKey } from "./lemma";
import { planSync, type CustomWord, type WordStore } from "./customWords";
import type { GrammarFile } from "../sentence/types";
import type { Entry } from "../types";

const grammar: GrammarFile = {
  version: 1,
  words: {
    house: {
      pos: "noun",
      langs: {
        pl: { lemma: "dom", gender: "m" },
        en: { lemma: "house", gender: "n" },
      },
    },
  },
};

const lemmaIndex = buildLemmaIndex(grammar);

function mine(id: string, pl = "dom", en = "house", pos = "noun"): CustomWord {
  return {
    id,
    pos,
    pair: ["en", "pl"],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    forms: {
      pl: { text: pl, accepted: [{ text: pl }] },
      en: { text: en, accepted: [{ text: en }] },
    },
  };
}

const deck: Entry[] = [
  {
    id: "pl-103",
    pos: "noun",
    ranks: { pl: 103 },
    forms: {
      pl: { text: "dom", accepted: [{ text: "dom" }] },
      en: { text: "house", accepted: [{ text: "house" }] },
    },
  },
];

describe("findDuplicateWord", () => {
  it("flags a My-words card with the same folded citation and POS", () => {
    const hit = findDuplicateWord({
      lang: "pl",
      citation: "Dom",
      pos: "noun",
      pair: ["en", "pl"],
      customWords: [mine("custom-1")],
      deck: [],
    });
    expect(hit).toMatchObject({ kind: "custom", id: "custom-1", display: "dom" });
  });

  it("treats an inflected form as a duplicate of the lemma via the index", () => {
    const hit = findDuplicateWord({
      lang: "pl",
      citation: "domu",
      pos: "noun",
      pair: ["en", "pl"],
      customWords: [mine("custom-1", "dom")],
      deck: [],
      lemmaIndex,
    });
    expect(hit?.id).toBe("custom-1");
  });

  it("flags a built-in deck card for the pair", () => {
    const hit = findDuplicateWord({
      lang: "pl",
      citation: "dom",
      pos: "noun",
      pair: ["en", "pl"],
      customWords: [],
      deck,
    });
    expect(hit).toMatchObject({ kind: "deck", id: "pl-103", display: "dom" });
  });

  it("ignores a different part of speech", () => {
    const hit = findDuplicateWord({
      lang: "pl",
      citation: "dom",
      pos: "verb",
      pair: ["en", "pl"],
      customWords: [mine("custom-1")],
      deck,
    });
    expect(hit).toBeNull();
  });

  it("checks the draft after lookup using the source language first", () => {
    const hit = findDraftDuplicate({
      forms: {
        pl: { text: "dom", accepted: [{ text: "dom" }] },
        en: { text: "house", accepted: [{ text: "house" }] },
      },
      pos: "noun",
      pair: ["en", "pl"],
      source: "pl",
      customWords: [mine("custom-1")],
      deck: [],
    });
    expect(hit?.kind).toBe("custom");
  });
});

describe("sync soft dedupe", () => {
  function store(words: CustomWord[]): WordStore {
    return { words, tombstones: [], accountRevision: {} };
  }

  it("does not upload a local card that matches a remote soft duplicate (diacritics)", () => {
    // Polish diacritics are required in answer matching, so signatures differ, but
    // soft content keys fold marks so two devices cannot keep both.
    const remote = mine("custom-remote", "iść", "go");
    const local = mine("custom-local", "isc", "go");
    local.updatedAt = "2024-06-01T00:00:00.000Z";
    const plan = planSync(store([local]), [remote]);
    expect(plan.upload).toEqual([]);
    expect(plan.nextWords.map((item) => item.id)).toEqual(["custom-remote"]);
  });

  it("collapses two remote soft duplicates and removes the extra id", () => {
    const older = mine("custom-a", "iść", "go");
    const newer = mine("custom-b", "isc", "go");
    newer.createdAt = "2024-02-01T00:00:00.000Z";
    newer.updatedAt = "2024-02-01T00:00:00.000Z";
    const plan = planSync(store([]), [older, newer]);
    expect(plan.nextWords.map((item) => item.id)).toEqual(["custom-a"]);
    expect(plan.removeRemoteIds).toContain("custom-b");
  });

  it("builds the same content key after folding diacritics and case", () => {
    expect(duplicateContentKey(mine("a", "iść", "go"))).toBe(duplicateContentKey(mine("b", "Isc", "GO")));
  });
});
