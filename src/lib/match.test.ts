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

  it("accepts any structured answer object, case-insensitive and trimmed", () => {
    const accepted = [
      { text: "ten", context: "masculine" },
      { text: "ta", context: "feminine" },
      { text: "to", context: "neuter" },
    ];
    expect(isCorrectAnswer("  TA ", "ten / ta / to", accepted)).toBe(true);
    expect(isCorrectAnswer("Ten", "ten / ta / to", accepted)).toBe(true);
    expect(isCorrectAnswer("to", "ten / ta / to", accepted)).toBe(true);
    expect(isCorrectAnswer("tamten", "ten / ta / to", accepted)).toBe(false);
  });

  it("treats a leading to as optional on expected verbs", () => {
    expect(isCorrectAnswer("want", "to want")).toBe(true);
    expect(isCorrectAnswer("to want", "to want")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isCorrectAnswer("   ", "być")).toBe(false);
  });

  it("is case-insensitive for German and requires ß / umlauts", () => {
    expect(isCorrectAnswer("  Straße ", "Straße")).toBe(true);
    expect(isCorrectAnswer("STRASSE", "Straße")).toBe(false);
    expect(isCorrectAnswer("Konnen", "können")).toBe(false);
    expect(isCorrectAnswer("KÖNNEN", "können")).toBe(true);
    expect(isCorrectAnswer("uber", "über")).toBe(false);
    expect(isCorrectAnswer("über", "über")).toBe(true);
  });

  it("matches any listed German or Polish lemma for a pair", () => {
    expect(isCorrectAnswer("sein", "sein", ["sein"])).toBe(true);
    expect(isCorrectAnswer("Być", "być", ["być"])).toBe(true);
    expect(isCorrectAnswer("to be", "to be", ["be", "exist"])).toBe(true);
    expect(isCorrectAnswer("be", "to be", ["be", "exist"])).toBe(true);
  });

  it("accepts der, die, or das for the German article", () => {
    const accepted = [
      { text: "der", context: "masculine" },
      { text: "die", context: "feminine / plural" },
      { text: "das", context: "neuter" },
    ];
    expect(isCorrectAnswer("die", "der / die / das", accepted)).toBe(true);
    expect(isCorrectAnswer("Das", "der / die / das", accepted)).toBe(true);
    expect(isCorrectAnswer("den", "der / die / das", accepted)).toBe(false);
  });
});
