import { describe, expect, it } from "vitest";
import { dirKey, isWeak, recordAttempt, withManual, type WordStat } from "../accuracy/stats";
import type { Entry } from "../types";
import { progressFromStats } from "./generate";
import { sentenceRows } from "./rows";
import type { GrammarFile } from "./types";
import { buildVocabIndex, isEligibleStat, listGrammarCandidates } from "./vocab";

function knownStat(): WordStat {
  return recordAttempt(recordAttempt(undefined, true, 1), true, 2);
}

function weakKnownStat(): WordStat {
  // Two newest corrects → known, but recent window accuracy under 60%.
  let stat = recordAttempt(undefined, false, 1);
  for (let i = 0; i < 5; i += 1) stat = recordAttempt(stat, false, i + 2);
  return recordAttempt(recordAttempt(stat, true, 10), true, 11);
}

function form(text: string) {
  return { text, accepted: [{ text }] };
}

function entry(id: string, pos: string, en: string, pl: string, concept: string): Entry {
  return {
    id,
    pos,
    ranks: {},
    concept,
    forms: {
      en: form(en),
      pl: form(pl),
    },
  };
}

const grammar: GrammarFile = {
  version: 1,
  words: {
    "pl-house": {
      pos: "noun",
      concept: "house",
      sem: ["place"],
      langs: {
        en: { lemma: "house", gender: "n" },
        pl: { lemma: "dom", gender: "m" },
      },
    },
    "pl-sleep": {
      pos: "verb",
      concept: "sleep",
      valence: "vi",
      subject: ["person", "animal"],
      langs: {
        en: { lemma: "sleep", fin: "sleeps" },
        pl: { lemma: "spać", fin: "śpi" },
      },
    },
    "pl-big": {
      pos: "adjective",
      concept: "big",
      langs: {
        en: { lemma: "big", m: "big", f: "big", n: "big" },
        pl: { lemma: "duży", m: "duży", f: "duża", n: "duże" },
      },
    },
  },
};

const study: Entry[] = [
  entry("pl-house", "noun", "house", "dom", "house"),
  entry("pl-sleep", "verb", "sleep", "spać", "sleep"),
  entry("pl-big", "adjective", "big", "duży", "big"),
];

describe("pair-based known status", () => {
  it("keeps directed accuracy keys separate (en_pl vs pl_en)", () => {
    expect(dirKey("en", "pl")).toBe("en_pl");
    expect(dirKey("pl", "en")).toBe("pl_en");
    expect(dirKey("en", "pl")).not.toBe(dirKey("pl", "en"));
  });

  it("uses only the selected directed pair's stats for eligibility", () => {
    const enPl = new Map<string, WordStat>([["pl-house", knownStat()]]);
    const plEn = new Map<string, WordStat>([
      ["pl-house", knownStat()],
      ["pl-sleep", knownStat()],
    ]);

    expect([...buildVocabIndex(study, grammar, "en", "pl", enPl).byId.keys()]).toEqual(["pl-house"]);
    // Opposite-direction history is ignored: empty selected map → no eligible words.
    expect(buildVocabIndex(study, grammar, "en", "pl", new Map()).byId.size).toBe(0);
    expect([...buildVocabIndex(study, grammar, "pl", "en", plEn).byId.keys()].sort()).toEqual([
      "pl-house",
      "pl-sleep",
    ]);
  });

  it("does not require the opposite direction to be known", () => {
    const enPlOnly = new Map([
      ["pl-house", knownStat()],
      ["pl-sleep", knownStat()],
      ["pl-big", knownStat()],
    ]);
    const index = buildVocabIndex(study, grammar, "en", "pl", enPlOnly);
    expect(index.byId.size).toBe(3);
    expect(isEligibleStat(enPlOnly.get("pl-house"))).toBe(true);
    expect(isEligibleStat(undefined)).toBe(false);
  });

  it("excludes weak words for the selected pair even when they are known", () => {
    const stats = new Map([
      ["pl-house", knownStat()],
      ["pl-sleep", weakKnownStat()],
      ["pl-big", knownStat()],
    ]);
    expect(isWeak(stats.get("pl-sleep"))).toBe(true);
    expect(isEligibleStat(stats.get("pl-sleep"))).toBe(false);
    const index = buildVocabIndex(study, grammar, "en", "pl", stats);
    expect([...index.byId.keys()].sort()).toEqual(["pl-big", "pl-house"]);
  });

  it("counts known candidates for one directed pair", () => {
    const enPl = new Map([
      ["pl-house", knownStat()],
      ["pl-sleep", knownStat()],
    ]);
    const plEn = new Map([["pl-big", knownStat()]]);
    const candidates = listGrammarCandidates(study, grammar, "en", "pl");
    const knownEnPl = candidates.filter((item) => isEligibleStat(enPl.get(item.id))).length;
    const knownPlEn = candidates.filter((item) => isEligibleStat(plEn.get(item.id))).length;
    expect(knownEnPl).toBe(2);
    expect(knownPlEn).toBe(1);
  });

  it("lists lobby rows from selected-pair known status only", () => {
    const enPl = new Map([["pl-house", knownStat()]]);
    const rows = sentenceRows(study, grammar, "en", "pl", enPl);
    expect(rows.map((row) => row.id)).toEqual(["pl-house"]);
    expect(rows[0]).toMatchObject({ known: true, eligible: true, manual: false });

    // Words known only for PL→EN do not appear when reading EN→PL stats.
    expect(sentenceRows(study, grammar, "en", "pl", new Map())).toEqual([]);
    const plEn = new Map([["pl-sleep", knownStat()]]);
    expect(sentenceRows(study, grammar, "pl", "en", plEn).map((row) => row.id)).toEqual(["pl-sleep"]);
  });

  it("marks a manually known word for the selected pair", () => {
    const stats = new Map([["pl-house", withManual(undefined, true, 1)!]]);
    const rows = sentenceRows(study, grammar, "en", "pl", stats);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ known: true, manual: true, eligible: true });
  });

  it("averages progress accuracy from the selected pair only", () => {
    const stats = new Map([
      ["pl-house", knownStat()],
      ["pl-sleep", knownStat()],
    ]);
    const index = buildVocabIndex(study, grammar, "en", "pl", stats);
    const progress = progressFromStats(index, stats);
    expect(progress.knownCount).toBe(2);
    expect(progress.avgAccuracy).toBe(1);
  });
});
