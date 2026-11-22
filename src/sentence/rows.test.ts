import { describe, expect, it } from "vitest";
import { markPairManual, recordAttempt, type WordStat } from "../accuracy/stats";
import type { Entry } from "../types";
import { sentenceRows } from "./rows";
import type { GrammarFile } from "./types";

function solid(now = 1): WordStat {
  return recordAttempt(recordAttempt(undefined, true, now), true, now + 1);
}

function form(text: string) {
  return { text, accepted: [{ text }] };
}

function entry(id: string, pos: string, forms: Entry["forms"], custom = false): Entry {
  return { id, pos, ranks: {}, forms, concept: id, custom };
}

const grammar: GrammarFile = {
  version: 1,
  words: {
    "pl-alfabet": {
      pos: "noun",
      concept: "alphabet",
      sem: ["thing"],
      langs: {
        pl: { lemma: "alfabet", gender: "m" },
        en: { lemma: "alphabet", gender: "n" },
      },
    },
    "custom-cat": {
      pos: "noun",
      concept: "cat",
      sem: ["animal"],
      langs: {
        pl: { lemma: "kot", gender: "m" },
        en: { lemma: "cat", gender: "n" },
      },
    },
  },
};

describe("sentenceRows pair-level known", () => {
  const alfabet = entry("pl-alfabet", "noun", { pl: form("alfabet"), en: form("alphabet") });
  const custom = entry("custom-cat", "noun", { pl: form("kot"), en: form("cat") }, true);

  it("exposes one Known/Learning status for the pair, not per direction", () => {
    const forwardOnly = new Map<string, WordStat>([["pl-alfabet", solid()]]);
    const empty = new Map<string, WordStat>();
    const rows = sentenceRows([alfabet], grammar, "pl", "en", empty, forwardOnly);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "pl-alfabet",
      pairKnown: true,
      pairManual: false,
      eligible: true,
    });
    expect(rows[0]).not.toHaveProperty("promptKnown");
    expect(rows[0]).not.toHaveProperty("answerKnown");
  });

  it("treats a manual mark on either side as pairManual via OR", () => {
    const marked = markPairManual(new Map(), new Map(), "pl-alfabet", true, 5);
    const rows = sentenceRows([alfabet], grammar, "en", "pl", marked.reverse, marked.forward);
    expect(rows[0]).toMatchObject({ pairKnown: true, pairManual: true, eligible: true });
  });

  it("lists custom words even while still Learning", () => {
    const rows = sentenceRows([custom], grammar, "en", "pl", new Map(), new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "custom-cat",
      pairKnown: false,
      pairManual: false,
      eligible: false,
    });
  });

  it("hides unpracticed catalog words from the lobby", () => {
    const rows = sentenceRows([alfabet], grammar, "en", "pl", new Map(), new Map());
    expect(rows).toEqual([]);
  });
});
