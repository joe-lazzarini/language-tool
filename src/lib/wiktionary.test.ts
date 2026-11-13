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
