import type { LangCode } from "../lib/languages";
import { closedClass } from "./closedClass";
import {
  germanArticle,
  germanAttrAdj,
  nounHead,
  plAttrAdj,
  predicativeAdj,
} from "./morph";
import type { Case, Gender, GramNumber, LangSurface, SlotWord } from "./types";

export type NpSpec = {
  noun: SlotWord;
  side: "prompt" | "answer";
  role: Case;
  number?: GramNumber;
  attr?: SlotWord;
  animate?: boolean;
  /** Prefer indefinite article when the language has one (for variant generation). */
  indefinite?: boolean;
};

function surfaceOf(word: SlotWord, side: "prompt" | "answer"): LangSurface {
  return side === "prompt" ? word.prompt : word.answer;
}

function startsWithVowelSound(lemma: string): boolean {
  return /^[aeiouáéíóúàèìòùâêîôûäëïöüœæ]/i.test(lemma);
}

function enArticle(lemma: string, indefinite: boolean): string {
  if (!indefinite) return "the";
  return /^[aeiou]/i.test(lemma) ? "an" : "a";
}

/**
 * Build a full noun phrase (article + optional attributive adj + noun).
 * Returns null when a required inflected form is missing.
 */
export function renderNp(lang: LangCode, spec: NpSpec): string | null {
  const surface = surfaceOf(spec.noun, spec.side);
  const number = spec.number ?? "sg";
  const gender = (surface.gender ?? "n") as Gender;
  const role = spec.role;
  const animate = spec.animate === true;

  // Prefer stored ready-made phrases when no attributive adj and singular.
  if (!spec.attr && number === "sg") {
    if (role === "nom" && surface.npNom && !spec.indefinite) return surface.npNom;
    if (role === "acc" && surface.npAcc && !spec.indefinite) return surface.npAcc;
  }

  const head = nounHead(lang, surface, role === "loc" || role === "dat" || role === "gen" ? role : role, {
    number,
    animate,
  });
  if (!head) return null;

  let adjText: string | null = null;
  if (spec.attr) {
    const adjSurface = surfaceOf(spec.attr, spec.side);
    adjText = attributiveAdj(lang, adjSurface, gender, role, number);
    if (!adjText) return null;
  }

  switch (lang) {
    case "en":
      return joinEn(head, adjText, enArticle(surface.lemma, spec.indefinite === true));
    case "de":
      return joinDe(head, adjText, gender, role, number, spec.indefinite === true);
    case "pl":
    case "ru":
      return joinBare(head, adjText, true);
    case "zh":
      return joinZh(head, adjText);
    case "ja":
      return joinJa(head, adjText, role);
    case "es":
      return joinRomance(head, adjText, gender, role, animate, "es", spec.indefinite === true);
    case "fr":
      return joinFr(head, adjText, gender, spec.indefinite === true);
    case "it":
      return joinIt(head, adjText, gender, spec.indefinite === true);
    case "pt":
      return joinPt(head, adjText, gender, spec.indefinite === true);
    case "nl":
      return joinNl(head, adjText, gender, surface, number, spec.indefinite === true);
    default:
      return joinBare(head, adjText, closedClass(lang).space);
  }
}

function attributiveAdj(
  lang: LangCode,
  surface: LangSurface,
  gender: Gender,
  role: Case,
  number: GramNumber,
): string | null {
  if (lang === "pl") return plAttrAdj(surface, gender, role, number);
  if (lang === "de") {
    const lemma = surface.lemma;
    if (!lemma) return null;
    return germanAttrAdj(lemma, gender, role, number);
  }
  if (lang === "en" || lang === "zh" || lang === "ja" || lang === "nl") {
    return surface.lemma || surface.m || null;
  }
  if (lang === "ru") {
    // Use predicative gender form as attributive for nominative/accusative when available.
    if (role === "nom" || role === "acc") return predicativeAdj(surface, gender);
    return null;
  }
  // Romance: use gender form; postnominal placement handled by joiners.
  return predicativeAdj(surface, gender === "n" ? "m" : gender);
}

function joinEn(head: string, adj: string | null, article: string): string {
  return adj ? `${article} ${adj} ${head}` : `${article} ${head}`;
}

function joinDe(
  head: string,
  adj: string | null,
  gender: Gender,
  role: Case,
  number: GramNumber,
  indefinite: boolean,
): string | null {
  const word = head.charAt(0).toLocaleUpperCase("de-DE") + head.slice(1);
  if (indefinite) {
    // Only singular indefinite; skip if we would need complex strong endings without article.
    let art = "ein";
    if (gender === "f") art = role === "acc" || role === "nom" ? "eine" : "einer";
    else if (gender === "m" && role === "acc") art = "einen";
    else if (gender === "m" && (role === "dat" || role === "gen")) art = "einem";
    else if (gender === "n" && (role === "dat" || role === "gen")) art = "einem";
    // Strong adjective endings after ein- are error-prone; require no adj for indefinite alts.
    if (adj) return null;
    return `${art} ${word}`;
  }
  const art = germanArticle(gender, role, number);
  if (!art) return null;
  return adj ? `${art} ${adj} ${word}` : `${art} ${word}`;
}

function joinBare(head: string, adj: string | null, spaced: boolean): string {
  if (!adj) return head;
  return spaced ? `${adj} ${head}` : `${adj}${head}`;
}

function joinZh(head: string, adj: string | null): string {
  if (!adj) return head;
  return `${adj}的${head}`;
}

function joinJa(head: string, adj: string | null, role: Case): string {
  const core = adj ? `${adj}${head}` : head;
  void role;
  return core;
}

function joinRomance(
  head: string,
  adj: string | null,
  gender: Gender,
  role: Case,
  animate: boolean,
  lang: "es",
  indefinite: boolean,
): string {
  const art = indefinite
    ? gender === "f"
      ? "una"
      : "un"
    : gender === "f"
      ? "la"
      : "el";
  let phrase = adj ? `${art} ${head} ${adj}` : `${art} ${head}`;
  if (lang === "es" && role === "acc" && animate && !indefinite) {
    phrase = gender === "f" ? `a la ${adj ? `${head} ${adj}` : head}` : `al ${adj ? `${head} ${adj}` : head}`;
  }
  return phrase;
}

function joinFr(head: string, adj: string | null, gender: Gender, indefinite: boolean): string {
  let art: string;
  if (indefinite) art = gender === "f" ? "une" : "un";
  else if (startsWithVowelSound(head) || head.toLowerCase().startsWith("h")) art = "l'";
  else art = gender === "f" ? "la " : "le ";
  const prefix = art.endsWith("'") ? art : art;
  const nounBit = art.endsWith("'") ? `${art}${head}` : `${art}${head}`.replace(/\s+/g, " ");
  // Fix double space when art already has space
  const base = art.endsWith("'") ? `${art}${head}` : `${prefix.trim()} ${head}`;
  return adj ? `${base} ${adj}` : base;
  void nounBit;
}

function joinIt(head: string, adj: string | null, gender: Gender, indefinite: boolean): string {
  const lower = head.toLowerCase();
  let art: string;
  if (indefinite) {
    art = gender === "f" ? "una" : startsWithVowelSound(head) ? "un" : /^(z|gn|ps|pn|x|y|s[^aeiou])/i.test(lower) ? "uno" : "un";
  } else if (startsWithVowelSound(head)) art = "l'";
  else if (gender === "f") art = "la";
  else if (/^(z|gn|ps|pn|x|y|s[^aeiouáéíóú])/i.test(lower)) art = "lo";
  else art = "il";
  const base = art.endsWith("'") ? `${art}${head}` : `${art} ${head}`;
  return adj ? `${base} ${adj}` : base;
}

function joinPt(head: string, adj: string | null, gender: Gender, indefinite: boolean): string {
  const art = indefinite ? (gender === "f" ? "uma" : "um") : gender === "f" ? "a" : "o";
  const base = `${art} ${head}`;
  return adj ? `${base} ${adj}` : base;
}

function joinNl(
  head: string,
  adj: string | null,
  gender: Gender,
  surface: LangSurface,
  number: GramNumber,
  indefinite: boolean,
): string | null {
  // Prefer stored np when no adj.
  if (!adj && number === "sg" && !indefinite) {
    if (surface.npNom) return surface.npNom;
  }
  const art = indefinite ? "een" : gender === "n" ? "het" : "de";
  // Without reliable de/het, skip when gender unknown — gender is required by vocab.
  const base = `${art} ${head}`;
  return adj ? `${art} ${adj}e ${head}` : base;
}

/** Predicative adjective text for copular clauses. */
export function renderPredAdj(_lang: LangCode, word: SlotWord, side: "prompt" | "answer", gender: Gender): string | null {
  void _lang;
  return predicativeAdj(surfaceOf(word, side), gender);
}
