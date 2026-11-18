import { describe, expect, it } from "vitest";
import {
  otherPairsWithWords,
  practiceRanges,
  rangeChoiceLabel,
  startActionLabel,
} from "./practiceSetup";
import type { CustomWord } from "../types";

function word(id: string, pair: [string, string]): CustomWord {
  const [a, b] = pair;
  return {
    id,
    pos: "noun",
    pair: pair as CustomWord["pair"],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    forms: {
      [a]: { text: id, accepted: [{ text: id }] },
      [b]: { text: `${id}-b`, accepted: [{ text: `${id}-b` }] },
    },
  };
}

describe("practiceRanges", () => {
  it("lists My words first, then the frequency bands", () => {
    const ids = practiceRanges().map((item) => item.id);
    expect(ids[0]).toBe("mine");
    expect(ids.slice(1)).toEqual([
      "top100",
      "top250",
      "top500",
      "all",
      "band2",
      "band3",
      "band4",
      "band5",
    ]);
  });
});

describe("rangeChoiceLabel", () => {
  it("includes the saved count for My words", () => {
    expect(rangeChoiceLabel("mine", 0)).toBe("My words (0)");
    expect(rangeChoiceLabel("mine", 12)).toBe("My words (12)");
  });

  it("uses the deck band labels", () => {
    expect(rangeChoiceLabel("top100", 99)).toBe("First 100");
    expect(rangeChoiceLabel("all", 0)).toBe("All");
  });
});

describe("startActionLabel", () => {
  it("names the mode and the selected source", () => {
    expect(startActionLabel("quiz", "mine", 12)).toBe("Start quiz · My words (12)");
    expect(startActionLabel("study", "top100", 0)).toBe("Start study · First 100");
    expect(startActionLabel("quiz", "all", 3)).toBe("Start quiz · All");
  });
});

describe("otherPairsWithWords", () => {
  it("skips the current pair and groups other pairs by count", () => {
    const words = [
      word("a", ["en", "pl"]),
      word("b", ["de", "en"]),
      word("c", ["de", "en"]),
      word("d", ["en", "es"]),
      word("legacy", ["en", "fr"]),
    ];
    words[4] = { ...words[4], pair: null };
    const other = otherPairsWithWords(words, "pl", "en");
    expect(other.map((item) => ({ label: item.label, count: item.count }))).toEqual([
      { label: "German–English", count: 2 },
      { label: "English–Spanish", count: 1 },
    ]);
  });

  it("returns an empty list when every word is on the current pair", () => {
    expect(otherPairsWithWords([word("a", ["en", "pl"])], "en", "pl")).toEqual([]);
  });
});
