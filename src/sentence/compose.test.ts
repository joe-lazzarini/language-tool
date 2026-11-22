import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recordAttempt, withManual, type WordStat } from "../accuracy/stats";
import { LANG_CODES, type LangCode } from "../lib/languages";
import type { Entry } from "../types";
import {
  adjFitsNoun,
  composeOne,
  composePool,
  difficultyLevel,
  enumerateBasicClauses,
  structuresForLevel,
} from "./compose";
import { gradeSentence, isCorrectSentence } from "./check";
import { buildVocabIndex, DEFAULT_NOUN_SEM, defaultGrammarTagsForNewWord } from "./vocab";
import type { GrammarFile, SentencePack, SlotWord } from "./types";
import { MIN_READY_SENTENCES } from "./generate";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const grammar = loadJson<GrammarFile>("../../public/data/sentences/grammar.json");
const packs = Object.fromEntries(
  LANG_CODES.map((code) => [code, loadJson<SentencePack>(`../../public/data/sentences/${code}.json`)]),
) as Record<LangCode, SentencePack>;

function knownStat(): WordStat {
  let stat = recordAttempt(undefined, true, 1);
  return recordAttempt(stat, true, 2);
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

function studyDeck(): Entry[] {
  return [
    entry("pl-103", "noun", { en: form("house"), pl: form("dom"), de: form("Haus"), zh: form("房子") }, "house"),
    entry("de-757", "noun", { en: form("dog"), pl: form("pies"), de: form("Hund"), zh: form("狗") }, "dog"),
    entry("de-150", "noun", { en: form("child"), pl: form("dziecko"), de: form("Kind"), zh: form("孩子") }, "child"),
    entry("de-328", "noun", { en: form("book"), pl: form("książka"), de: form("Buch"), zh: form("书") }, "book"),
    entry("de-417", "noun", { en: form("water"), pl: form("woda"), de: form("Wasser"), zh: form("水") }, "water"),
    entry("de-530", "noun", { en: form("friend"), pl: form("przyjaciel"), de: form("Freund"), zh: form("朋友") }, "friend"),
    entry("custom-cat", "noun", { en: form("cat"), pl: form("kot"), de: form("Katze", "feminine"), zh: form("猫") }, "cat"),
    entry("pl-798", "verb", { en: form("to sleep"), pl: form("spać"), de: form("schlafen"), zh: form("睡觉") }, "sleep"),
    entry("pl-334", "verb", { en: form("to read"), pl: form("czytać"), de: form("lesen"), zh: form("读") }, "read"),
    entry("de-108", "verb", { en: form("to see"), pl: form("widzieć"), de: form("sehen"), zh: form("看") }, "see"),
    entry("de-49", "adjective", { en: form("big"), pl: form("duży"), de: form("groß"), zh: form("大") }, "big"),
    entry("pl-132", "adjective", { en: form("small"), pl: form("mały"), de: form("klein"), zh: form("小") }, "small"),
  ];
}

function allKnown(ids: string[]): Map<string, WordStat> {
  return new Map(ids.map((id) => [id, knownStat()]));
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function indexFor(prompt: LangCode, answer: LangCode) {
  const deck = studyDeck();
  const stats = allKnown(deck.map((e) => e.id));
  return buildVocabIndex(deck, grammar, prompt, answer, stats, stats);
}

describe("compositional sentence generator", () => {
  it("enumerates golden EN/PL/DE/ZH basic clauses", () => {
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
      const index = indexFor("en", lang);
      const basic = enumerateBasicClauses(index, "en", lang, 0);
      const sentence = basic.find((item) => item.id === id);
      expect(sentence?.accepted[0], `${lang} ${id}`).toBe(expected);
    }
  });

  it("produces no ungrammatical PL/DE/EN outputs across many seeds", () => {
    const badPatterns: Array<[LangCode, RegExp]> = [
      ["pl", /\bdoma\b/i],
      ["pl", /\bwielkia\b/i],
      ["pl", /\bdużya\b/i],
      ["pl", /\bnie (widzi|czyta) (dom|książkę|dziecko)\b/i],
      // Avoid JS \\b pitfalls with Polish letters (ł is non-\\w).
      ["pl", /Dziecko (spał|czytał|widział)(?![a-ząćęłńóśźż])/i],
      ["de", /\bsieht der Hund\b/i], // object must be den Hund, not der Hund
      ["de", /\b(der|die|das|den) (groß|klein) [A-ZÄÖÜ]/u],
      ["en", /\bthe cat sleep\./i],
      ["en", /\ba sleeps\b/i],
      ["en", /\bdoes not (sleeps|reads|sees)\b/i],
    ];
    for (const lang of ["en", "pl", "de"] as LangCode[]) {
      const index = indexFor("en", lang);
      for (let seed = 1; seed <= 40; seed += 1) {
        const rng = mulberry(seed);
        const pool = composePool(index, "en", lang, { knownCount: 20, avgAccuracy: 0.9 }, { max: 80, rng });
        expect(pool.length).toBeGreaterThan(0);
        for (const sentence of pool) {
          expect(sentence.accepted[0]?.length).toBeGreaterThan(0);
          expect(sentence.prompt.length).toBeGreaterThan(0);
          for (const [, re] of badPatterns.filter(([code]) => code === lang)) {
            expect(sentence.accepted[0], `${lang} ${sentence.id}`).not.toMatch(re);
          }
          // German masculine accusative object in simple vt
          if (lang === "de" && sentence.structure === "vt" && sentence.wordIds[2] === "de-757") {
            expect(sentence.accepted[0]).toMatch(/den Hund/);
          }
          // Statement (not question) must not put nominative article on the object.
          if (lang === "de" && !sentence.accepted[0]!.endsWith("?") && /\bsieht der Hund\b/i.test(sentence.accepted[0]!)) {
            expect.fail(sentence.accepted[0]);
          }
        }
      }
    }
  });

  it("varies structure beyond the three legacy frames", () => {
    const index = indexFor("en", "pl");
    const pool = composePool(index, "en", "pl", { knownCount: 22, avgAccuracy: 0.95 }, { max: 100, rng: mulberry(7) });
    const structures = new Set(pool.map((s) => s.structure));
    expect(structures.has("vi")).toBe(true);
    expect(structures.has("vt")).toBe(true);
    expect(structures.has("adj")).toBe(true);
    const rich = [...structures].filter((s) => !["vi", "vt", "adj"].includes(s));
    expect(rich.length).toBeGreaterThan(0);
  });

  it("scales difficulty with known-word count and accuracy", () => {
    expect(difficultyLevel({ knownCount: 3, avgAccuracy: 0.5 })).toBe(0);
    expect(structuresForLevel(0)).toEqual(["vi", "vt", "adj"]);
    expect(difficultyLevel({ knownCount: 12, avgAccuracy: 0.5 })).toBeGreaterThanOrEqual(3);
    expect(difficultyLevel({ knownCount: 20, avgAccuracy: 0.9 })).toBeGreaterThanOrEqual(5);
    expect(structuresForLevel(5).some((s) => s.startsWith("coord") || s.startsWith("subord"))).toBe(true);
  });

  it("builds attributive, coordinated, and subordinate PL/DE sentences", () => {
    const plIndex = indexFor("en", "pl");
    const deIndex = indexFor("en", "de");
    const rng = mulberry(99);
    const attrPl = composeOne(plIndex, "en", "pl", "attr-vt", rng, 2);
    const coordDe = composeOne(deIndex, "en", "de", "coord-and", mulberry(100), 4);
    const subPl = composeOne(plIndex, "en", "pl", "subord-because", mulberry(101), 5);
    // May be null if morphology fails; with our deck they should usually succeed.
    if (attrPl) {
      expect(attrPl.accepted[0]).toMatch(/./);
      expect(attrPl.structure).toBe("attr-vt");
      // Attributive adjective somewhere in the Polish sentence
      expect(attrPl.wordIds.length).toBeGreaterThanOrEqual(3);
    }
    if (coordDe) {
      expect(coordDe.accepted[0]).toMatch(/ und /);
    }
    if (subPl) {
      expect(subPl.accepted[0]).toMatch(/ bo /);
    }
    expect(attrPl || coordDe || subPl).toBeTruthy();
  });

  it("uses genitive of negation for Polish direct objects", () => {
    const index = indexFor("en", "pl");
    const samples: string[] = [];
    for (let seed = 1; seed <= 60; seed += 1) {
      const sentence = composeOne(index, "en", "pl", "neg-vt", mulberry(seed), 3);
      if (sentence) samples.push(sentence.accepted[0]!);
    }
    expect(samples.length).toBeGreaterThan(0);
    for (const text of samples) {
      expect(text).toMatch(/\bnie\b/);
      // Accusative left after nie is wrong for these study nouns.
      expect(text).not.toMatch(/\bnie (widzi|czyta) (dom|książkę|dziecko)\b/i);
    }
    expect(samples.some((text) => /\bnie widzi domu\b/i.test(text))).toBe(true);
    expect(samples.some((text) => /\bnie czyta książki\b/i.test(text))).toBe(true);
  });

  it("aligns PP prepositions across the language pair and keeps PL locative", () => {
    const index = indexFor("en", "pl");
    const samples: Array<{ prompt: string; answer: string }> = [];
    for (let seed = 1; seed <= 80; seed += 1) {
      const sentence = composeOne(index, "en", "pl", "vt-pp", mulberry(seed), 3);
      if (sentence) samples.push({ prompt: sentence.prompt, answer: sentence.accepted[0]! });
    }
    expect(samples.length).toBeGreaterThan(0);
    for (const { prompt, answer } of samples) {
      // Shared keys only: in/on (not EN-only with/at mapped to a random PL prep).
      if (/\bwith\b/i.test(prompt) || /\bat\b/i.test(prompt)) {
        throw new Error(`unaligned prep prompt=${prompt} answer=${answer}`);
      }
      if (/\bin the house\b/i.test(prompt)) expect(answer).toMatch(/\bw domu\b/i);
      if (/\bon the house\b/i.test(prompt)) expect(answer).toMatch(/\bna domu\b/i);
    }
  });

  it("forms Polish past for widzieć after lemma repair", () => {
    const index = indexFor("en", "pl");
    const samples: string[] = [];
    for (let seed = 1; seed <= 80; seed += 1) {
      const sentence = composeOne(index, "en", "pl", "past-vt", mulberry(seed), 4);
      if (sentence?.wordIds.includes("de-108")) samples.push(sentence.accepted[0]!);
    }
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((text) => /\b(widział|widziała|widziało)\b/.test(text))).toBe(true);
    // Neuter subject past agrees.
    for (const text of samples.filter((t) => /\bDziecko\b/.test(t))) {
      expect(text).toMatch(/\bwidziało\b/);
    }
  });

  it("covers all language packs with at least basic clauses", () => {
    for (const lang of LANG_CODES) {
      const index = indexFor("en", lang);
      const basic = enumerateBasicClauses(index, "en", lang, 0);
      expect(basic.length, lang).toBeGreaterThan(0);
      void packs[lang];
    }
  });
});

describe("grammar-aware grading", () => {
  it("rejects wrong Polish case and German article/case", () => {
    expect(isCorrectSentence("Dziecko widzi kot.", ["Dziecko widzi kota."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Dziecko widzi kota.", ["Dziecko widzi kota."], "pl", "en")).toBe(true);
    expect(isCorrectSentence("Das Kind sieht der Hund.", ["Das Kind sieht den Hund."], "de", "en")).toBe(false);
    expect(isCorrectSentence("Das Kind sieht den Hund.", ["Das Kind sieht den Hund."], "de", "en")).toBe(true);
  });

  it("rejects accusative after Polish negation when genitive is required", () => {
    expect(isCorrectSentence("Kot nie widzi dom.", ["Kot nie widzi domu."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Kot nie widzi domu.", ["Kot nie widzi domu."], "pl", "en")).toBe(true);
    expect(isCorrectSentence("Dziecko nie czyta książkę.", ["Dziecko nie czyta książki."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Dziecko nie czyta książki.", ["Dziecko nie czyta książki."], "pl", "en")).toBe(true);
  });

  it("rejects wrong conjugation / agreement", () => {
    expect(isCorrectSentence("The cat sleep.", ["The cat sleeps."], "en", "pl")).toBe(false);
    expect(isCorrectSentence("Dom jest duża.", ["Dom jest duży."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Dom jest duży.", ["Dom jest duży."], "pl", "en")).toBe(true);
    expect(isCorrectSentence("Kot spała.", ["Kot spał."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Dziecko spał.", ["Dziecko spało."], "pl", "en")).toBe(false);
    expect(isCorrectSentence("Der groß Hund schläft.", ["Der große Hund schläft."], "de", "en")).toBe(false);
  });

  it("accepts free word order for Polish and Russian", () => {
    expect(isCorrectSentence("Kota widzi dziecko.", ["Dziecko widzi kota."], "pl", "en")).toBe(true);
    expect(isCorrectSentence("воду пьёт ребёнок", ["Ребёнок пьёт воду."], "ru", "en")).toBe(true);
  });

  it("accepts English contractions", () => {
    expect(isCorrectSentence("The cat doesn't sleep.", ["The cat does not sleep."], "en", "pl")).toBe(true);
  });

  it("highlights wrong endings on reveal", () => {
    const grade = gradeSentence("Dziecko widzi kot.", ["Dziecko widzi kota."], "pl", "en");
    expect(grade.correct).toBe(false);
    expect(grade.parts.some((p) => !p.ok && /kot/i.test(p.text))).toBe(true);
    expect(grade.parts.some((p) => p.ok && /dziecko/i.test(p.text))).toBe(true);
  });

  it("keeps article flexibility from article-less prompts", () => {
    expect(isCorrectSentence("A cat sleeps.", ["The cat sleeps."], "en", "pl")).toBe(true);
    expect(isCorrectSentence("Cat sleeps.", ["The cat sleeps."], "en", "zh")).toBe(true);
    expect(isCorrectSentence("Katze schläft.", ["Die Katze schläft."], "de", "en")).toBe(false);
  });
});

describe("manual known custom word", () => {
  it("still unlocks with withManual", () => {
    const deck = studyDeck();
    const stats = allKnown(deck.map((e) => e.id));
    stats.set("custom-cat", withManual(undefined, true, 1)!);
    const index = buildVocabIndex(deck, grammar, "en", "pl", stats, stats);
    const basic = enumerateBasicClauses(index, "en", "pl", 0);
    expect(basic.some((s) => s.wordIds.includes("custom-cat"))).toBe(true);
  });
});

describe("enumerateBasicClauses cap", () => {
  it("stops at max so large known decks cannot explode VT fan-out", () => {
    const deck = studyDeck();
    const stats = allKnown(deck.map((e) => e.id));
    const index = buildVocabIndex(deck, grammar, "en", "pl", stats, stats);
    const capped = enumerateBasicClauses(index, "en", "pl", 0, { max: 5, rng: mulberry(3) });
    expect(capped.length).toBeLessThanOrEqual(5);
    expect(capped.length).toBeGreaterThan(0);
    const pool = composePool(index, "en", "pl", { knownCount: 20, avgAccuracy: 0.9 }, { max: 40, rng: mulberry(3) });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThanOrEqual(40);
  });
});

describe("semantic restrictions", () => {
  it("rejects adjective–noun mismatches like tall year / tasty house", () => {
    const year: SlotWord = {
      id: "year",
      pos: "noun",
      concept: "year",
      sem: ["thing"],
      domains: ["evaluative", "temporal"],
      prompt: { lemma: "year", gender: "n" },
      answer: { lemma: "rok", gender: "m" },
    };
    const house: SlotWord = {
      id: "house",
      pos: "noun",
      concept: "house",
      sem: ["place", "thing"],
      domains: ["physical", "evaluative", "nationality"],
      prompt: { lemma: "house", gender: "n" },
      answer: { lemma: "dom", gender: "m" },
    };
    const tall: SlotWord = {
      id: "tall",
      pos: "adjective",
      concept: "tall",
      sem: [],
      domains: ["human", "physical"],
      prompt: { lemma: "tall" },
      answer: { lemma: "wysoki", m: "wysoki", f: "wysoka", n: "wysokie" },
    };
    const tasty: SlotWord = {
      id: "tasty",
      pos: "adjective",
      concept: "tasty",
      sem: [],
      domains: ["taste"],
      prompt: { lemma: "tasty" },
      answer: { lemma: "smaczny", m: "smaczny", f: "smaczna", n: "smaczne" },
    };
    const big: SlotWord = {
      id: "big",
      pos: "adjective",
      concept: "big",
      sem: [],
      domains: ["physical", "open"],
      prompt: { lemma: "big" },
      answer: { lemma: "duży", m: "duży", f: "duża", n: "duże" },
    };
    expect(adjFitsNoun(tall, year)).toBe(false);
    expect(adjFitsNoun(tasty, house)).toBe(false);
    expect(adjFitsNoun(big, house)).toBe(true);
    expect(adjFitsNoun(tall, house)).toBe(true);
  });

  it("skips vt/vi when no legal filler exists instead of violating restrictions", () => {
    // Only intransitive sleep + only place nouns → vt must fail closed.
    const tiny: Entry[] = [
      entry("pl-103", "noun", { en: form("house"), pl: form("dom") }, "house"),
      entry("pl-144", "noun", { en: form("city"), pl: form("miasto") }, "city"),
      entry("pl-798", "verb", { en: form("to sleep"), pl: form("spać") }, "sleep"),
    ];
    const stats = allKnown(tiny.map((e) => e.id));
    const index = buildVocabIndex(tiny, grammar, "en", "pl", stats, stats);
    expect(index.verbs.every((v) => v.valence === "vi")).toBe(true);
    for (let seed = 1; seed <= 40; seed += 1) {
      expect(composeOne(index, "en", "pl", "vt", mulberry(seed), 0)).toBeNull();
      expect(composeOne(index, "en", "pl", "neg-vt", mulberry(seed), 3)).toBeNull();
    }
    // vi with place-only subjects + sleep (person|animal) also fails.
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(composeOne(index, "en", "pl", "vi", mulberry(seed), 0)).toBeNull();
    }
  });

  it("keeps unlisted nouns on conservative thing-only defaults", () => {
    const custom = entry("custom-gadget", "noun", { en: form("gadget"), pl: form("gadżet") });
    const stats = allKnown(["custom-gadget"]);
    const index = buildVocabIndex([custom], grammar, "en", "pl", stats, stats);
    const slot = index.byId.get("custom-gadget");
    expect(slot?.sem).toEqual(DEFAULT_NOUN_SEM);
    expect(defaultGrammarTagsForNewWord("noun").sem).toEqual(["thing"]);
    expect(defaultGrammarTagsForNewWord("noun", { placeName: true }).sem).toEqual(["place", "thing"]);
  });

  it("does not attach determiner-like adjectives such as all", () => {
    const deck = [
      entry("pl-103", "noun", { en: form("house"), pl: form("dom") }, "house"),
      entry("pl-79", "adjective", { en: form("all"), pl: form("wszystek") }, "all"),
      entry("de-49", "adjective", { en: form("big"), pl: form("duży") }, "big"),
      entry("pl-798", "verb", { en: form("to sleep"), pl: form("spać") }, "sleep"),
    ];
    const stats = allKnown(deck.map((e) => e.id));
    const index = buildVocabIndex(deck, grammar, "en", "pl", stats, stats);
    for (let seed = 1; seed <= 40; seed += 1) {
      const adj = composeOne(index, "en", "pl", "adj", mulberry(seed), 0);
      if (adj) expect(adj.wordIds).not.toContain("pl-79");
      const attr = composeOne(index, "en", "pl", "attr-vi", mulberry(seed + 50), 1);
      if (attr) expect(attr.wordIds).not.toContain("pl-79");
    }
    const basic = enumerateBasicClauses(index, "en", "pl", 0);
    expect(basic.some((s) => s.wordIds.includes("pl-79"))).toBe(false);
    expect(basic.some((s) => /all house/i.test(s.prompt))).toBe(false);
  });
});

describe("realistic First 100/250 pools", () => {
  const catalogPath = resolve("public/data/catalog.json");
  const enPath = resolve("public/data/langs/en.json");
  const plPath = resolve("public/data/langs/pl.json");
  const hasDeck = existsSync(catalogPath) && existsSync(enPath) && existsSync(plPath);

  function loadBand(maxRank: number): Entry[] {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      entries: Array<{ id: string; pos: string; ranks?: { pl?: number }; concept?: string }>;
    };
    const en = JSON.parse(readFileSync(enPath, "utf8")) as Record<string, ReturnType<typeof form>>;
    const pl = JSON.parse(readFileSync(plPath, "utf8")) as Record<string, ReturnType<typeof form>>;
    const out: Entry[] = [];
    for (const item of catalog.entries) {
      const pos = item.pos.toLowerCase();
      if (!["noun", "verb", "adjective", "proper noun"].includes(pos)) continue;
      const rank = item.ranks?.pl;
      if (rank == null || rank > maxRank) continue;
      if (!en[item.id] || !pl[item.id]) continue;
      out.push({
        id: item.id,
        pos: item.pos,
        ranks: item.ranks ?? {},
        forms: { en: en[item.id]!, pl: pl[item.id]! },
        concept: item.concept,
      });
    }
    return out;
  }

  function sentenceViolates(sentence: { wordIds: string[]; structure: string; prompt: string }, index: ReturnType<typeof buildVocabIndex>): string | null {
    const subject = index.byId.get(sentence.wordIds[0]!);
    const verb = sentence.wordIds.map((id) => index.byId.get(id)).find((w) => w?.pos === "verb");
    const adj = sentence.wordIds.map((id) => index.byId.get(id)).find((w) => w?.pos === "adjective");
    if (verb && subject) {
      if (verb.subject?.length && !subject.sem.some((s) => verb.subject!.includes(s))) {
        return `bad subject ${subject.concept} for ${verb.concept}`;
      }
      if ((verb.valence === "vt" || verb.object) && sentence.wordIds[2]) {
        const object = index.byId.get(sentence.wordIds[2]!);
        if (object && verb.object?.length && !object.sem.some((s) => verb.object!.includes(s))) {
          return `bad object ${object.concept} for ${verb.concept}`;
        }
      }
      // vi must not appear as a transitive frame with a filled object id from a vi verb
      if (sentence.structure.includes("vt") && verb.valence !== "vt" && !verb.object) {
        return `vi used as vt ${verb.concept}`;
      }
    }
    if (adj && subject && !adjFitsNoun(adj, subject)) {
      return `bad adj ${adj.concept} on ${subject.concept}`;
    }
    // Surface nonsense catch-alls that should stay gone.
    if (/does not i\b/i.test(sentence.prompt)) return "does not i";
    if (/\bgoe\b/i.test(sentence.prompt)) return "goe";
    if (/\bpowiedzie\b/i.test(sentence.prompt)) return "powiedzie";
    if (/będzie powiedzieć/i.test(sentence.prompt)) return "będzie powiedzieć";
    if (/geerreicht/i.test(sentence.prompt)) return "geerreicht";
    return null;
  }

  (hasDeck ? it : it.skip)("First 100/250: no restriction violations and pool still unlocks", () => {
    for (const n of [100, 250] as const) {
      const deck = loadBand(n);
      const stats = allKnown(deck.map((e) => e.id));
      const index = buildVocabIndex(deck, grammar, "en", "pl", stats, stats);
      const pool = composePool(
        index,
        "en",
        "pl",
        { knownCount: index.nouns.length + index.verbs.length + index.adjectives.length, avgAccuracy: 0.9 },
        { max: 120, rng: mulberry(42) },
      );
      expect(pool.length, `First ${n} unlock`).toBeGreaterThanOrEqual(MIN_READY_SENTENCES);
      for (const sentence of pool) {
        expect(sentenceViolates(sentence, index), `${n}: ${sentence.prompt}`).toBeNull();
      }
      // Sample richer structures across seeds.
      for (let seed = 1; seed <= 60; seed += 1) {
        for (const structure of ["vi", "vt", "adj", "attr-vt", "neg-vt"] as const) {
          const sentence = composeOne(index, "en", "pl", structure, mulberry(seed + n), 3);
          if (!sentence) continue;
          expect(sentenceViolates(sentence, index), `${n} ${structure}: ${sentence.prompt}`).toBeNull();
        }
      }
    }
  });
});
