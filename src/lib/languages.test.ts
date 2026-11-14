import { describe, expect, it } from "vitest";
import {
  canonicalPair,
  isLangCode,
  LANG_CODES,
  languageByCode,
  languageOptionLabel,
  LANGUAGES,
  otherLanguage,
  pairLabel,
} from "./languages";

describe("language pickers", () => {
  it("lists Mandarin Chinese as a supported language", () => {
    expect(isLangCode("zh")).toBe(true);
    expect(LANG_CODES).toContain("zh");
    const zh = languageByCode("zh");
    expect(zh.name).toBe("Chinese");
    expect(zh.nativeName).toBe("中文");
    expect(zh.wiktionary).toBe("Chinese");
    expect(zh.wiktionaryAliases).toContain("Mandarin");
    expect(languageOptionLabel(zh)).toContain("中文");
    expect(languageOptionLabel(zh)).toContain("Chinese");
  });

  it("pairs Mandarin with every other language", () => {
    for (const code of LANG_CODES) {
      if (code === "zh") continue;
      expect(canonicalPair("zh", code)).toEqual(code < "zh" ? [code, "zh"] : ["zh", code]);
      expect(pairLabel("en", "zh")).toBe("English → Chinese");
      expect(pairLabel("zh", code)).toContain("Chinese");
    }
    expect(otherLanguage("zh")).not.toBe("zh");
    expect(LANGUAGES.filter((item) => item.pivot)).toHaveLength(1);
  });
});
