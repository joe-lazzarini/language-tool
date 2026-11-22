import { normalizeAnswer } from "./match";
import { loadGrammar } from "../sentence/load";
import {
  dePastParticiple,
  enPast,
  enPlural,
  plAttrAdj,
  plGenitive,
  plLocative,
  plPast,
  plPlural,
} from "../sentence/morph";
import type { Gender, GrammarFile, GrammarWord, LangSurface } from "../sentence/types";
import type { Entry, LangCode } from "../types";

export type LemmaHit = {
  lemma: string;
  pos: string;
  /** Where the mapping came from. */
  source: "grammar" | "morph" | "deck";
};

export type LemmaIndex = Map<LangCode, Map<string, LemmaHit>>;

/** Fold for lemma / duplicate keys: case + diacritic insensitive. */
export function foldLemmaKey(value: string, lang?: LangCode): string {
  const locale = lang === "de" ? "de-DE" : lang === "en" ? "en-US" : "pl-PL";
  let next = value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  if (lang === "en") next = next.replace(/^to\s+/, "");
  // Strip German articles that sometimes ride along in npNom.
  if (lang === "de") next = next.replace(/^(der|die|das|den|dem|des)\s+/, "");
  if (lang === "en") next = next.replace(/^(the|a|an)\s+/, "");
  if (lang === "es" || lang === "fr" || lang === "it" || lang === "pt") {
    next = next.replace(/^(el|la|los|las|un|una|le|la|les|un|une|il|lo|i|gli|le|un|uno|una|o|a|os|as|um|uma)\s+/, "");
  }
  if (lang === "nl") next = next.replace(/^(de|het|een)\s+/, "");
  let out = "";
  for (const ch of next.normalize("NFD")) {
    if (/\p{M}/u.test(ch)) continue;
    out += ch;
  }
  // German ß → ss so Straße / strasse collide.
  return out.replaceAll("ß", "ss").normalize("NFC");
}

function addForm(
  index: LemmaIndex,
  lang: LangCode,
  surface: string | undefined,
  lemma: string,
  pos: string,
  source: LemmaHit["source"],
): void {
  const text = surface?.trim();
  if (!text || !lemma.trim()) return;
  // Multi-word analytic forms ("will go", "będzie iść", "hat gemacht") are not
  // useful reverse keys for a single typed word.
  if (/\s/.test(text) && !text.includes("/")) return;
  const key = foldLemmaKey(text, lang);
  if (!key) return;
  let byLang = index.get(lang);
  if (!byLang) {
    byLang = new Map();
    index.set(lang, byLang);
  }
  const existing = byLang.get(key);
  // Prefer an exact lemma self-map, then grammar over morph guesses.
  if (existing) {
    if (existing.source === "grammar" && source !== "grammar") return;
    if (foldLemmaKey(existing.lemma, lang) === key) return;
  }
  byLang.set(key, { lemma: lemma.trim(), pos, source });
}

function stripNp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^(the|a|an|der|die|das|den|dem|des|el|la|los|las|le|les|un|une|il|lo|i|gli|o|a|os|as|um|uma|de|het|een)\s+/i, "").trim();
}

/** Common German noun plurals for grammar lemmas (morph does not invent DE plurals). */
const DE_NOUN_PLURAL: Record<string, string> = {
  haus: "Häuser",
  kind: "Kinder",
  mann: "Männer",
  frau: "Frauen",
  buch: "Bücher",
  land: "Länder",
  wort: "Wörter",
  freund: "Freunde",
  tag: "Tage",
  jahr: "Jahre",
  hund: "Hunde",
  katze: "Katzen",
  stadt: "Städte",
  landschaft: "Landschaften",
  mensch: "Menschen",
};

/** Common German simple-past forms → infinitive. */
const DE_PRETERITE: Record<string, string> = {
  ging: "gehen",
  kam: "kommen",
  war: "sein",
  hatte: "haben",
  wurde: "werden",
  sah: "sehen",
  gab: "geben",
  nahm: "nehmen",
  sprach: "sprechen",
  schrieb: "schreiben",
  aß: "essen",
  trank: "trinken",
  schlief: "schlafen",
  las: "lesen",
  fand: "finden",
  dachte: "denken",
  brachte: "bringen",
  kaufte: "kaufen",
  machte: "machen",
  spielte: "spielen",
  arbeitete: "arbeiten",
  blieb: "bleiben",
  fuhr: "fahren",
  lief: "laufen",
  half: "helfen",
  wusste: "wissen",
};

/** English 3sg present → base (for grammar fin like "goes"). */
function enThirdPerson(lemma: string): string | null {
  const base = lemma.toLowerCase().replace(/^to\s+/, "");
  if (!base) return null;
  if (base === "be") return "is";
  if (base === "have") return "has";
  if (base === "do") return "does";
  if (base === "go") return "goes";
  if (base.endsWith("s") || base.endsWith("x") || base.endsWith("z") || base.endsWith("ch") || base.endsWith("sh")) {
    return `${base}es`;
  }
  if (base.endsWith("y") && base.length > 1 && !"aeiou".includes(base[base.length - 2]!)) {
    return `${base.slice(0, -1)}ies`;
  }
  return `${base}s`;
}

function indexSurfaceFields(
  index: LemmaIndex,
  lang: LangCode,
  surface: LangSurface,
  pos: string,
  source: LemmaHit["source"],
): void {
  const lemma = surface.lemma?.trim();
  if (!lemma) return;
  addForm(index, lang, lemma, lemma, pos, source);
  addForm(index, lang, surface.acc, lemma, pos, source);
  addForm(index, lang, surface.gen, lemma, pos, source);
  addForm(index, lang, surface.dat, lemma, pos, source);
  addForm(index, lang, surface.loc, lemma, pos, source);
  addForm(index, lang, surface.pl, lemma, pos, source);
  addForm(index, lang, surface.plAcc, lemma, pos, source);
  addForm(index, lang, stripNp(surface.npNom), lemma, pos, source);
  addForm(index, lang, stripNp(surface.npAcc), lemma, pos, source);
  addForm(index, lang, surface.fin, lemma, pos, source);
  addForm(index, lang, surface.past, lemma, pos, source);
  addForm(index, lang, surface.pastM, lemma, pos, source);
  addForm(index, lang, surface.pastF, lemma, pos, source);
  addForm(index, lang, surface.pastN, lemma, pos, source);
  addForm(index, lang, surface.pastPl, lemma, pos, source);
  addForm(index, lang, surface.future, lemma, pos, source);
  addForm(index, lang, surface.inf, lemma, pos, source);
  addForm(index, lang, surface.participle, lemma, pos, source);
  addForm(index, lang, surface.m, lemma, pos, source);
  addForm(index, lang, surface.f, lemma, pos, source);
  addForm(index, lang, surface.n, lemma, pos, source);
  addForm(index, lang, surface.attrNomM, lemma, pos, source);
  addForm(index, lang, surface.attrNomF, lemma, pos, source);
  addForm(index, lang, surface.attrNomN, lemma, pos, source);
  addForm(index, lang, surface.attrAccM, lemma, pos, source);
  addForm(index, lang, surface.attrAccF, lemma, pos, source);
  addForm(index, lang, surface.attrAccN, lemma, pos, source);
  for (const alt of surface.alts ?? []) addForm(index, lang, alt, lemma, pos, source);
}

function indexDerivedMorph(index: LemmaIndex, lang: LangCode, surface: LangSurface, pos: GrammarWord["pos"]): void {
  const lemma = surface.lemma?.trim();
  if (!lemma) return;
  const gender: Gender = surface.gender ?? "n";
  const animate = false;

  if (pos === "noun") {
    if (lang === "pl") {
      addForm(index, lang, plPlural(lemma, gender) ?? undefined, lemma, pos, "morph");
      addForm(index, lang, plLocative(lemma, gender) ?? undefined, lemma, pos, "morph");
      addForm(index, lang, plGenitive(lemma, gender, animate) ?? undefined, lemma, pos, "morph");
      addForm(index, lang, plGenitive(lemma, gender, true) ?? undefined, lemma, pos, "morph");
    }
    if (lang === "en") {
      addForm(index, lang, enPlural(lemma) ?? undefined, lemma, pos, "morph");
    }
    if (lang === "de") {
      const pl = DE_NOUN_PLURAL[lemma.toLocaleLowerCase("de-DE")];
      if (pl) addForm(index, lang, pl, lemma, pos, "morph");
    }
  }

  if (pos === "verb") {
    if (lang === "en") {
      addForm(index, lang, enPast(lemma) ?? undefined, lemma, pos, "morph");
      // 3sg present only — enPlural invents bogus forms (gos, bes, haves).
      addForm(index, lang, enThirdPerson(lemma) ?? undefined, lemma, pos, "morph");
    }
    if (lang === "pl") {
      for (const g of ["m", "f", "n"] as const) {
        addForm(index, lang, plPast(lemma, g, "sg") ?? undefined, lemma, pos, "morph");
      }
      addForm(index, lang, plPast(lemma, "m", "pl") ?? undefined, lemma, pos, "morph");
    }
    if (lang === "de") {
      addForm(index, lang, dePastParticiple(lemma) ?? undefined, lemma, pos, "morph");
      for (const [form, inf] of Object.entries(DE_PRETERITE)) {
        if (foldLemmaKey(inf, "de") === foldLemmaKey(lemma, "de")) {
          addForm(index, lang, form, lemma, pos, "morph");
        }
      }
    }
  }

  if (pos === "adjective" && lang === "pl") {
    for (const g of ["m", "f", "n"] as const) {
      addForm(index, lang, plAttrAdj(surface, g, "nom") ?? undefined, lemma, pos, "morph");
      addForm(index, lang, plAttrAdj(surface, g, "acc") ?? undefined, lemma, pos, "morph");
    }
  }
}

/** Build a reverse surface→lemma index from grammar.json (+ forward morph). */
export function buildLemmaIndex(grammar: GrammarFile): LemmaIndex {
  const index: LemmaIndex = new Map();
  for (const word of Object.values(grammar.words)) {
    for (const [code, surface] of Object.entries(word.langs)) {
      if (!surface?.lemma) continue;
      const lang = code as LangCode;
      indexSurfaceFields(index, lang, surface, word.pos, "grammar");
      indexDerivedMorph(index, lang, surface, word.pos);
    }
  }
  // Seed preterite map even when the infinitive is not in grammar.
  for (const [form, lemma] of Object.entries(DE_PRETERITE)) {
    addForm(index, "de", form, lemma, "verb", "morph");
  }
  return index;
}

/** Also treat bundled deck citation forms as lemmas (identity map). */
export function indexDeckCitations(index: LemmaIndex, deck: Entry[]): void {
  for (const entry of deck) {
    if (entry.custom) continue;
    for (const [code, form] of Object.entries(entry.forms)) {
      if (!form) continue;
      const lang = code as LangCode;
      const lemma = form.accepted[0]?.text?.trim() || form.text.trim();
      if (!lemma) continue;
      addForm(index, lang, form.text, lemma, entry.pos || "word", "deck");
      for (const row of form.accepted) {
        addForm(index, lang, row.text, lemma, entry.pos || "word", "deck");
      }
    }
  }
}

export function lookupLemma(
  index: LemmaIndex | null | undefined,
  lang: LangCode,
  surface: string,
): LemmaHit | null {
  if (!index) return null;
  const key = foldLemmaKey(surface, lang);
  if (!key) return null;
  return index.get(lang)?.get(key) ?? null;
}

/**
 * Resolve a typed surface to a citation lemma.
 * Prefer the static index; fall back to the surface itself.
 */
export function resolveLemma(
  lang: LangCode,
  surface: string,
  index?: LemmaIndex | null,
): { lemma: string; original: string; changed: boolean; hit: LemmaHit | null } {
  const original = surface.trim().replace(/\s+/g, " ");
  const hit = lookupLemma(index, lang, original);
  if (!hit) {
    return { lemma: original, original, changed: false, hit: null };
  }
  const changed = foldLemmaKey(hit.lemma, lang) !== foldLemmaKey(original, lang);
  return { lemma: hit.lemma, original, changed, hit };
}

let cachedGrammarIndex: LemmaIndex | null = null;
let grammarIndexPromise: Promise<LemmaIndex> | null = null;

/** Load grammar.json once and build the reverse lemma index (GitHub Pages safe). */
export async function loadLemmaIndex(
  loader: () => Promise<GrammarFile> = loadGrammar,
): Promise<LemmaIndex> {
  if (cachedGrammarIndex) return cachedGrammarIndex;
  if (!grammarIndexPromise) {
    grammarIndexPromise = loader()
      .then((grammar) => {
        cachedGrammarIndex = buildLemmaIndex(grammar);
        return cachedGrammarIndex;
      })
      .catch((error) => {
        grammarIndexPromise = null;
        throw error;
      });
  }
  return grammarIndexPromise;
}

/** Test helper — reset the module cache. */
export function resetLemmaIndexCache(): void {
  cachedGrammarIndex = null;
  grammarIndexPromise = null;
}

/** Same folded key used for duplicate detection of citation forms. */
export function citationFold(lang: LangCode, text: string): string {
  return foldLemmaKey(text, lang);
}

/** Prefer a known lemma for comparison when the index has one. */
export function canonicalCitation(
  lang: LangCode,
  text: string,
  index?: LemmaIndex | null,
): string {
  const resolved = resolveLemma(lang, text, index);
  return citationFold(lang, resolved.lemma);
}

/** True when two citation strings match after fold (+ optional lemma map). */
export function sameCitation(
  lang: LangCode,
  left: string,
  right: string,
  index?: LemmaIndex | null,
): boolean {
  return canonicalCitation(lang, left, index) === canonicalCitation(lang, right, index);
}

/** Normalize POS labels so "Noun" and "noun" collide. */
export function normalizePos(pos: string): string {
  return pos.trim().toLowerCase() || "word";
}

/** Best display string for a form (accepted[0] or card text). */
export function formCitation(form: { text: string; accepted: { text: string }[] } | undefined): string {
  if (!form) return "";
  return (form.accepted[0]?.text || form.text).trim();
}

/** Compare without requiring the lemma index (deck forms are already citation). */
export function formsMatchCitation(
  lang: LangCode,
  form: { text: string; accepted: { text: string }[] } | undefined,
  citation: string,
  index?: LemmaIndex | null,
): boolean {
  if (!form) return false;
  const target = canonicalCitation(lang, citation, index);
  if (!target) return false;
  if (canonicalCitation(lang, form.text, index) === target) return true;
  return form.accepted.some((row) => canonicalCitation(lang, row.text, index) === target);
}

/** Soft sync / duplicate key: pair + POS + folded citations for each pair language. */
export function duplicateContentKey(
  word: {
    pos: string;
    forms: Partial<Record<LangCode, { text: string; accepted: { text: string }[] }>>;
    pair?: readonly [LangCode, LangCode] | null;
  },
  index?: LemmaIndex | null,
): string | null {
  if (!word.pair) return null;
  const parts = word.pair.map((code) => {
    const citation = formCitation(word.forms[code]);
    return `${code}:${canonicalCitation(code, citation, index)}`;
  });
  if (parts.some((part) => part.endsWith(":"))) return null;
  return `${word.pair[0]}-${word.pair[1]}§${normalizePos(word.pos)}§${parts.join("§")}`;
}

/** Re-export normalizeAnswer for callers that still want accent-sensitive keys. */
export function sensitiveKey(text: string, lang?: LangCode): string {
  return normalizeAnswer(text, lang);
}
