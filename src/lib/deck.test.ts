import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedFor,
  entriesForPair,
  expectedFor,
  pairRank,
  promptFor,
  revealAnswers,
  wordsForRange,
} from "./deck";
import { isCorrectAnswer, normalizeAnswer } from "./match";
import type { Dataset, Entry } from "../types";

const sample: Entry[] = [
  {
    id: "pl-3",
    pos: "verb",
    ranks: { pl: 3 },
    forms: {
      en: {
        text: "to be",
        accepted: [
          { text: "to be" },
          { text: "be" },
        ],
      },
      pl: { text: "być", accepted: [{ text: "być" }] },
      de: { text: "sein", accepted: [{ text: "sein" }] },
    },
  },
  {
    id: "pl-1",
    pos: "preposition",
    ranks: { pl: 1 },
    forms: {
      en: {
        text: "in, at",
        accepted: [{ text: "in" }, { text: "at" }],
      },
      pl: { text: "w", accepted: [{ text: "w" }] },
      de: { text: "in", accepted: [{ text: "in" }] },
    },
  },
  {
    id: "de-1",
    pos: "determiner",
    ranks: { de: 1 },
    forms: {
      en: { text: "the", accepted: [{ text: "the" }] },
      de: {
        text: "der / die / das",
        accepted: [
          { text: "der", context: "masculine" },
          { text: "die", context: "feminine / plural" },
          { text: "das", context: "neuter" },
        ],
      },
    },
  },
  {
    id: "pl-21",
    pos: "noun",
    ranks: { pl: 21 },
    forms: {
      en: { text: "year", accepted: [{ text: "year" }] },
      pl: { text: "rok", accepted: [{ text: "rok" }] },
    },
  },
  {
    id: "pl-9",
    pos: "pronoun",
    ranks: { pl: 9 },
    forms: {
      en: {
        text: "this, that, it",
        accepted: [
          { text: "this", context: "near / present" },
          { text: "that", context: "far / aforementioned" },
          { text: "it", context: "neuter dummy" },
        ],
      },
      pl: {
        text: "ten / ta / to",
        accepted: [
          { text: "ten", context: "masculine" },
          { text: "ta", context: "feminine" },
          { text: "to", context: "neuter" },
        ],
      },
      de: {
        text: "dieser / diese / dieses",
        accepted: [
          { text: "dieser", context: "masculine 'this'" },
          { text: "diese", context: "feminine / plural 'this'" },
          { text: "dieses", context: "neuter 'this'" },
        ],
      },
    },
  },
];

describe("entriesForPair", () => {
  it("uses the Polish-ranked deck for EN↔PL and PL↔DE", () => {
    const enPl = entriesForPair(sample, "en", "pl");
    expect(enPl.map((item) => item.id)).toEqual(["pl-1", "pl-3", "pl-9", "pl-21"]);

    const plDe = entriesForPair(sample, "pl", "de");
    expect(plDe.map((item) => item.id)).toEqual(["pl-1", "pl-3", "pl-9"]);
  });

  it("uses the German-ranked deck for EN↔DE", () => {
    const enDe = entriesForPair(sample, "en", "de");
    expect(enDe.map((item) => item.id)).toEqual(["de-1"]);
  });

  it("returns no cards when prompt and answer are the same language", () => {
    expect(entriesForPair(sample, "de", "de")).toEqual([]);
  });

  it("orders German pairs by German frequency and Polish pairs by Polish frequency", () => {
    expect(pairRank(sample[2], "en", "de")).toBe(1);
    expect(pairRank(sample[0], "de", "pl")).toBe(3);
    expect(pairRank(sample[0], "en", "pl")).toBe(3);
  });
});

describe("prompt and answer helpers", () => {
  const word = sample[0];

  it("uses the selected prompt language, not a hard-coded English side", () => {
    expect(promptFor(word, "pl")).toBe("być");
    expect(promptFor(word, "de")).toBe("sein");
    expect(promptFor(word, "en")).toBe("to be");
  });

  it("accepts the target lemma and listed glosses", () => {
    expect(expectedFor(word, "de")).toBe("sein");
    expect(acceptedFor(word, "en")).toEqual(["to be", "be"]);
    expect(acceptedFor(word, "pl")).toEqual(["być"]);
  });
});

describe("ten / ta / to family", () => {
  const card = sample[4];

  it("is a single card that accepts all three Polish forms", () => {
    expect(promptFor(card, "pl")).toBe("ten / ta / to");
    expect(acceptedFor(card, "pl")).toEqual(["ten", "ta", "to"]);
    expect(isCorrectAnswer("ta", expectedFor(card, "pl"), acceptedFor(card, "pl"))).toBe(true);
    expect(isCorrectAnswer("TEN", expectedFor(card, "pl"), acceptedFor(card, "pl"))).toBe(true);
    expect(isCorrectAnswer("to", expectedFor(card, "pl"), acceptedFor(card, "pl"))).toBe(true);
  });

  it("accepts this, that, or it in English", () => {
    expect(isCorrectAnswer("this", expectedFor(card, "en"), acceptedFor(card, "en"))).toBe(true);
    expect(isCorrectAnswer("that", expectedFor(card, "en"), acceptedFor(card, "en"))).toBe(true);
    expect(isCorrectAnswer("it", expectedFor(card, "en"), acceptedFor(card, "en"))).toBe(true);
  });

  it("exposes contexts for the reveal list", () => {
    expect(revealAnswers(card, "pl")).toEqual([
      { text: "ten", context: "masculine" },
      { text: "ta", context: "feminine" },
      { text: "to", context: "neuter" },
    ]);
  });
});

describe("wordsForRange", () => {
  it("slices the already-sorted pair list", () => {
    const pair = entriesForPair(sample, "en", "pl");
    expect(wordsForRange(pair, "top100").map((item) => item.forms.pl?.text)).toEqual([
      "w",
      "być",
      "ten / ta / to",
      "rok",
    ]);
  });
});

describe("bundled multilingual deck", () => {
  const dataset = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/words.json"), "utf8"),
  ) as Dataset;

  function polishCards() {
    return entriesForPair(dataset.entries, "en", "pl");
  }

  function texts(entry: Entry, lang: "en" | "pl" | "de") {
    return acceptedFor(entry, lang).map((item) => normalizeAnswer(item));
  }

  it("has about 1000 cards for every EN/PL/DE pair", () => {
    const pairs = [
      ["en", "pl"],
      ["pl", "en"],
      ["en", "de"],
      ["de", "en"],
      ["pl", "de"],
      ["de", "pl"],
    ] as const;
    for (const [from, to] of pairs) {
      expect(entriesForPair(dataset.entries, from, to).length).toBe(1000);
    }
  });

  it("keeps German lemmas in dictionary form for the first EN→DE band", () => {
    const first = wordsForRange(entriesForPair(dataset.entries, "en", "de"), "top100");
    expect(texts(first[0], "de")).toEqual(expect.arrayContaining(["der", "die", "das"]));
    expect(first.some((item) => texts(item, "de").includes("sein"))).toBe(true);
    expect(first.some((item) => item.forms.de?.text === "ist")).toBe(false);
  });

  it("merges ten / ta / to into one card that accepts all three forms", () => {
    const matches = polishCards().filter((entry) => {
      const pl = texts(entry, "pl");
      return pl.includes("ten") || pl.includes("to") || pl.includes("ta");
    });
    expect(matches).toHaveLength(1);
    const card = matches[0];
    expect(texts(card, "pl")).toEqual(expect.arrayContaining(["ten", "ta", "to"]));
    expect(isCorrectAnswer("ta", expectedFor(card, "pl"), acceptedFor(card, "pl"))).toBe(true);
    expect(isCorrectAnswer("to", expectedFor(card, "pl"), acceptedFor(card, "pl"))).toBe(true);
    expect(revealAnswers(card, "pl").map((item) => item.context)).toEqual(
      expect.arrayContaining(["masculine", "feminine", "neuter"]),
    );
  });

  it("does not list tu and tutaj as separate cards", () => {
    const matches = polishCards().filter((entry) => {
      const pl = texts(entry, "pl");
      return pl.includes("tu") || pl.includes("tutaj");
    });
    expect(matches).toHaveLength(1);
  });

  it("accepts any English synonym listed on a card", () => {
    const moc = polishCards().find((entry) => texts(entry, "pl").includes("móc"));
    expect(moc).toBeTruthy();
    expect(isCorrectAnswer("can", expectedFor(moc!, "en"), acceptedFor(moc!, "en"))).toBe(true);
    expect(isCorrectAnswer("to be able to", expectedFor(moc!, "en"), acceptedFor(moc!, "en"))).toBe(
      true,
    );
  });
});
