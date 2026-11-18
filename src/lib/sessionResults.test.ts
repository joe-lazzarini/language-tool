import { describe, expect, it } from "vitest";
import type { Entry } from "../types";
import {
  scoreSummary,
  uniqueMissed,
  uniqueMissedSentences,
  uniqueMissedSentenceWords,
} from "./sessionResults";

function entry(id: string, en: string, pl: string): Entry {
  return {
    id,
    pos: "noun",
    ranks: { en: 1 },
    forms: {
      en: { text: en, accepted: [{ text: en }] },
      pl: { text: pl, accepted: [{ text: pl }] },
    },
  };
}

describe("uniqueMissed", () => {
  it("keeps every wrong card once and ignores later correct retries", () => {
    const cat = entry("cat", "cat", "kot");
    const dog = entry("dog", "dog", "pies");
    const sameId = entry("cat", "cat", "kot / kota");
    const results = [
      { word: cat, correct: false, given: "nope" },
      { word: dog, correct: true, given: "pies" },
      { word: sameId, correct: true, given: "kot" },
      { word: cat, correct: false, given: "still wrong" },
    ];
    const missed = uniqueMissed(results);
    expect(missed).toHaveLength(1);
    expect(missed[0]?.word.id).toBe("cat");
    expect(missed[0]?.given).toBe("nope");
    expect(scoreSummary(results)).toEqual({
      right: 2,
      total: 4,
      missed,
    });
  });

  it("lists distinct ids even when forms were merged (ten/ta/to family stays one card)", () => {
    const demo = entry("pl-9", "this", "ten / ta / to");
    const bird = entry("bird", "bird", "ptak");
    expect(
      uniqueMissed([
        { word: demo, correct: false, given: "tamten" },
        { word: bird, correct: false, given: "" },
      ]).map((item) => item.word.id),
    ).toEqual(["pl-9", "bird"]);
  });
});

describe("uniqueMissedSentences", () => {
  it("dedupes by sentence id and collects wrong tokens / word ids", () => {
    const results = [
      {
        sentence: { id: "s1", prompt: "The cat sleeps.", accepted: ["Kot śpi."], wordIds: ["cat", "sleep"] },
        correct: false,
        given: "Pies śpi.",
        wrongTokens: ["Kot"],
      },
      {
        sentence: { id: "s1", prompt: "The cat sleeps.", accepted: ["Kot śpi."], wordIds: ["cat", "sleep"] },
        correct: false,
        given: "again",
        wrongTokens: ["Kot", "śpi"],
      },
      {
        sentence: { id: "s2", prompt: "A dog runs.", accepted: ["Pies biegnie."], wordIds: ["dog", "run"] },
        correct: true,
        given: "Pies biegnie.",
      },
      {
        sentence: { id: "s3", prompt: "A bird flies.", accepted: ["Ptak leci."], wordIds: ["bird", "fly"] },
        correct: false,
        given: "",
      },
    ];
    const missed = uniqueMissedSentences(results);
    expect(missed.map((item) => item.sentence.id)).toEqual(["s1", "s3"]);

    // s1 uses wrongTokens; s3 falls back to wordIds (no deck → id as answer text).
    expect(uniqueMissedSentenceWords(results, new Map(), "en", "pl").map((item) => item.id)).toEqual([
      "token:Kot",
      "bird",
      "fly",
    ]);

    const deck = new Map<string, Entry>([
      ["bird", entry("bird", "bird", "ptak")],
      ["fly", entry("fly", "fly", "lecieć")],
    ]);
    expect(uniqueMissedSentenceWords(results, deck, "en", "pl")).toEqual([
      { id: "token:Kot", answer: "Kot", prompt: "The cat sleeps." },
      { id: "bird", answer: "ptak", prompt: "bird" },
      { id: "fly", answer: "lecieć", prompt: "fly" },
    ]);
  });
});
