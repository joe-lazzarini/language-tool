import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knownIdSet, recordAttempt, withManual, type WordStat } from "../accuracy/stats";
import { LANG_CODES, type LangCode } from "../lib/languages";
import { generateSentences, lexiconKnownCount } from "./generate";
import { sentenceRows } from "./rows";
import type { Lexicon, SentencePack } from "./types";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const lexicon = loadJson<Lexicon>("../../public/data/sentences/index.json");
const packs = Object.fromEntries(
  LANG_CODES.map((code) => [code, loadJson<SentencePack>(`../../public/data/sentences/${code}.json`)]),
) as Record<LangCode, SentencePack>;

const everyId = new Set<string>([
  ...lexicon.nouns.map((item) => item.id),
  ...lexicon.verbs.map((item) => item.id),
  ...lexicon.adjectives.map((item) => item.id),
]);

function allKnown(prompt: LangCode, answer: LangCode) {
  return generateSentences(lexicon, prompt, packs[prompt], answer, packs[answer], everyId, everyId);
}

function accepted(prompt: LangCode, answer: LangCode, id: string): string {
  const sentence = allKnown(prompt, answer).find((item) => item.id === id);
  expect(sentence, id).toBeTruthy();
  return sentence!.accepted[0]!;
}

const goldens: Record<string, Record<LangCode, string>> = {
  "vi:cat:sleep": {
    en: "The cat sleeps.",
    pl: "Kot śpi.",
    de: "Die Katze schläft.",
    es: "El gato duerme.",
    fr: "Le chat dort.",
    it: "Il gatto dorme.",
    pt: "O gato dorme.",
    nl: "De kat slaapt.",
    ru: "Кошка спит.",
    ja: "猫は寝ます。",
  },
  "vt:child:read:book": {
    en: "The child reads the book.",
    pl: "Dziecko czyta książkę.",
    de: "Das Kind liest das Buch.",
    es: "El niño lee el libro.",
    fr: "L'enfant lit le livre.",
    it: "Il bambino legge il libro.",
    pt: "A criança lê o livro.",
    nl: "Het kind leest het boek.",
    ru: "Ребёнок читает книгу.",
    ja: "子供は本を読みます。",
  },
  "adj:house:big": {
    en: "The house is big.",
    pl: "Dom jest duży.",
    de: "Das Haus ist groß.",
    es: "La casa es grande.",
    fr: "La maison est grande.",
    it: "La casa è grande.",
    pt: "A casa é grande.",
    nl: "Het huis is groot.",
    ru: "Дом большой.",
    ja: "家は大きいです。",
  },
  "adj:water:small": {
    en: "The water is small.",
    pl: "Woda jest mała.",
    de: "Das Wasser ist klein.",
    es: "El agua es pequeña.",
    fr: "L'eau est petite.",
    it: "L'acqua è piccola.",
    pt: "A água é pequena.",
    nl: "Het water is klein.",
    ru: "Вода маленькая.",
    ja: "水は小さいです。",
  },
  "vt:dog:see:friend": {
    en: "The dog sees the friend.",
    pl: "Pies widzi przyjaciela.",
    de: "Der Hund sieht den Freund.",
    es: "El perro ve al amigo.",
    fr: "Le chien voit l'ami.",
    it: "Il cane vede l'amico.",
    pt: "O cão vê o amigo.",
    nl: "De hond ziet de vriend.",
    ru: "Собака видит друга.",
    ja: "犬は友達を見ます。",
  },
};

describe("sentence templates", () => {
  it("gives every lexicon word a complete form in every language", () => {
    for (const code of LANG_CODES) {
      const pack = packs[code];
      for (const noun of lexicon.nouns) {
        expect(pack.nouns[noun.id]?.npNom, `${code} ${noun.id}`).toBeTruthy();
        expect(pack.nouns[noun.id]?.npAcc).toBeTruthy();
        expect(["m", "f", "n"]).toContain(pack.nouns[noun.id]?.gender);
      }
      for (const verb of lexicon.verbs) expect(pack.verbs[verb.id]?.form, `${code} ${verb.id}`).toBeTruthy();
      for (const adj of lexicon.adjectives) {
        expect(pack.adjectives[adj.id]?.m, `${code} ${adj.id}`).toBeTruthy();
        expect(pack.adjectives[adj.id]?.f).toBeTruthy();
        expect(pack.adjectives[adj.id]?.n).toBeTruthy();
      }
    }
  });

  it("renders the same number of grammatical sentences in every language", () => {
    const counts = LANG_CODES.map((code) => allKnown(code, code).length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThan(20);
    for (const code of LANG_CODES) {
      for (const sentence of allKnown(code, code)) {
        expect(sentence.prompt.includes("{")).toBe(false);
        expect(sentence.accepted[0]?.includes("{")).toBe(false);
        expect(sentence.prompt.endsWith(code === "ja" ? "。" : ".")).toBe(true);
      }
    }
  });

  it("matches the golden sentences for agreement, case, and articles", () => {
    for (const [id, byLang] of Object.entries(goldens)) {
      for (const code of LANG_CODES) {
        expect(accepted("en", code, id), `${code} ${id}`).toBe(byLang[code]);
      }
      expect(allKnown("pl", "en").find((item) => item.id === id)?.prompt).toBe(byLang.pl);
    }
  });

  it("accepts the Japanese plain form and keeps content words inside the restrictions", () => {
    const sleep = allKnown("en", "ja").find((item) => item.id === "vi:cat:sleep");
    expect(sleep?.accepted).toContain("猫は寝る。");
    const house = allKnown("en", "ja").find((item) => item.id === "adj:house:big");
    expect(house?.accepted).toContain("家は大きい。");
    const sentences = allKnown("en", "pl");
    expect(sentences.some((item) => item.wordIds.includes("cat") && item.wordIds.includes("work"))).toBe(false);
    expect(sentences.some((item) => item.frame === "vt" && item.wordIds[0] === item.wordIds[2])).toBe(false);
    expect(sentences.filter((item) => item.wordIds.includes("read")).every((item) => item.wordIds.includes("book"))).toBe(true);
  });

  it("drops a sentence when a content word is not known, including via a deck id", () => {
    const withoutCat = new Set(everyId);
    withoutCat.delete("cat");
    const hidden = generateSentences(lexicon, "en", packs.en, "pl", packs.pl, withoutCat, withoutCat);
    expect(hidden.some((item) => item.wordIds.includes("cat"))).toBe(false);

    const deckOnly = new Set(["pl-103", "pl-67"]);
    const house = generateSentences(lexicon, "en", packs.en, "pl", packs.pl, deckOnly, deckOnly);
    expect(house.map((item) => item.id)).toEqual(["adj:house:big"]);
    expect(lexiconKnownCount(lexicon, deckOnly)).toBe(2);
  });

  it("treats two correct quiz answers as knowing the deck id", () => {
    let stat = recordAttempt(undefined, true, 1);
    stat = recordAttempt(stat, true, 2);
    const stats = new Map<string, WordStat>([["pl-103", stat]]);
    const known = knownIdSet(stats);
    const rows = sentenceRows(lexicon, packs.en, packs.pl, new Map(), stats);
    expect(rows.find((row) => row.id === "house")).toMatchObject({ answerKnown: true, promptKnown: false });
    expect(generateSentences(lexicon, "en", packs.en, "pl", packs.pl, known, known)).toHaveLength(0);

    const both = new Map<string, WordStat>([
      ["pl-103", stat],
      ["de-49", withManual(undefined, true, 3)!],
    ]);
    expect(rows.find((row) => row.id === "cat")?.answerKnown).toBe(false);
    const marked = knownIdSet(both);
    expect(generateSentences(lexicon, "pl", packs.pl, "en", packs.en, marked, marked).map((item) => item.id)).toEqual([
      "adj:house:big",
    ]);
  });
});
