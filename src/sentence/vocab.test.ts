import { describe, expect, it } from "vitest";
import type { Entry } from "../types";
import { buildVocabIndex, inferSurface } from "./vocab";
import type { GrammarFile } from "./types";
import { recordAttempt, type WordStat } from "../accuracy/stats";

function knownStat(): WordStat {
  let stat = recordAttempt(undefined, true, 1);
  return recordAttempt(stat, true, 2);
}

function form(text: string, context?: string) {
  return { text, accepted: [{ text, ...(context ? { context } : {}) }] };
}

function entry(id: string, pos: string, forms: Entry["forms"], concept?: string): Entry {
  return { id, pos, ranks: {}, forms, concept };
}

describe("Polish surface inference", () => {
  it("forms -ki/-gi adjective feminines without *ia", () => {
    const szybki = entry("custom-fast", "adjective", { pl: form("szybki"), en: form("fast") });
    const wielki = entry("custom-great", "adjective", { pl: form("wielki"), en: form("great") });
    expect(inferSurface(szybki, "pl", "adjective")).toEqual({
      lemma: "szybki",
      m: "szybki",
      f: "szybka",
      n: "szybkie",
    });
    expect(inferSurface(wielki, "pl", "adjective")).toEqual({
      lemma: "wielki",
      m: "wielki",
      f: "wielka",
      n: "wielkie",
    });
  });

  it("keeps soft -i adjective feminines like ostatni → ostatnia", () => {
    const word = entry("custom-last", "adjective", { pl: form("ostatni"), en: form("last") });
    expect(inferSurface(word, "pl", "adjective")?.f).toBe("ostatnia");
  });

  it("inflects masculine-animate accusatives when grammar marks person/animal", () => {
    const grammar: GrammarFile = {
      version: 1,
      words: {
        "custom-friend": {
          pos: "noun",
          concept: "friend",
          sem: ["person"],
          langs: {
            pl: { lemma: "przyjaciel", gender: "m", acc: "przyjaciel" },
            en: { lemma: "friend", gender: "n" },
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
    const friend = entry("custom-friend", "noun", { pl: form("przyjaciel"), en: form("friend") }, "friend");
    const cat = entry("custom-cat", "noun", { pl: form("kot"), en: form("cat") }, "cat");
    const stats = new Map([
      ["custom-friend", knownStat()],
      ["custom-cat", knownStat()],
    ]);
    const index = buildVocabIndex([friend, cat], grammar, "en", "pl", stats, stats);
    expect(index.byId.get("custom-friend")?.answer.acc).toBe("przyjaciela");
    expect(index.byId.get("custom-friend")?.answer.npAcc).toBe("przyjaciela");
    expect(index.byId.get("custom-cat")?.answer.acc).toBe("kota");
  });

  it("does not invent animate accusative for untagged masculine nouns", () => {
    const house = entry("custom-house", "noun", { pl: form("dom"), en: form("house") });
    expect(inferSurface(house, "pl", "noun")?.acc).toBe("dom");
  });

  it("overrides broken grammar.json *ia feminine forms", () => {
    const grammar: GrammarFile = {
      version: 1,
      words: {
        "pl-792": {
          pos: "adjective",
          concept: "fast",
          langs: {
            pl: { lemma: "szybki", m: "szybki", f: "szybkia", n: "szybkie" },
            en: { lemma: "fast", m: "fast", f: "fast", n: "fast" },
          },
        },
      },
    };
    const word = entry("pl-792", "adjective", { pl: form("szybki"), en: form("fast") }, "fast");
    const stats = new Map([["pl-792", knownStat()]]);
    const index = buildVocabIndex([word], grammar, "en", "pl", stats, stats);
    expect(index.byId.get("pl-792")?.answer.f).toBe("szybka");
  });
});
