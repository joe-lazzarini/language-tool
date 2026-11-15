import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordAttempt, withManual, type WordStat } from "../accuracy/stats";
import { LANG_CODES, type LangCode } from "../lib/languages";
import type { Entry } from "../types";
import { generateSentences, MIN_READY_SENTENCES, sampleSentences, unlockHint } from "./generate";
import { buildVocabIndex } from "./vocab";
import type { GrammarFile, SentencePack } from "./types";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const grammar = loadJson<GrammarFile>("../../public/data/sentences/grammar.json");
const packs = Object.fromEntries(
  LANG_CODES.map((code) => [code, loadJson<SentencePack>(`../../public/data/sentences/${code}.json`)]),
) as Record<LangCode, SentencePack>;

function knownStat(manual = false): WordStat {
  if (manual) return withManual(undefined, true, 1)!;
  let stat = recordAttempt(undefined, true, 1);
  return recordAttempt(stat, true, 2);
}

function weakStat(): WordStat {
  // Known requires two newest corrects; this has history but accuracy < 60%.
  let stat = recordAttempt(undefined, false, 1);
  stat = recordAttempt(stat, false, 2);
  return recordAttempt(stat, true, 3);
}

function form(text: string, context?: string) {
  return { text, accepted: [{ text, ...(context ? { context } : {}) }] };
}

function entry(
  id: string,
  pos: string,
  forms: Partial<Record<LangCode, ReturnType<typeof form>>>,
  concept?: string,
): Entry {
  return { id, pos, ranks: {}, forms, concept };
}

/** Curated study cards mirroring former lexicon lemmas, keyed by deck ids. */
function studyDeck(): Entry[] {
  return [
    entry("pl-103", "noun", {
      en: form("house"),
      pl: form("dom"),
      de: form("Haus"),
      zh: form("房子"),
    }, "house"),
    entry("de-757", "noun", {
      en: form("dog"),
      pl: form("pies"),
      de: form("Hund"),
      zh: form("狗"),
    }, "dog"),
    entry("de-150", "noun", {
      en: form("child"),
      pl: form("dziecko"),
      de: form("Kind"),
      zh: form("孩子"),
    }, "child"),
    entry("de-328", "noun", {
      en: form("book"),
      pl: form("książka"),
      de: form("Buch"),
      zh: form("书"),
    }, "book"),
    entry("de-417", "noun", {
      en: form("water"),
      pl: form("woda"),
      de: form("Wasser"),
      zh: form("水"),
    }, "water"),
    entry("de-530", "noun", {
      en: form("friend"),
      pl: form("przyjaciel"),
      de: form("Freund"),
      zh: form("朋友"),
    }, "friend"),
    entry("custom-cat", "noun", {
      en: form("cat"),
      pl: form("kot"),
      de: form("Katze", "feminine"),
      zh: form("猫"),
    }, "cat"),
    entry("pl-798", "verb", {
      en: form("to sleep"),
      pl: form("spać"),
      de: form("schlafen"),
      zh: form("睡觉"),
    }, "sleep"),
    entry("pl-334", "verb", {
      en: form("to read"),
      pl: form("czytać"),
      de: form("lesen"),
      zh: form("读"),
    }, "read"),
    entry("de-108", "verb", {
      en: form("to see"),
      pl: form("widzieć"),
      de: form("sehen"),
      zh: form("看"),
    }, "see"),
    entry("de-49", "adjective", {
      en: form("big"),
      pl: form("duży"),
      de: form("groß"),
      zh: form("大"),
    }, "big"),
    entry("pl-132", "adjective", {
      en: form("small"),
      pl: form("mały"),
      de: form("klein"),
      zh: form("小"),
    }, "small"),
  ];
}

function allKnownStats(ids: string[]): Map<string, WordStat> {
  return new Map(ids.map((id) => [id, knownStat()]));
}

function generate(prompt: LangCode, answer: LangCode, entries: Entry[], stats: Map<string, WordStat>) {
  const index = buildVocabIndex(entries, grammar, prompt, answer, stats, stats);
  return generateSentences(index, prompt, packs[prompt], answer, packs[answer]);
}

describe("dynamic sentence generation", () => {
  it("has no preset lexicon index file", () => {
    expect(existsSync(new URL("../../public/data/sentences/index.json", import.meta.url))).toBe(false);
    for (const code of LANG_CODES) {
      const pack = packs[code];
      expect(pack.frames.vi).toBeTruthy();
      expect(pack.frames.vt).toBeTruthy();
      expect(pack.frames.adj).toBeTruthy();
      expect((pack as { nouns?: unknown }).nouns).toBeUndefined();
    }
  });

  it("builds sentences only from known non-weak study words", () => {
    const deck = studyDeck();
    const ids = deck.map((item) => item.id);
    const stats = allKnownStats(ids);
    const sentences = generate("en", "pl", deck, stats);
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      for (const id of sentence.wordIds) {
        expect(ids).toContain(id);
      }
    }

    const withoutSleep = new Map(stats);
    withoutSleep.delete("pl-798");
    const hidden = generate("en", "pl", deck, withoutSleep);
    expect(hidden.some((item) => item.wordIds.includes("pl-798"))).toBe(false);

    const weakSleep = new Map(stats);
    weakSleep.set("pl-798", weakStat());
    const weakHidden = generate("en", "pl", deck, weakSleep);
    expect(weakHidden.some((item) => item.wordIds.includes("pl-798"))).toBe(false);
  });

  it("includes a newly known custom word in generated sentences", () => {
    const deck = studyDeck();
    const ids = deck.map((item) => item.id);
    const stats = allKnownStats(ids);
    const sentences = generate("en", "pl", deck, stats);
    expect(sentences.some((item) => item.wordIds.includes("custom-cat"))).toBe(true);
    expect(sentences.some((item) => item.id.includes("custom-cat") && item.id.includes("pl-798"))).toBe(true);
  });

  it("varies rounds and avoids immediate repeats when possible", () => {
    const deck = studyDeck();
    const stats = allKnownStats(deck.map((item) => item.id));
    const all = generate("en", "pl", deck, stats);
    expect(all.length).toBeGreaterThanOrEqual(MIN_READY_SENTENCES);
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const first = sampleSentences(all, 8, rng);
    const second = sampleSentences(all, 8, rng, new Set(first.map((item) => item.id)));
    expect(first.map((item) => item.id).join("|")).not.toEqual(second.map((item) => item.id).join("|"));
  });

  it("unlocks at four distinct sentences and explains missing words", () => {
    const house = entry("pl-103", "noun", { en: form("house"), pl: form("dom") }, "house");
    const big = entry("de-49", "adjective", { en: form("big"), pl: form("duży") }, "big");
    const sleep = entry("pl-798", "verb", { en: form("to sleep"), pl: form("spać") }, "sleep");
    const dog = entry("de-757", "noun", { en: form("dog"), pl: form("pies") }, "dog");
    const few = [house, big];
    const fewStats = allKnownStats(["pl-103", "de-49"]);
    const fewIndex = buildVocabIndex(few, grammar, "en", "pl", fewStats, fewStats);
    const fewSentences = generateSentences(fewIndex, "en", packs.en, "pl", packs.pl);
    expect(fewSentences.length).toBeLessThan(MIN_READY_SENTENCES);
    expect(unlockHint(fewSentences.length, fewIndex).length).toBeGreaterThan(0);

    const child = entry("de-150", "noun", { en: form("child"), pl: form("dziecko") }, "child");
    const enough = [house, big, sleep, dog, child];
    const enoughStats = allKnownStats(enough.map((item) => item.id));
    const ready = generate("en", "pl", enough, enoughStats);
    expect(ready.length).toBeGreaterThanOrEqual(MIN_READY_SENTENCES);
  });

  it("renders golden EN/PL/DE/ZH sentences from study ids", () => {
    const deck = studyDeck();
    const stats = allKnownStats(deck.map((item) => item.id));
    const cases: Array<[LangCode, string, string]> = [
      ["en", "vi:custom-cat:pl-798", "The cat sleeps."],
      ["pl", "vi:custom-cat:pl-798", "Kot śpi."],
      ["de", "vi:custom-cat:pl-798", "Die Katze schläft."],
      ["zh", "vi:custom-cat:pl-798", "猫睡觉。"],
      ["en", "adj:pl-103:de-49", "The house is big."],
      ["pl", "adj:pl-103:de-49", "Dom jest duży."],
      ["zh", "adj:pl-103:de-49", "房子很大。"],
      ["en", "vt:de-150:pl-334:de-328", "The child reads the book."],
      ["zh", "vt:de-150:pl-334:de-328", "孩子读书。"],
      ["pl", "vt:de-150:de-108:custom-cat", "Dziecko widzi kota."],
      ["pl", "vt:de-150:de-108:de-530", "Dziecko widzi przyjaciela."],
      ["de", "vt:de-150:de-108:de-757", "Das Kind sieht den Hund."],
      ["pl", "adj:de-417:pl-132", "Woda jest mała."],
    ];
    for (const [lang, id, expected] of cases) {
      const sentence = generate("en", lang, deck, stats).find((item) => item.id === id);
      expect(sentence?.accepted[0], `${lang} ${id}`).toBe(expected);
    }
  });

  it("covers Mandarin frames without articles or inflection", () => {
    const deck = studyDeck();
    const stats = allKnownStats(deck.map((item) => item.id));
    const sentences = generate("zh", "en", deck, stats);
    expect(sentences.length).toBeGreaterThan(0);
    const sleep = sentences.find((item) => item.id === "vi:custom-cat:pl-798");
    expect(sleep?.prompt).toBe("猫睡觉。");
    expect(sleep?.accepted[0]).toBe("The cat sleeps.");
  });

  it("does not use words outside the study list even if grammar has them", () => {
    const onlyHouse = [
      entry("pl-103", "noun", { en: form("house"), pl: form("dom") }, "house"),
      entry("de-49", "adjective", { en: form("big"), pl: form("duży") }, "big"),
    ];
    const stats = allKnownStats(["pl-103", "de-49", "pl-798", "de-757"]);
    const sentences = generate("en", "pl", onlyHouse, stats);
    expect(sentences.every((item) => item.wordIds.every((id) => id === "pl-103" || id === "de-49"))).toBe(true);
    expect(sentences.some((item) => item.wordIds.includes("pl-798"))).toBe(false);
  });
});
