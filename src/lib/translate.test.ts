import { afterEach, describe, expect, it } from "vitest";
import { LANG_CODES } from "../lib/languages";
import { loadLemmaIndex, resetLemmaIndexCache } from "./lemma";
import { lookupWord } from "./translate";
import type { GrammarFile } from "../sentence/types";
import type { Entry, LangCode } from "../types";

function withEveryLanguage(entry: Entry): Entry {
  const forms = { ...entry.forms };
  for (const code of LANG_CODES) {
    if (!forms[code]) forms[code] = { text: code, accepted: [{ text: code }] };
  }
  return { ...entry, forms };
}

const deck: Entry[] = [
  {
    id: "pl-3",
    pos: "verb",
    ranks: { pl: 3 },
    forms: {
      en: { text: "to be", accepted: [{ text: "to be" }, { text: "be" }] },
      pl: { text: "być", accepted: [{ text: "być" }] },
      de: { text: "sein", accepted: [{ text: "sein" }] },
    },
  },
];

const pages: Record<string, string> = {
  koty: `
==Polish==
===Noun===
# {{inflection of|pl|kot||nom|p}}
`,
  kot: `
==Polish==
===Noun===
# [[cat]]
`,
  "cat/translations": `
==English==
===Noun===
====Translations====
{{trans-top|domestic species}}
* Polish: {{t+|pl|kot|m-an}}
* German: {{t+|de|Katze|f}}
{{trans-bottom}}
`,
};

function wikiFetch(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.searchParams.get("page") || url.toString());
    const page = url.searchParams.get("page") || "";
    const wikitext = pages[page];
    if (!wikitext) {
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }
    return {
      ok: true,
      json: async () => ({ parse: { title: page, wikitext: { "*": wikitext } } }),
    } as Response;
  }) as typeof fetch;
}

describe("lookupWord", () => {
  afterEach(() => {
    resetLemmaIndexCache();
  });

  it("uses the bundled deck and does not call the network", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    const draft = await lookupWord("być", "pl", [withEveryLanguage(deck[0])], fetchImpl);
    expect(called).toBe(false);
    expect(draft.pos).toBe("verb");
    expect(draft.forms.en?.accepted.map((item) => item.text)).toEqual(["to be", "be"]);
    expect(draft.forms.de?.text).toBe("sein");
    expect(draft.notes[0]).toMatch(/built-in deck/);
  });

  it("fills only the requested language pair", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error("network");
    }) as typeof fetch;
    const draft = await lookupWord("być", "pl", [withEveryLanguage(deck[0])], fetchImpl, ["pl", "en"]);
    expect(calls).toEqual([]);
    expect(draft.forms.pl?.text).toBe("być");
    expect(draft.forms.en?.accepted.map((item) => item.text)).toEqual(["to be", "be"]);
    expect(draft.forms.de).toBeUndefined();
    expect(draft.forms.es).toBeUndefined();
  });

  it("follows a Polish inflection to the Wiktionary lemma and its German citation form", async () => {
    const calls: string[] = [];
    const draft = await lookupWord("koty", "pl", deck, wikiFetch(calls));
    expect(draft.forms.pl?.text).toBe("kot");
    expect(draft.forms.en?.accepted[0]?.text).toBe("cat");
    expect(draft.forms.de?.accepted).toEqual([{ text: "Katze", context: "feminine" }]);
    expect(draft.pos).toBe("noun");
    expect(draft.notes.join(" ")).toMatch(/Saved as “kot” \(from “koty”\)/);
    expect(draft.lemma).toEqual({ canonical: "kot", original: "koty", source: "wiktionary" });
    expect(draft.notes.join(" ")).toMatch(/Wiktionary/);
    expect(calls).toContain("koty");
    expect(calls).toContain("kot");
    expect(calls).toContain("cat/translations");
  });

  it("uses the static grammar/morph lemma map before calling the network", async () => {
    resetLemmaIndexCache();
    const grammar: GrammarFile = {
      version: 1,
      words: {
        go: {
          pos: "verb",
          langs: {
            pl: { lemma: "iść", fin: "idzie" },
            en: { lemma: "go", fin: "goes" },
          },
        },
      },
    };
    await loadLemmaIndex(async () => grammar);

    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;

    const draft = await lookupWord("idzie", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("iść");
    expect(draft.lemma).toEqual({ canonical: "iść", original: "idzie", source: "static" });
    expect(draft.notes.join(" ")).toMatch(/Saved as “iść”/);
    // Still tries MyMemory for the missing English line.
    expect(called).toBe(true);
    expect(draft.forms.en).toBeUndefined();
    resetLemmaIndexCache();
  });

  it("keeps the static lemma when Wiktionary returns a different citation", async () => {
    resetLemmaIndexCache();
    const grammar: GrammarFile = {
      version: 1,
      words: {
        go: {
          pos: "verb",
          langs: {
            pl: { lemma: "iść", fin: "idzie" },
            en: { lemma: "go", fin: "goes" },
          },
        },
      },
    };
    await loadLemmaIndex(async () => grammar);

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wiktionary")) {
        const page = new URL(url).searchParams.get("page") || "";
        if (page === "iść" || page === "idzie") {
          return {
            ok: true,
            json: async () => ({
              parse: {
                title: page,
                wikitext: {
                  "*": `==Polish==\n===Verb===\n# {{form of|pl|chodzić}}\n`,
                },
              },
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          responseData: { translatedText: "go" },
          matches: [{ translation: "go", match: 1 }],
        }),
      } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("idzie", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("iść");
    expect(draft.lemma).toEqual({ canonical: "iść", original: "idzie", source: "static" });
    expect(draft.notes.filter((note) => note.startsWith("Saved as"))).toHaveLength(1);
    resetLemmaIndexCache();
  });

  it("falls back to MyMemory when Wiktionary has no entry", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wiktionary")) {
        return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
      }
      const target = new URL(url).searchParams.get("langpair");
      const translation = target?.endsWith("|de") ? "Haus" : "house";
      return {
        ok: true,
        json: async () => ({
          responseData: { translatedText: translation },
          matches: [{ translation, match: 1 }],
        }),
      } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("dom", "pl", [], fetchImpl);
    expect(draft.forms.pl?.text).toBe("dom");
    expect(draft.forms.en?.text).toBe("house");
    expect(draft.forms.de?.text).toBe("Haus");
    expect(draft.notes.join(" ")).toMatch(/MyMemory/);
  });
});

/** Captured / realistic en.wiktionary wikitext for regression forms. */
const CAPTURED: Record<string, string> = {
  humoru: `==Latvian==\n===Noun===\n# {{infl of|lv|humors||acc//ins|s}}\n\n==Polish==\n===Etymology===\n{{ety|pl|nl=1}}\n===Noun===\n{{pl-head|noun form|humor|g=m-in}}\n`,
  humor: `==Polish==\n===Noun===\n{{pl-noun|m-in}}\n# [[humour]], [[humor]]\n\n====Translations====\n{{trans-top|humour}}\n* English: {{t+|en|humour}}, {{t+|en|humor}}\n* German: {{t+|de|Humor|m}}\n{{trans-bottom}}\n`,
  powtarzam: `==Polish==\n===Verb===\n{{pl-head|verb form|powtarzać}}\n`,
  "powtarzać": `==Polish==\n===Verb===\n{{pl-verb|ć}}\n# to [[repeat]]\n\n====Translations====\n{{trans-top|repeat}}\n* English: {{t+|en|repeat}}\n* German: {{t+|de|wiederholen}}\n{{trans-bottom}}\n`,
  domu: `==Polish==\n===Noun===\n{{pl-head|noun form|dom|g=m-in}}\n`,
  kobiety: `==Polish==\n===Noun===\n{{pl-head|noun form|kobieta|g=f}}\n`,
  "robię": `==Polish==\n===Verb===\n{{pl-head|verb form|robić<id:make>}}\n`,
  czytasz: `==Polish==\n===Verb===\n{{pl-head|verb form|czytać}}\n`,
  Häuser: `==German==\n===Noun===\n{{head|de|noun form}}\n# {{inflection of|de|Haus||nom//acc//gen|p}}\n`,
  Haus: `==German==\n===Noun===\n{{de-noun|n}}\n# [[house]]\n`,
  ging: `==German==\n===Verb===\n{{head|de|verb form}}\n# {{verb form of|de|gehen||1//3|s|pret}}\n`,
  gehen: `==German==\n===Verb===\n{{de-verb}}\n# to [[go]]\n`,
  kleinen: `==German==\n===Adjective===\n{{head|de|adjective form}}\n# {{de-adj form of|klein}}\n`,
  klein: `==German==\n===Adjective===\n{{de-adj}}\n# [[small]]\n`,
  went: `==English==\n===Verb===\n{{head|en|verb form}}\n# {{infl of|en|go||spast}}\n`,
  go: `==English==\n===Verb===\n{{en-verb}}\n# to [[move]]\n\n====Translations====\n{{trans-top|to move}}\n* Polish: {{t+|pl|iść}}\n* German: {{t+|de|gehen}}\n{{trans-bottom}}\n`,
  children: `==English==\n===Noun===\n{{head|en|noun form}}\n# {{plural of|en|child}}\n`,
  child: `==English==\n===Noun===\n{{en-noun}}\n# a young [[person]]\n`,
  parle: `==French==\n===Verb===\n{{head|fr|verb form}}\n# {{inflection of|fr|parler||1//3|s|pres|ind}}\n`,
  parler: `==French==\n===Verb===\n{{fr-verb}}\n# to [[speak]]\n`,
  parlo: `==Italian==\n===Verb===\n{{head|it|verb form}}\n# {{inflection of|it|parlare||1|s|pres|indc}}\n`,
  parlare: `==Italian==\n===Verb===\n{{it-verb}}\n# to [[speak]]\n`,
  hablas: `==Spanish==\n===Verb===\n{{head|es|verb form}}\n# {{es-verb form of|hablar}}\n`,
  hablar: `==Spanish==\n===Verb===\n{{es-verb}}\n# to [[speak]]\n`,
  "домами": `==Russian==\n===Noun===\n{{head|ru|noun form}}\n# {{inflection of|ru|дом||ins|p}}\n`,
  "дом": `==Russian==\n===Noun===\n{{ru-noun+|дом}}\n# [[house]]\n`,
};

function capturedWikiFetch(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname.includes("mymemory")) {
      return {
        ok: true,
        json: async () => ({
          responseData: { translatedText: "x" },
          matches: [{ translation: "x", match: 0.1 }],
        }),
      } as Response;
    }
    const page = url.searchParams.get("page") || "";
    calls.push(page);
    const wikitext = CAPTURED[page];
    if (!wikitext) {
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }
    return {
      ok: true,
      json: async () => ({ parse: { title: page, wikitext: { "*": wikitext } } }),
    } as Response;
  }) as typeof fetch;
}

describe("lookupWord multi-language lemma canonicalization", () => {
  afterEach(() => {
    resetLemmaIndexCache();
  });

  it("canonicalizes Polish humoru → humor via pl-head and fetches lemma translations", async () => {
    const calls: string[] = [];
    // Empty grammar so we exercise the Wiktionary path (humor is not in the tiny fixture).
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const draft = await lookupWord("humoru", "pl", [], capturedWikiFetch(calls), ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("humor");
    expect(draft.lemma).toEqual({ canonical: "humor", original: "humoru", source: "wiktionary" });
    expect(draft.notes.join(" ")).toMatch(/Saved as “humor” \(from “humoru”\)/);
    expect(draft.forms.en?.accepted.some((item) => /humour|humor/i.test(item.text))).toBe(true);
    expect(calls).toContain("humoru");
    expect(calls).toContain("humor");
  });

  it("canonicalizes Polish powtarzam → powtarzać via pl-head", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const draft = await lookupWord("powtarzam", "pl", [], capturedWikiFetch([]), ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("powtarzać");
    expect(draft.lemma).toEqual({
      canonical: "powtarzać",
      original: "powtarzam",
      source: "wiktionary",
    });
    expect(draft.notes.join(" ")).toMatch(/Saved as “powtarzać”/);
    expect(draft.forms.en?.accepted[0]?.text).toBe("repeat");
  });

  it("canonicalizes Polish domu/kobiety/robię/czytasz via Wiktionary form heads", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = capturedWikiFetch([]);
    expect((await lookupWord("domu", "pl", [], fetchImpl, ["pl"])).forms.pl?.text).toBe("dom");
    expect((await lookupWord("kobiety", "pl", [], fetchImpl, ["pl"])).forms.pl?.text).toBe("kobieta");
    expect((await lookupWord("robię", "pl", [], fetchImpl, ["pl"])).forms.pl?.text).toBe("robić");
    expect((await lookupWord("czytasz", "pl", [], fetchImpl, ["pl"])).forms.pl?.text).toBe("czytać");
  });

  it("canonicalizes German Häuser/ging/kleinen", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = capturedWikiFetch([]);
    expect((await lookupWord("Häuser", "de", [], fetchImpl, ["de", "en"])).lemma?.canonical).toBe(
      "Haus",
    );
    expect((await lookupWord("ging", "de", [], fetchImpl, ["de", "en"])).lemma?.canonical).toBe(
      "gehen",
    );
    expect((await lookupWord("kleinen", "de", [], fetchImpl, ["de", "en"])).lemma?.canonical).toBe(
      "klein",
    );
  });

  it("canonicalizes English went/children and Romance/Russian conjugations", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = capturedWikiFetch([]);
    expect((await lookupWord("went", "en", [], fetchImpl, ["en", "pl"])).lemma?.canonical).toBe("go");
    expect((await lookupWord("children", "en", [], fetchImpl, ["en"])).lemma?.canonical).toBe(
      "child",
    );
    expect((await lookupWord("parle", "fr", [], fetchImpl, ["fr"])).lemma?.canonical).toBe("parler");
    expect((await lookupWord("parlo", "it", [], fetchImpl, ["it"])).lemma?.canonical).toBe("parlare");
    expect((await lookupWord("hablas", "es", [], fetchImpl, ["es"])).lemma?.canonical).toBe("hablar");
    expect((await lookupWord("домами", "ru", [], fetchImpl, ["ru"])).lemma?.canonical).toBe("дом");
  });

  it("accepts a verified rule candidate when the form page is missing", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname.includes("mymemory")) {
        return {
          ok: true,
          json: async () => ({
            responseData: { translatedText: "repeat" },
            matches: [{ translation: "repeat", match: 1 }],
          }),
        } as Response;
      }
      const page = url.searchParams.get("page") || "";
      calls.push(page);
      // Form page missing — only the infinitive exists (forces rule + verify path).
      if (page === "powtarzam") {
        return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
      }
      if (page === "powtarzać" || page === "powtarzać/translations") {
        return {
          ok: true,
          json: async () => ({
            parse: {
              title: "powtarzać",
              wikitext: { "*": CAPTURED["powtarzać"] },
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("powtarzam", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("powtarzać");
    expect(draft.lemma?.source).toBe("wiktionary");
    expect(calls).toContain("powtarzać");
  });

  it("does not accept German capitalizeLookup redirects when verifying rules", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname.includes("mymemory")) {
        return {
          ok: true,
          json: async () => ({
            responseData: { translatedText: "small" },
            matches: [{ translation: "small", match: 1 }],
          }),
        } as Response;
      }
      const page = url.searchParams.get("page") || "";
      // Form page missing → rule path. Only exact "klein" verifies; "Kleine" is a noun trap.
      if (page === "klein") {
        return {
          ok: true,
          json: async () => ({
            parse: {
              title: "klein",
              wikitext: { "*": CAPTURED.klein },
            },
          }),
        } as Response;
      }
      if (page === "Kleine") {
        return {
          ok: true,
          json: async () => ({
            parse: {
              title: "Kleine",
              wikitext: {
                "*": `==German==\n===Noun===\n{{de-noun|n}}\n# [[little one]]\n`,
              },
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("kleinen", "de", [], fetchImpl, ["de", "en"]);
    expect(draft.forms.de?.text).toBe("klein");
    expect(draft.lemma?.canonical).toBe("klein");
  });

  it("does not invent an unverified Polish candidate", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wiktionary")) {
        return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          responseData: { translatedText: "x" },
          matches: [{ translation: "x", match: 1 }],
        }),
      } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("powtarzam", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("powtarzam");
    expect(draft.lemma).toBeUndefined();
  });

  it("keeps Chinese and Japanese surfaces unchanged", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = (async () => {
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }) as typeof fetch;
    const zh = await lookupWord("重复", "zh", [], fetchImpl, ["zh", "en"]);
    expect(zh.forms.zh?.text).toBe("重复");
    expect(zh.lemma).toBeUndefined();
    const ja = await lookupWord("行く", "ja", [], fetchImpl, ["ja", "en"]);
    expect(ja.forms.ja?.text).toBe("行く");
    expect(ja.lemma).toBeUndefined();
  });

  it("does not remap a real Polish base word when rules could invent another page", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname.includes("mymemory")) {
        return {
          ok: true,
          json: async () => ({
            responseData: { translatedText: "coffee" },
            matches: [{ translation: "coffee", match: 1 }],
          }),
        } as Response;
      }
      const page = url.searchParams.get("page") || "";
      calls.push(page);
      // Real citation lemma page for kawa. A rule candidate "kawać" also exists —
      // accepting it would falsely remap the noun.
      if (page === "kawa") {
        return {
          ok: true,
          json: async () => ({
            parse: {
              title: "kawa",
              wikitext: {
                "*": `==Polish==\n===Noun===\n{{pl-noun|f}}\n# [[coffee]]\n\n====Translations====\n{{trans-top|coffee}}\n* English: {{t+|en|coffee}}\n{{trans-bottom}}\n`,
              },
            },
          }),
        } as Response;
      }
      if (page === "kawać") {
        return {
          ok: true,
          json: async () => ({
            parse: {
              title: "kawać",
              wikitext: {
                "*": `==Polish==\n===Verb===\n{{pl-verb|ć}}\n# to [[peck]]\n`,
              },
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ error: { code: "missingtitle" } }) } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("kawa", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("kawa");
    expect(draft.lemma).toBeUndefined();
    expect(draft.forms.en?.accepted[0]?.text).toBe("coffee");
    // Identity wiki hit must not probe rule candidates.
    expect(calls).toContain("kawa");
    expect(calls).not.toContain("kawać");
    expect(calls).not.toContain("kaw");
  });

  it("stays graceful when Wiktionary is offline", async () => {
    await loadLemmaIndex(async () => ({ version: 1, words: {} }));
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wiktionary")) throw new TypeError("Failed to fetch");
      return {
        ok: true,
        json: async () => ({
          responseData: { translatedText: "house" },
          matches: [{ translation: "house", match: 1 }],
        }),
      } as Response;
    }) as typeof fetch;

    const draft = await lookupWord("dom", "pl", [], fetchImpl, ["pl", "en"]);
    expect(draft.forms.pl?.text).toBe("dom");
    expect(draft.lemma).toBeUndefined();
    expect(draft.notes.join(" ")).toMatch(/Wiktionary didn't respond/);
    expect(draft.forms.en?.text).toBe("house");
  });
});
