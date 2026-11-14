import { normalizeAnswer } from "../lib/match";
import type { LangCode } from "../lib/languages";

const TRAILING = /[.!?。？！]+$/u;

/** Fold a whole sentence the way a typed translation is compared. */
export function foldSentence(value: string, lang: LangCode): string {
  const stripped = value
    .normalize("NFC")
    .replace(/[’‘ʼ]/g, "'")
    .trim()
    .replace(TRAILING, "")
    .trim();
  const folded = normalizeAnswer(stripped, lang);
  if (lang === "ja" || lang === "zh") return folded.replace(/[\s\u3000]+/g, "");
  return folded;
}

export function isCorrectSentence(given: string, accepted: readonly string[], lang: LangCode): boolean {
  const user = foldSentence(given, lang);
  if (!user) return false;
  return accepted.some((item) => foldSentence(item, lang) === user);
}
