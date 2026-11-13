import { describe, expect, it } from "vitest";
import { LANG_CODES } from "../lib/languages";
import { lookupWord } from "./translate";
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

  it("follows a Polish inflection to the Wiktionary lemma and its German citation form", async () => {
    const calls: string[] = [];
    const draft = await lookupWord("koty", "pl", deck, wikiFetch(calls));
    expect(draft.forms.pl?.text).toBe("kot");
    expect(draft.forms.en?.accepted[0]?.text).toBe("cat");
    expect(draft.forms.de?.accepted).toEqual([{ text: "Katze", context: "feminine" }]);
    expect(draft.pos).toBe("noun");
    expect(draft.notes.join(" ")).toMatch(/dictionary form "kot"/);
    expect(draft.notes.join(" ")).toMatch(/Wiktionary/);
    expect(calls).toContain("koty");
    expect(calls).toContain("kot");
    expect(calls).toContain("cat/translations");
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
