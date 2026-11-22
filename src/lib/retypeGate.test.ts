import { describe, expect, it } from "vitest";
import { canAdvanceAfterReveal, mustConfirmRetype } from "./retypeGate";

describe("retypeGate", () => {
  it("requires a confirm step after any miss until the retype matches", () => {
    expect(mustConfirmRetype(true, false, false)).toBe(true);
    expect(mustConfirmRetype(true, null, false)).toBe(true);
    expect(mustConfirmRetype(true, false, true)).toBe(false);
    expect(mustConfirmRetype(true, true, false)).toBe(false);
    expect(mustConfirmRetype(false, false, false)).toBe(false);
  });

  it("allows advance only after a correct first try or a confirmed retype", () => {
    expect(canAdvanceAfterReveal(true, true, false)).toBe(true);
    expect(canAdvanceAfterReveal(true, false, true)).toBe(true);
    expect(canAdvanceAfterReveal(true, null, true)).toBe(true);
    expect(canAdvanceAfterReveal(true, false, false)).toBe(false);
    expect(canAdvanceAfterReveal(true, null, false)).toBe(false);
    expect(canAdvanceAfterReveal(false, true, false)).toBe(false);
  });
});
