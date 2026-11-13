import { languageByCode, type LangCode } from "./languages";
import type { AcceptedAnswer } from "../types";

export type AnswerLike = string | AcceptedAnswer;

const DEFAULT_PREFIXES = ["to ", "a ", "an ", "the "] as const;

export function answerText(item: AnswerLike): string {
  return typeof item === "string" ? item : item.text;
}

/** Case-insensitive, Unicode-normalized comparison with trimmed whitespace.
 *  The default locale is pl-PL, which also lowercases German ä ö ü.
 *  Pass a language to apply that language's diacritic rules.
 */
export function normalizeAnswer(value: string, lang?: LangCode): string {
  const locale = lang ? languageByCode(lang).locale : "pl-PL";
  let next = value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  if (!lang) return next;
  const info = languageByCode(lang);
  next = applyDiacritics(next, info.diacritics);
  const folds: readonly (readonly [string, string])[] = info.foldChars;
  for (const [from, to] of folds) {
    if (from) next = next.replaceAll(from, to);
  }
  return next;
}

function applyDiacritics(value: string, mode: "required" | "strip-latin" | "strip"): string {
  if (mode === "required") return value;
  let out = "";
  for (const ch of value.normalize("NFD")) {
    if (/\p{M}/u.test(ch)) {
      if (mode === "strip") continue;
      const base = [...out].at(-1) ?? "";
      if (base && /\p{Script=Latin}/u.test(base)) continue;
    }
    out += ch;
  }
  return out.normalize("NFC");
}

function prefixesFor(lang?: LangCode): readonly string[] {
  if (!lang) return DEFAULT_PREFIXES;
  return languageByCode(lang).optionalPrefixes;
}

function addTarget(targets: Set<string>, raw: string, lang?: LangCode): void {
  const n = normalizeAnswer(raw, lang);
  if (!n) return;
  targets.add(n);
  for (const prefix of prefixesFor(lang)) {
    if (n.startsWith(prefix) && n.length > prefix.length) {
      targets.add(n.slice(prefix.length));
    }
  }
}

/** Every string that should count as a correct typed answer. */
export function matchingTargets(expected: string, accepted: AnswerLike[] = [], lang?: LangCode): Set<string> {
  const targets = new Set<string>();
  addTarget(targets, expected, lang);
  for (const item of accepted) addTarget(targets, answerText(item), lang);
  return targets;
}

export function isCorrectAnswer(
  given: string,
  expected: string,
  accepted: AnswerLike[] = [],
  lang?: LangCode,
): boolean {
  const user = normalizeAnswer(given, lang);
  if (!user) return false;
  return matchingTargets(expected, accepted, lang).has(user);
}
