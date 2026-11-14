import { describe, expect, it } from "vitest";
import {
  applyAdvanceKey,
  releaseAdvanceKey,
  type AdvanceKeyHold,
  type AdvanceKeyInput,
} from "./advanceKey";

function press(
  held: Map<string, AdvanceKeyHold>,
  input: Partial<Omit<AdvanceKeyInput, "held">> & { key: string },
) {
  return applyAdvanceKey(held, {
    repeat: false,
    revealed: false,
    composing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    typingTarget: false,
    activationTarget: false,
    ...input,
  });
}

describe("advance key", () => {
  it("ignores unrelated keys and modified shortcuts", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: "n", revealed: true })).toEqual({ preventDefault: false, advance: false });
    expect(press(held, { key: "Enter", revealed: true, ctrlKey: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: " ", revealed: true, metaKey: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(held.size).toBe(0);
  });

  it("lets Space type in the answer field, including key repeat, before the answer is shown", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: " ", typingTarget: true })).toEqual({ preventDefault: false, advance: false });
    expect(press(held, { key: " ", typingTarget: true, repeat: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    releaseAdvanceKey(held, " ");
    expect(press(held, { key: " ", typingTarget: true })).toEqual({ preventDefault: false, advance: false });
  });

  it("does not let the Enter that submits a typed answer skip the result", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: "Enter", typingTarget: true })).toEqual({ preventDefault: false, advance: false });

    expect(press(held, { key: "Enter", typingTarget: true, revealed: true, repeat: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: "Enter", revealed: true })).toEqual({ preventDefault: false, advance: false });

    releaseAdvanceKey(held, "Enter");
    expect(press(held, { key: "Enter", revealed: true })).toEqual({ preventDefault: true, advance: true });
    expect(press(held, { key: "Enter", revealed: false, typingTarget: true, repeat: true })).toEqual({
      preventDefault: true,
      advance: false,
    });
  });

  it("advances on Space only once the answer is shown, and cancels the repeating Space", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: " ", revealed: true })).toEqual({ preventDefault: true, advance: true });
    expect(press(held, { key: " ", revealed: false, typingTarget: true, repeat: true })).toEqual({
      preventDefault: true,
      advance: false,
    });
    releaseAdvanceKey(held, "Spacebar");
    expect(press(held, { key: " ", revealed: false, typingTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
  });

  it("does not advance when Enter or Space activates a button", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: "Enter", revealed: true, activationTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: "Enter", revealed: true, activationTarget: true, repeat: true })).toEqual({
      preventDefault: true,
      advance: false,
    });
    releaseAdvanceKey(held, "Enter");
    expect(press(held, { key: " ", revealed: true, activationTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
  });

  it("does not take Enter or Space from another text field", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: " ", revealed: true, typingTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: " ", revealed: true, typingTarget: true, repeat: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: "Enter", revealed: true, typingTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(held.size).toBe(0);
  });

  it("remembers a composing Enter without cancelling the IME commit", () => {
    const held = new Map<string, AdvanceKeyHold>();
    expect(press(held, { key: "Enter", composing: true, typingTarget: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
    expect(press(held, { key: "Enter", composing: true, revealed: true })).toEqual({
      preventDefault: false,
      advance: false,
    });
  });
});
