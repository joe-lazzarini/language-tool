import { normalizeAnswer } from "../lib/match";
import type { LangCode } from "../lib/languages";
import { articleChoiceFlexible, stripArticlesForCompare } from "./articles";

const TRAILING = /[.!?。？！]+$/u;

/** Fold a whole sentence the way a typed translation is compared. */
export function foldSentence(value: string, lang: LangCode): string {
  const stripped = value
    .normalize("NFC")
    .replace(/[’‘ʼ']/g, "'")
    .trim()
    .replace(TRAILING, "")
    .trim();
  const folded = normalizeAnswer(stripped, lang);
  if (lang === "ja" || lang === "zh") return folded.replace(/[\s\u3000]+/g, "");
  return folded;
}

/**
 * Grade a typed translation. When the prompt language has no articles and the
 * answer language does, definite vs indefinite (and bare noun) are equivalent;
 * the reference answer shown on reveal is unchanged.
 */
export function isCorrectSentence(
  given: string,
  accepted: readonly string[],
  answerLang: LangCode,
  promptLang?: LangCode,
): boolean {
  const user = foldSentence(given, answerLang);
  if (!user) return false;
  const flexible = promptLang ? articleChoiceFlexible(promptLang, answerLang) : false;
  const userKey = flexible ? stripArticlesForCompare(user, answerLang) : user;
  if (!userKey) return false;
  return accepted.some((item) => {
    const folded = foldSentence(item, answerLang);
    const key = flexible ? stripArticlesForCompare(folded, answerLang) : folded;
    return key === userKey;
  });
}
