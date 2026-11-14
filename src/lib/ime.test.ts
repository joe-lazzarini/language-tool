import { describe, expect, it } from "vitest";
import { isComposingKeyEvent, shouldBlockGradeOrAdvance } from "./ime";

describe("IME composition guard", () => {
  it("treats isComposing and keyCode 229 as composing", () => {
    expect(isComposingKeyEvent({ isComposing: true })).toBe(true);
    expect(isComposingKeyEvent({ keyCode: 229 })).toBe(true);
    expect(isComposingKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isComposingKeyEvent({ nativeEvent: { isComposing: true } })).toBe(true);
    expect(isComposingKeyEvent({ nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("blocks grade and advance while composing", () => {
    expect(shouldBlockGradeOrAdvance(true)).toBe(true);
    expect(shouldBlockGradeOrAdvance(false)).toBe(false);
  });
});
