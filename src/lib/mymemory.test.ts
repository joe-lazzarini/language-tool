import { describe, expect, it } from "vitest";
import { pickMemoryTranslations } from "./mymemory";

describe("pickMemoryTranslations", () => {
  it("keeps short dictionary-like hits and drops quota warnings and sentences", () => {
    const picked = pickMemoryTranslations(
      {
        responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS" },
        matches: [
          { translation: "kot", match: 1 },
          { translation: "To jest bardzo długie zdanie o kocie.", match: 0.4 },
          { translation: "cat", match: 0.99 },
          { translation: "kot", match: 0.8 },
          { translation: "KRKA", match: 0.9 },
        ],
      },
      "cat",
    );
    expect(picked.map((item) => item.text)).toEqual(["kot"]);
  });
});
