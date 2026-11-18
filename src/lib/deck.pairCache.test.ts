import { describe, expect, it } from "vitest";
import { entriesForPair } from "./deck";
import type { Entry } from "../types";

const sample: Entry[] = [
  {
    id: "pl-1",
    pos: "noun",
    ranks: { pl: 1, en: 1 },
    forms: {
      en: { text: "cat", accepted: [{ text: "cat" }] },
      pl: { text: "kot", accepted: [{ text: "kot" }] },
    },
  },
  {
    id: "pl-2",
    pos: "verb",
    ranks: { pl: 2, en: 2 },
    forms: {
      en: { text: "go", accepted: [{ text: "go" }] },
      pl: { text: "iść", accepted: [{ text: "iść" }] },
    },
  },
];

describe("entriesForPair cache", () => {
  it("reuses the same array for a repeated direction on the same source list", () => {
    const a = entriesForPair(sample, "en", "pl");
    const b = entriesForPair(sample, "en", "pl");
    expect(b).toBe(a);
  });

  it("caches both swap directions independently", () => {
    const forward = entriesForPair(sample, "en", "pl");
    const reverse = entriesForPair(sample, "pl", "en");
    expect(reverse).not.toBe(forward);
    expect(entriesForPair(sample, "pl", "en")).toBe(reverse);
    expect(entriesForPair(sample, "en", "pl")).toBe(forward);
  });
});
