import { describe, expect, it } from "vitest";
import { foldSentence, gradeSentence, isCorrectSentence } from "./check";
import { articleChoiceFlexible, stripArticlesForCompare } from "./articles";

describe("isCorrectSentence", () => {
  const polish = ["Kot śpi."];
  const english = ["The cat sleeps."];
  const japanese = ["猫は寝ます。", "猫は寝る。"];
  const russian = ["Ребёнок пьёт воду."];
  const german = ["Die Katze schläft."];

  it("accepts case, spacing, and a missing final period", () => {
    expect(isCorrectSentence("kot śpi", polish, "pl")).toBe(true);
    expect(isCorrectSentence("Kot   śpi.", polish, "pl")).toBe(true);
    expect(isCorrectSentence("THE CAT SLEEPS", english, "en")).toBe(true);
    expect(isCorrectSentence("the cat sleeps!", english, "en")).toBe(true);
  });

  it("rejects a wrong noun and missing Polish diacritics", () => {
    expect(isCorrectSentence("Pies śpi.", polish, "pl")).toBe(false);
    expect(isCorrectSentence("Kot spi.", polish, "pl")).toBe(false);
  });

  it("PL→EN: accepts a/the/no article; keeps other words strict", () => {
    expect(isCorrectSentence("The cat sleeps.", english, "en", "pl")).toBe(true);
    expect(isCorrectSentence("A cat sleeps.", english, "en", "pl")).toBe(true);
    expect(isCorrectSentence("Cat sleeps.", english, "en", "pl")).toBe(true);
    expect(isCorrectSentence("An cat sleeps.", english, "en", "pl")).toBe(true);
    expect(isCorrectSentence("The dog sleeps.", english, "en", "pl")).toBe(false);
    expect(isCorrectSentence("The cat eats.", english, "en", "pl")).toBe(false);
  });

  it("EN→PL: unaffected by article flexibility (Polish has no articles)", () => {
    expect(articleChoiceFlexible("en", "pl")).toBe(false);
    expect(isCorrectSentence("Kot śpi.", polish, "pl", "en")).toBe(true);
    expect(isCorrectSentence("Pies śpi.", polish, "pl", "en")).toBe(false);
  });

  it("PL→DE: accepts der/die/das/ein and bare noun; rejects wrong content", () => {
    expect(isCorrectSentence("Die Katze schläft.", german, "de", "pl")).toBe(true);
    expect(isCorrectSentence("Eine Katze schläft.", german, "de", "pl")).toBe(true);
    expect(isCorrectSentence("Der Katze schläft.", german, "de", "pl")).toBe(true);
    expect(isCorrectSentence("Katze schläft.", german, "de", "pl")).toBe(true);
    expect(isCorrectSentence("Die Hund schläft.", german, "de", "pl")).toBe(false);
  });

  it("EN→DE keeps articles strict when both languages have them", () => {
    expect(articleChoiceFlexible("en", "de")).toBe(false);
    expect(isCorrectSentence("Die Katze schläft.", german, "de", "en")).toBe(true);
    expect(isCorrectSentence("Katze schläft.", german, "de", "en")).toBe(false);
  });

  it("ZH→EN treats article choice as flexible", () => {
    expect(articleChoiceFlexible("zh", "en")).toBe(true);
    expect(isCorrectSentence("A cat sleeps", english, "en", "zh")).toBe(true);
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

  it("strips English articles for flexible compare", () => {
    expect(stripArticlesForCompare("the cat sleeps", "en")).toBe("cat sleeps");
    expect(stripArticlesForCompare("a cat sleeps", "en")).toBe("cat sleeps");
  });

  it("rejects wrong morphology and highlights the bad token", () => {
    expect(isCorrectSentence("Das Kind sieht der Hund.", german.slice(0, 0).concat(["Das Kind sieht den Hund."]), "de", "en")).toBe(false);
    const grade = gradeSentence("Kot spi.", ["Kot śpi."], "pl");
    expect(grade.correct).toBe(false);
    expect(grade.parts.some((part) => !part.ok)).toBe(true);
  });

  it("accepts Polish free word order with correct case forms", () => {
    expect(isCorrectSentence("Śpi kot.", ["Kot śpi."], "pl")).toBe(true);
  });
});
