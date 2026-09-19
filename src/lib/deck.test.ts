import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedFor,
  entriesForPair,
  expectedFor,
  pairRank,
  promptFor,
  wordsForRange,
} from "./deck";
import type { Dataset, Entry } from "../types";

const sample: Entry[] = [
  {
    id: "pl-3",
    pos: "verb",
    ranks: { pl: 3 },
    forms: {
      en: { text: "to be", accepted: ["be", "to be"] },
      pl: { text: "być", accepted: ["być"] },
      de: { text: "sein", accepted: ["sein"] },
    },
  },
  {
    id: "pl-1",
    pos: "preposition",
    ranks: { pl: 1 },
    forms: {
      en: { text: "in, at", accepted: ["in", "at"] },
      pl: { text: "w", accepted: ["w"] },
      de: { text: "in", accepted: ["in"] },
    },
  },
  {
    id: "de-1",
    pos: "determiner",
    ranks: { de: 1 },
    forms: {
      en: { text: "the", accepted: ["the"] },
      de: { text: "der", accepted: ["der"] },
    },
  },
  {
    id: "pl-21",
    pos: "noun",
    ranks: { pl: 21 },
    forms: {
      en: { text: "year", accepted: ["year"] },
      pl: { text: "rok", accepted: ["rok"] },
    },
  },
];

describe("entriesForPair", () => {
  it("uses the Polish-ranked deck for EN↔PL and PL↔DE", () => {
    const enPl = entriesForPair(sample, "en", "pl");
    expect(enPl.map((item) => item.id)).toEqual(["pl-1", "pl-3", "pl-21"]);

    const plDe = entriesForPair(sample, "pl", "de");
    expect(plDe.map((item) => item.id)).toEqual(["pl-1", "pl-3"]);
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
    expect(acceptedFor(word, "en")).toEqual(["to be", "be", "to be"]);
    expect(acceptedFor(word, "pl")).toEqual(["być", "być"]);
  });
});

describe("wordsForRange", () => {
  it("slices the already-sorted pair list", () => {
    const pair = entriesForPair(sample, "en", "pl");
    expect(wordsForRange(pair, "top100").map((item) => item.forms.pl?.text)).toEqual([
      "w",
      "być",
      "rok",
    ]);
  });
});

describe("bundled multilingual deck", () => {
  const dataset = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/words.json"), "utf8"),
  ) as Dataset;

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
    expect(first[0]?.forms.de?.text).toBe("der");
    expect(first.some((item) => item.forms.de?.text === "sein")).toBe(true);
    expect(first.some((item) => item.forms.de?.text === "ist")).toBe(false);
  });
});
