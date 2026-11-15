import { languageByCode, type LangCode } from "../lib/languages";
import type { Gender, LangSurface, SentenceFrame, SentencePack } from "./types";

function capitalize(text: string, lang: LangCode): string {
  const chars = [...text];
  if (chars.length === 0) return text;
  chars[0] = chars[0]!.toLocaleUpperCase(languageByCode(lang).locale);
  return chars.join("");
}

function fill(pattern: string, slots: Record<string, string>): string | null {
  let missing = false;
  const text = pattern.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = slots[key];
    if (!value) {
      missing = true;
      return "";
    }
    return value;
  });
  if (missing || text.includes("{")) return null;
  return text;
}

function startsWithVowelSound(lemma: string): boolean {
  return /^[aeiouáéíóúàèìòùâêîôûäëïöüœæ]/i.test(lemma);
}

/** Build a nominative or accusative noun phrase, preferring stored overrides. */
export function nounPhrase(
  lang: LangCode,
  surface: LangSurface,
  role: "nom" | "acc",
  opts: { animateObject?: boolean } = {},
): string | null {
  if (role === "nom" && surface.npNom) return surface.npNom;
  if (role === "acc" && surface.npAcc) return surface.npAcc;
  const lemma = (role === "acc" ? surface.acc || surface.lemma : surface.lemma)?.trim();
  if (!lemma) return null;
  const gender = surface.gender ?? "n";

  switch (lang) {
    case "en":
      return `the ${lemma}`;
    case "de":
      return germanNp(lemma, gender, role);
    case "es":
      return spanishNp(lemma, gender, role, opts.animateObject === true);
    case "fr":
      return frenchNp(lemma, gender);
    case "it":
      return italianNp(lemma, gender);
    case "pt":
      return gender === "f" ? `a ${lemma}` : `o ${lemma}`;
    case "nl":
      // Without de/het metadata, skip — callers require a stored np or gender map.
      return null;
    case "pl":
    case "ru":
    case "ja":
    case "zh":
      return lemma;
    default:
      return lemma;
  }
}

function germanNp(lemma: string, gender: Gender, role: "nom" | "acc"): string {
  const word = lemma.charAt(0).toLocaleUpperCase("de-DE") + lemma.slice(1);
  if (role === "acc" && gender === "m") return `den ${word}`;
  if (gender === "f") return `die ${word}`;
  if (gender === "n") return `das ${word}`;
  return `der ${word}`;
}

function spanishNp(lemma: string, gender: Gender, role: "nom" | "acc", animateObject: boolean): string {
  const article = gender === "f" ? "la" : "el";
  if (role === "acc" && animateObject) {
    return gender === "f" ? `a la ${lemma}` : `al ${lemma}`;
  }
  return `${article} ${lemma}`;
}

function frenchNp(lemma: string, gender: Gender): string {
  if (startsWithVowelSound(lemma) || lemma.toLowerCase().startsWith("h")) return `l'${lemma}`;
  return gender === "f" ? `la ${lemma}` : `le ${lemma}`;
}

function italianNp(lemma: string, gender: Gender): string {
  const lower = lemma.toLowerCase();
  if (startsWithVowelSound(lemma)) return `l'${lemma}`;
  if (gender === "f") return `la ${lemma}`;
  if (/^(z|gn|ps|pn|x|y|s[^aeiouáéíóú])/i.test(lower)) return `lo ${lemma}`;
  return `il ${lemma}`;
}

export function adjForm(surface: LangSurface, gender: Gender): string | null {
  const text = surface[gender] || surface.lemma;
  return text?.trim() || null;
}

export function verbForm(surface: LangSurface): { form: string; alts: string[] } | null {
  const form = surface.fin?.trim();
  if (!form) return null;
  return { form, alts: surface.alts ?? [] };
}

export function renderFrame(
  pack: SentencePack,
  lang: LangCode,
  frame: SentenceFrame,
  slots: Record<string, string>,
): string | null {
  const text = fill(pack.frames[frame], slots);
  return text ? capitalize(text, lang) : null;
}

export function renderAccepted(
  pack: SentencePack,
  lang: LangCode,
  frame: SentenceFrame,
  slots: Record<string, string>,
  verbAlts: string[],
): string[] {
  const patterns = [pack.frames[frame]];
  if (frame === "adj" && pack.frames.adjPlain) patterns.push(pack.frames.adjPlain);
  const out: string[] = [];
  for (const pattern of patterns) {
    const canonical = fill(pattern, slots);
    if (canonical) out.push(capitalize(canonical, lang));
    for (const alt of verbAlts) {
      const next = fill(pattern, { ...slots, verb: alt });
      if (next) out.push(capitalize(next, lang));
    }
  }
  return [...new Set(out)];
}
