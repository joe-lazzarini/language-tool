import { describe, expect, it } from "vitest";
import { parseLangEntry, parseTranslationList } from "./wiktionary";

const CAT_TRANSLATIONS = `
==English==

===Noun===

====Translations====
{{trans-top|domestic species}}{{multitrans|data=
* Polish: {{tt+|pl|kot|m-an}}, {{tt+|pl|kotka|f}}, {{tt+|pl|kotek|m-an}} {{q|diminutive}}
* German: {{q|♂♀}} {{tt+|de|Katze|f}}, {{q|♂}} {{tt+|de|Kater|m}}
{{trans-bottom}}

{{trans-top|any felid}}
* Polish: {{tt+|pl|kotowate}}
* German: {{tt|de|Katzenartige|m}}
`;

const KOT = `
==Polish==

===Noun===
{{pl-noun|m-anml}}

# [[cat]] {{gl|a domesticated feline}}
# {{lb|pl|colloquial}} [[dust bunny]]
`;

const KOTY = `
==Polish==

===Noun===
{{head|pl|noun form}}

# {{inflection of|pl|kot||nom//acc//voc|p}}
`;

const CATS = `
==English==

===Noun===
{{head|en|noun form}}

# {{plural of|en|cat}}
`;

describe("parseTranslationList", () => {
  it("keeps citation forms and gender context from the first sense", () => {
    const parsed = parseLangEntry(CAT_TRANSLATIONS, "en");
    expect(parsed?.translations.pl).toEqual([
      { text: "kot", context: "masculine" },
      { text: "kotka", context: "feminine" },
      { text: "kotek", context: "masculine · diminutive" },
    ]);
    expect(parsed?.translations.de).toEqual([
      { text: "Katze", context: "feminine" },
      { text: "Kater", context: "masculine" },
    ]);
    expect(parsed?.translations.pl?.some((item) => item.text === "kotowate")).toBe(false);
  });
});

describe("parseLangEntry", () => {
  it("reads the English gloss of a Polish lemma and ignores later senses", () => {
    const parsed = parseLangEntry(KOT, "pl");
    expect(parsed?.pos).toBe("noun");
    expect(parsed?.glosses).toEqual([{ text: "cat" }]);
    expect(parsed?.formOfLemma).toBeUndefined();
  });

  it("follows an inflected form back to the lemma", () => {
    expect(parseLangEntry(KOTY, "pl")?.formOfLemma).toBe("kot");
    expect(parseLangEntry(CATS, "en")?.formOfLemma).toBe("cat");
  });

  it("reads Polish pl-head noun/verb form lemmas (captured en.wiktionary shapes)", () => {
    // Live Polish entries often have ONLY a head template — no `# {{inflection of}}` line.
    expect(
      parseLangEntry(
        "==Polish==\n===Noun===\n{{pl-head|noun form|humor|g=m-in}}\n",
        "pl",
      )?.formOfLemma,
    ).toBe("humor");
    expect(
      parseLangEntry("==Polish==\n===Verb===\n{{pl-head|verb form|powtarzać}}\n", "pl")?.formOfLemma,
    ).toBe("powtarzać");
    expect(
      parseLangEntry("==Polish==\n===Noun===\n{{pl-head|noun form|dom|g=m-in}}\n", "pl")?.formOfLemma,
    ).toBe("dom");
    expect(
      parseLangEntry(
        "==Polish==\n===Verb===\n{{pl-head|verb form|robić<id:make>}}\n",
        "pl",
      )?.formOfLemma,
    ).toBe("robić");
    expect(
      parseLangEntry("==Polish==\n===Verb===\n{{pl-head|verb form|czytać}}\n", "pl")?.formOfLemma,
    ).toBe("czytać");
    expect(
      parseLangEntry("==Polish==\n===Noun===\n{{pl-head|noun form|kobieta|g=f}}\n", "pl")?.formOfLemma,
    ).toBe("kobieta");
  });

  it("reads German verb form of / de-adj form of / inflection of", () => {
    expect(
      parseLangEntry(
        "==German==\n===Verb===\n{{head|de|verb form}}\n# {{verb form of|de|gehen||1//3|s|pret}}\n",
        "de",
      )?.formOfLemma,
    ).toBe("gehen");
    expect(
      parseLangEntry(
        "==German==\n===Adjective===\n{{head|de|adjective form}}\n# {{de-adj form of|klein}}\n",
        "de",
      )?.formOfLemma,
    ).toBe("klein");
    expect(
      parseLangEntry(
        "==German==\n===Noun===\n{{head|de|noun form}}\n# {{inflection of|de|Haus||nom//acc//gen|p}}\n",
        "de",
      )?.formOfLemma,
    ).toBe("Haus");
  });

  it("reads English / Romance / Russian inflection templates", () => {
    expect(
      parseLangEntry(
        "==English==\n===Verb===\n{{head|en|verb form}}\n# {{infl of|en|go||spast}}\n",
        "en",
      )?.formOfLemma,
    ).toBe("go");
    expect(
      parseLangEntry(
        "==English==\n===Noun===\n{{head|en|noun form}}\n# {{plural of|en|child}}\n",
        "en",
      )?.formOfLemma,
    ).toBe("child");
    expect(
      parseLangEntry(
        "==French==\n===Verb===\n# {{inflection of|fr|parler||1//3|s|pres|ind}}\n",
        "fr",
      )?.formOfLemma,
    ).toBe("parler");
    expect(
      parseLangEntry(
        "==Italian==\n===Verb===\n# {{inflection of|it|parlare||1|s|pres|indc}}\n",
        "it",
      )?.formOfLemma,
    ).toBe("parlare");
    expect(
      parseLangEntry(
        "==Spanish==\n===Verb===\n{{head|es|verb form}}\n# {{es-verb form of|hablar}}\n",
        "es",
      )?.formOfLemma,
    ).toBe("hablar");
    expect(
      parseLangEntry(
        "==Russian==\n===Noun===\n# {{inflection of|ru|дом||ins|p}}\n",
        "ru",
      )?.formOfLemma,
    ).toBe("дом");
    expect(
      parseLangEntry(
        "==Russian==\n===Verb===\n# {{inflection of|ru|говори́ть||3|s|pres|ind|impfv}}\n",
        "ru",
      )?.formOfLemma,
    ).toBe("говорить");
  });

  it("prefers the lemma that matches the first POS when several form-ofs appear", () => {
    const parsed = parseLangEntry(
      `==Spanish==
===Noun===
{{head|es|noun form|g=f-p}}
# {{noun form of|es|habla||p}}
===Verb===
{{head|es|verb form}}
# {{es-verb form of|hablar}}
`,
      "es",
    );
    expect(parsed?.pos).toBe("noun");
    expect(parsed?.formOfLemma).toBe("habla");
  });

  it("reads Spanish from the language registry", () => {
    const parsed = parseLangEntry(
      "==English==\n\n===Noun===\n# [[cat]]\n\n====Translations====\n{{trans-top|cat}}\n* Spanish: {{t+|es|gato|m}}\n* French: {{t+|fr|chat|m}}\n",
      "en",
    );
    expect(parsed?.translations.es).toEqual([{ text: "gato", context: "masculine" }]);
    expect(parsed?.translations.fr?.[0]?.text).toBe("chat");
  });

  it("returns null when the language section is missing", () => {
    expect(parseLangEntry(KOT, "de")).toBeNull();
  });

  it("reads a part of speech nested under etymology and keeps to plus the verb", () => {
    const noun = parseLangEntry(
      "==English==\n\n===Etymology 1===\n====Noun====\n# [[cat]]\n",
      "en",
    );
    expect(noun?.pos).toBe("noun");
    expect(noun?.glosses).toEqual([{ text: "cat" }]);

    const verb = parseLangEntry(
      "==Polish==\n\n===Verb===\n# {{lb|pl|copulative}} to [[be]] {{ng|(used to indicate sameness)}}\n",
      "pl",
    );
    expect(verb?.pos).toBe("verb");
    expect(verb?.glosses).toEqual([{ text: "to be" }]);
  });
});

describe("parseTranslationList extras", () => {
  it("ignores templates that are not translation links", () => {
    expect(parseTranslationList("{{t-needed|pl}} {{trans-top|cat}}")).toEqual([]);
  });
});
