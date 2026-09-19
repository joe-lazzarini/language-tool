import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer } from "./match";

describe("normalizeAnswer", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeAnswer("  to   be  ")).toBe("to be");
  });

  it("is case-insensitive for Polish", () => {
    expect(normalizeAnswer("BYĆ")).toBe("być");
    expect(normalizeAnswer("Łódź")).toBe("łódź");
  });
});

describe("isCorrectAnswer", () => {
  it("accepts the lemma ignoring case and spaces", () => {
    expect(isCorrectAnswer("  Być ", "być")).toBe(true);
    expect(isCorrectAnswer("byc", "być")).toBe(false);
  });

  it("accepts any listed English gloss", () => {
    expect(isCorrectAnswer("can", "to be able to, can", ["can", "be able"])).toBe(true);
    expect(isCorrectAnswer("to be able", "to be able to, can", ["can", "to be able"])).toBe(true);
    expect(isCorrectAnswer("able", "to be able to, can", ["can", "be able"])).toBe(false);
  });

  it("treats a leading to as optional on expected verbs", () => {
    expect(isCorrectAnswer("want", "to want")).toBe(true);
    expect(isCorrectAnswer("to want", "to want")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isCorrectAnswer("   ", "być")).toBe(false);
  });
});
