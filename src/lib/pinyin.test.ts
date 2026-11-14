import { describe, expect, it } from "vitest";
import { foldPinyin, looksLikePinyin } from "./pinyin";

describe("foldPinyin", () => {
  it("strips tone marks and spaces", () => {
    expect(foldPinyin("nǐ hǎo")).toBe("nihao");
    expect(foldPinyin("Nǐ Hǎo")).toBe("nihao");
  });

  it("strips tone numbers", () => {
    expect(foldPinyin("ni3 hao3")).toBe("nihao");
    expect(foldPinyin("ni3hao3")).toBe("nihao");
  });

  it("treats ü and v as the same", () => {
    expect(foldPinyin("nǚ")).toBe(foldPinyin("nv"));
    expect(foldPinyin("lü4")).toBe(foldPinyin("lv"));
  });

  it("leaves Hanzi intact aside from spaces and slot ellipses", () => {
    expect(foldPinyin("你好")).toBe("你好");
    expect(foldPinyin("你 好")).toBe("你好");
    expect(foldPinyin("在……期间")).toBe("在期间");
    expect(foldPinyin("除了...以外")).toBe("除了以外");
  });
});

describe("looksLikePinyin", () => {
  it("detects Latin pinyin and rejects Hanzi", () => {
    expect(looksLikePinyin("ni3 hao3")).toBe(true);
    expect(looksLikePinyin("nǐhǎo")).toBe(true);
    expect(looksLikePinyin("你好")).toBe(false);
    expect(looksLikePinyin("")).toBe(false);
  });
});
