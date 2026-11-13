import { findDeckEntry } from "./findDeck";
import { buildForm, cloneForm } from "./forms";
import { pickMemoryTranslations, type MemoryPayload } from "./mymemory";
import { parseLangEntry, type LangParse } from "./wiktionary";
import { LANG_CODES, languageByCode, pivotLanguage } from "./languages";
import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, Entry, Form, LangCode } from "../types";

export type LookupDraft = {
  pos: string;
  forms: Partial<Record<LangCode, Form>>;
  notes: string[];
};

type WikiPage = {
  title: string;
  wikitext: string;
};

const WIKI_API = "https://en.wiktionary.org/w/api.php";
const MEMORY_API = "https://api.mymemory.translated.net/get";

function pageLemma(title: string): string {
  return title.split("/")[0].replace(/_/g, " ").trim();
}

async function fetchWikiPage(page: string, fetchImpl: typeof fetch): Promise<WikiPage | null> {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", page);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("origin", "*");
  const response = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    error?: unknown;
    parse?: { title?: string; wikitext?: { "*"?: string } };
  };
  const wikitext = data.parse?.wikitext?.["*"];
  if (!wikitext || data.error) return null;
  return { title: data.parse?.title || page, wikitext };
}

async function fetchMemory(
  text: string,
  from: LangCode,
  to: LangCode,
  fetchImpl: typeof fetch,
): Promise<AcceptedAnswer[]> {
  const url = new URL(MEMORY_API);
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${from}|${to}`);
  const response = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const payload = (await response.json()) as MemoryPayload;
  return pickMemoryTranslations(payload, text);
}

function answersFromParse(parsed: LangParse, source: LangCode, lemma: string): Partial<Record<LangCode, AcceptedAnswer[]>> {
  const forms: Partial<Record<LangCode, AcceptedAnswer[]>> = {
    [source]: [{ text: lemma }],
  };
  const pivot = pivotLanguage();
  if (pivot && source !== pivot && parsed.glosses.length > 0) forms[pivot] = parsed.glosses;
  for (const code of LANG_CODES) {
    if (code === source) continue;
    const translated = parsed.translations[code];
    if (translated && translated.length > 0) forms[code] = translated;
  }
  return forms;
}

function fillMissing(
  target: Partial<Record<LangCode, AcceptedAnswer[]>>,
  extra: Partial<Record<LangCode, AcceptedAnswer[]>>,
  source: LangCode,
): void {
  for (const code of LANG_CODES) {
    if (code === source || target[code]?.length) continue;
    if (extra[code]?.length) target[code] = extra[code];
  }
}

async function lookupWiktionary(
  query: string,
  source: LangCode,
  fetchImpl: typeof fetch,
): Promise<{ pos: string; lemma: string; forms: Partial<Record<LangCode, AcceptedAnswer[]>> } | null> {
  let page = await fetchWikiPage(query, fetchImpl);
  const sourceInfo = languageByCode(source);
  if (!page && sourceInfo.capitalizeLookup) {
    const capitalized = query.charAt(0).toLocaleUpperCase(sourceInfo.locale) + query.slice(1);
    if (normalizeAnswer(capitalized) !== normalizeAnswer(query) || capitalized !== query) {
      page = await fetchWikiPage(capitalized, fetchImpl);
    }
  }
  if (!page) return null;

  let parsed = parseLangEntry(page.wikitext, source);
  let lemma = parsed?.formOfLemma || pageLemma(page.title) || query;
  if (parsed?.formOfLemma && normalizeAnswer(parsed.formOfLemma) !== normalizeAnswer(query)) {
    const followed = await fetchWikiPage(parsed.formOfLemma, fetchImpl);
    if (followed) {
      const followedLemma = parsed.formOfLemma;
      const next = parseLangEntry(followed.wikitext, source);
      if (next) {
        parsed = next;
        lemma = next.formOfLemma || pageLemma(followed.title) || followedLemma;
      }
    }
  }
  if (!parsed) return null;

  const forms = answersFromParse(parsed, source, lemma);
  const missing = () => LANG_CODES.some((code) => code !== source && !forms[code]?.length);

  const pivot = pivotLanguage();
  if (missing()) {
    const subpage = await fetchWikiPage(`${lemma}/translations`, fetchImpl);
    if (subpage) {
      const sub = (pivot ? parseLangEntry(subpage.wikitext, pivot) : null) ?? parseLangEntry(subpage.wikitext, source);
      if (sub) fillMissing(forms, sub.translations, source);
    }
  }

  const gloss = pivot ? forms[pivot]?.[0]?.text?.replace(/^to\s+/i, "") : undefined;
  const stillMissing = LANG_CODES.some((code) => code !== source && code !== pivot && !forms[code]?.length);
  if (stillMissing && gloss && pivot && source !== pivot && normalizeAnswer(gloss) !== normalizeAnswer(lemma)) {
    const hop = await fetchWikiPage(`${gloss}/translations`, fetchImpl);
    if (hop) {
      const parsedHop = parseLangEntry(hop.wikitext, pivot);
      if (parsedHop) fillMissing(forms, parsedHop.translations, source);
    }
  }

  return { pos: parsed.pos || "word", lemma, forms };
}

function applyAnswers(
  forms: Partial<Record<LangCode, Form>>,
  code: LangCode,
  answers: AcceptedAnswer[] | undefined,
): boolean {
  if (!answers?.length || forms[code]) return false;
  const built = buildForm(answers);
  if (!built) return false;
  forms[code] = built;
  return true;
}

/**
 * Fill the other supported languages for a word typed in one language.
 * Order: bundled deck, English Wiktionary citation forms, then MyMemory.
 */
export async function lookupWord(
  word: string,
  source: LangCode,
  deck: Entry[],
  fetchImpl: typeof fetch = fetch,
): Promise<LookupDraft> {
  const query = word.trim();
  const notes: string[] = [];
  const forms: Partial<Record<LangCode, Form>> = {};
  let pos = "word";

  if (!query) return { pos, forms, notes: ["Type a word to look up."] };

  const deckHit = findDeckEntry(deck.filter((entry) => !entry.custom), source, query);
  if (deckHit) {
    pos = deckHit.pos || pos;
    for (const code of LANG_CODES) {
      const form = deckHit.forms[code];
      if (form?.text.trim() && form.accepted.some((item) => item.text.trim())) {
        forms[code] = cloneForm(form);
      }
    }
    notes.push("Found in the built-in deck.");
  }

  const missing = () => LANG_CODES.filter((code) => !forms[code]);
  if (missing().length === 0) return { pos, forms, notes };

  if (!forms[source]) {
    const typed = buildForm([{ text: query }]);
    if (typed) forms[source] = typed;
  }

  let wikiNote = false;
  try {
    const wiki = await lookupWiktionary(forms[source]?.accepted[0]?.text || query, source, fetchImpl);
    if (wiki) {
      if (!deckHit && wiki.pos) pos = wiki.pos;
      if (!deckHit && normalizeAnswer(wiki.lemma) !== normalizeAnswer(query)) {
        const lemmaForm = buildForm([{ text: wiki.lemma }]);
        if (lemmaForm) forms[source] = lemmaForm;
        notes.push(`Using the dictionary form "${wiki.lemma}".`);
      }
      for (const code of LANG_CODES) {
        if (applyAnswers(forms, code, wiki.forms[code])) wikiNote = true;
      }
      if (wikiNote) notes.push("Translations from English Wiktionary.");
    }
  } catch {
    notes.push("Wiktionary didn't respond.");
  }

  const gaps = LANG_CODES.filter((code) => code !== source && !forms[code]);
  if (gaps.length > 0) {
    const sourceText = forms[source]?.accepted[0]?.text || query;
    const filled = await Promise.all(
      gaps.map(async (code) => {
        try {
          return [code, await fetchMemory(sourceText, source, code, fetchImpl)] as const;
        } catch {
          return [code, [] as AcceptedAnswer[]] as const;
        }
      }),
    );
    let memory = false;
    for (const [code, answers] of filled) {
      if (applyAnswers(forms, code, answers)) memory = true;
    }
    if (memory) {
      notes.push("Some lines are from MyMemory. Check that they are dictionary forms before saving.");
    }
  }

  if (LANG_CODES.some((code) => !forms[code])) {
    notes.push("Fill in any blank language, then save.");
  }
  return { pos, forms, notes };
}
