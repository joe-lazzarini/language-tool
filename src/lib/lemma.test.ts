import { describe, expect, it } from "vitest";
import {
  buildLemmaIndex,
  foldLemmaKey,
  indexDeckCitations,
  lookupLemma,
  resolveLemma,
  sameCitation,
} from "./lemma";
import type { GrammarFile } from "../sentence/types";
import type { Entry } from "../types";

const grammar: GrammarFile = {
  version: 1,
  words: {
    "pl-103": {
      pos: "noun",
      langs: {
        pl: { lemma: "dom", gender: "m", npNom: "dom", npAcc: "dom" },
        de: { lemma: "Haus", gender: "n", npNom: "das Haus", npAcc: "das Haus" },
        en: { lemma: "house", gender: "n", npNom: "the house", npAcc: "the house" },
      },
    },
    "pl-178": {
      pos: "verb",
      langs: {
        pl: { lemma: "iść", fin: "idzie" },
        de: { lemma: "gehen", fin: "geht" },
        en: { lemma: "go", fin: "goes" },
      },
    },
    "pl-adj": {
      pos: "adjective",
      langs: {
        pl: { lemma: "dobry", m: "dobry", f: "dobra", n: "dobre" },
        de: { lemma: "gut", m: "gut", f: "gut", n: "gut" },
        en: { lemma: "good", m: "good", f: "good", n: "good" },
      },
    },
    "pl-9": {
      pos: "noun",
      langs: {
        pl: { lemma: "kot", gender: "m", acc: "kota" },
        en: { lemma: "cat", gender: "n" },
      },
    },
  },
};

describe("buildLemmaIndex / resolveLemma", () => {
  const index = buildLemmaIndex(grammar);

  it("maps Polish noun inflections to nominative singular", () => {
    expect(resolveLemma("pl", "domu", index)).toMatchObject({ lemma: "dom", changed: true });
    expect(resolveLemma("pl", "domy", index)).toMatchObject({ lemma: "dom", changed: true });
    expect(resolveLemma("pl", "dom", index)).toMatchObject({ lemma: "dom", changed: false });
    expect(resolveLemma("pl", "koty", index)).toMatchObject({ lemma: "kot", changed: true });
    expect(resolveLemma("pl", "kota", index)).toMatchObject({ lemma: "kot", changed: true });
  });

  it("maps German noun plurals and verb preterite when known", () => {
    expect(resolveLemma("de", "Häuser", index)).toMatchObject({ lemma: "Haus", changed: true });
    expect(resolveLemma("de", "häuser", index)).toMatchObject({ lemma: "Haus", changed: true });
    expect(resolveLemma("de", "ging", index)).toMatchObject({ lemma: "gehen", changed: true });
    expect(resolveLemma("de", "geht", index)).toMatchObject({ lemma: "gehen", changed: true });
  });

  it("maps English and Polish verb forms to the infinitive / base", () => {
    expect(resolveLemma("en", "went", index)).toMatchObject({ lemma: "go", changed: true });
    expect(resolveLemma("en", "goes", index)).toMatchObject({ lemma: "go", changed: true });
    expect(resolveLemma("pl", "idzie", index)).toMatchObject({ lemma: "iść", changed: true });
    expect(resolveLemma("pl", "szedł", index)).toMatchObject({ lemma: "iść", changed: true });
  });

  it("maps Polish adjective gender forms to the masculine citation", () => {
    expect(resolveLemma("pl", "dobra", index)).toMatchObject({ lemma: "dobry", changed: true });
    expect(resolveLemma("pl", "dobre", index)).toMatchObject({ lemma: "dobry", changed: true });
  });

  it("is case- and diacritic-insensitive for lookup keys", () => {
    expect(foldLemmaKey("DOMU", "pl")).toBe(foldLemmaKey("domu", "pl"));
    expect(foldLemmaKey("Häuser", "de")).toBe(foldLemmaKey("hauser", "de"));
    expect(sameCitation("pl", "Iść", "iść")).toBe(true);
  });

  it("indexes deck citation forms as identity lemmas", () => {
    const deck: Entry[] = [
      {
        id: "custom-skip",
        pos: "noun",
        custom: true,
        ranks: {},
        forms: { pl: { text: "xyz", accepted: [{ text: "xyz" }] } },
      },
      {
        id: "pl-extra",
        pos: "noun",
        ranks: { pl: 1 },
        forms: { pl: { text: "stół", accepted: [{ text: "stół" }] } },
      },
    ];
    indexDeckCitations(index, deck);
    expect(lookupLemma(index, "pl", "stół")?.lemma).toBe("stół");
    expect(lookupLemma(index, "pl", "xyz")).toBeNull();
  });

  it("leaves unknown surfaces unchanged", () => {
    expect(resolveLemma("pl", "asdfgh", index)).toMatchObject({
      lemma: "asdfgh",
      changed: false,
      hit: null,
    });
  });

  it("does not invent English verb plurals like gos/bes from enPlural", () => {
    expect(resolveLemma("en", "gos", index).changed).toBe(false);
    expect(resolveLemma("en", "bes", index).changed).toBe(false);
    expect(resolveLemma("en", "goes", index)).toMatchObject({ lemma: "go", changed: true });
  });

  it("never remaps a typed citation lemma to a different word", () => {
    expect(resolveLemma("en", "go", index)).toMatchObject({ lemma: "go", changed: false });
    expect(resolveLemma("de", "Haus", index)).toMatchObject({ lemma: "Haus", changed: false });
    expect(resolveLemma("pl", "dom", index)).toMatchObject({ lemma: "dom", changed: false });
  });
});
