import { describe, expect, it } from "vitest";
import { foldSentence, isCorrectSentence } from "./check";

describe("isCorrectSentence", () => {
  const polish = ["Kot śpi."];
  const english = ["The cat sleeps."];
  const japanese = ["猫は寝ます。", "猫は寝る。"];
  const russian = ["Ребёнок пьёт воду."];

  it("accepts case, spacing, and a missing final period", () => {
    expect(isCorrectSentence("kot śpi", polish, "pl")).toBe(true);
    expect(isCorrectSentence("Kot   śpi.", polish, "pl")).toBe(true);
    expect(isCorrectSentence("THE CAT SLEEPS", english, "en")).toBe(true);
    expect(isCorrectSentence("the cat sleeps!", english, "en")).toBe(true);
  });

  it("rejects a missing article, a wrong noun, and missing Polish diacritics", () => {
    expect(isCorrectSentence("cat sleeps", english, "en")).toBe(false);
    expect(isCorrectSentence("Pies śpi.", polish, "pl")).toBe(false);
    expect(isCorrectSentence("Kot spi.", polish, "pl")).toBe(false);
  });

  it("accepts a Japanese plain form and ignores spaces", () => {
    expect(isCorrectSentence("猫は寝る", japanese, "ja")).toBe(true);
    expect(isCorrectSentence("猫 は 寝ます。", japanese, "ja")).toBe(true);
    expect(isCorrectSentence("犬は寝ます", japanese, "ja")).toBe(false);
  });

  it("treats Russian ё and е as the same letter", () => {
    expect(isCorrectSentence("ребенок пьет воду", russian, "ru")).toBe(true);
    expect(isCorrectSentence("Ребёнок пьёт воду.", russian, "ru")).toBe(true);
    expect(foldSentence("L’eau est petite.", "fr")).toBe(foldSentence("l'eau est petite", "fr"));
  });

  it("folds Chinese spacing and the full stop", () => {
    const chinese = ["猫睡觉。", "猫睡觉"];
    expect(isCorrectSentence("猫睡觉", chinese, "zh")).toBe(true);
    expect(isCorrectSentence("猫 睡觉。", chinese, "zh")).toBe(true);
    expect(isCorrectSentence("狗睡觉", chinese, "zh")).toBe(false);
  });
});
