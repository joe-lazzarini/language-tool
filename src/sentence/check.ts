import { normalizeAnswer } from "../lib/match";
import type { LangCode } from "../lib/languages";
import { articleChoiceFlexible, stripArticlesForCompare } from "./articles";
import { closedClass } from "./closedClass";

const TRAILING = /[.!?。？！]+$/u;

const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwasn't\b/g, "was not"],
  [/\bweren't\b/g, "were not"],
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "cannot"],
  [/\bcannot\b/g, "cannot"],
  [/\bi'm\b/g, "i am"],
  [/\byou're\b/g, "you are"],
  [/\bhe's\b/g, "he is"],
  [/\bshe's\b/g, "she is"],
  [/\bit's\b/g, "it is"],
  [/\bwe're\b/g, "we are"],
  [/\bthey're\b/g, "they are"],
  [/\blet's\b/g, "let us"],
];

/** Fold a whole sentence the way a typed translation is compared. */
export function foldSentence(value: string, lang: LangCode): string {
  let stripped = value
    .normalize("NFC")
    .replace(/[’‘ʼ']/g, "'")
    .trim()
    .replace(TRAILING, "")
    .trim();
  if (lang === "en") {
    const lower = stripped.toLowerCase();
    let expanded = lower;
    for (const [re, repl] of CONTRACTIONS) expanded = expanded.replace(re, repl);
    stripped = expanded;
  }
  const folded = normalizeAnswer(stripped, lang);
  if (lang === "ja" || lang === "zh") return folded.replace(/[\s\u3000]+/g, "");
  return folded;
}

function tokenize(folded: string, lang: LangCode): string[] {
  if (lang === "zh" || lang === "ja") {
    // Character-level tokens for CJK when spaces are absent.
    return [...folded].filter((ch) => ch.trim());
  }
  return folded.split(/\s+/).filter(Boolean);
}

function sortedJoin(tokens: string[]): string {
  return [...tokens].sort((a, b) => a.localeCompare(b)).join(" ");
}

function keysForCompare(
  folded: string,
  lang: LangCode,
  flexibleArticles: boolean,
): { strict: string; bag: string; tokens: string[] } {
  const base = flexibleArticles ? stripArticlesForCompare(folded, lang) : folded;
  const tokens = tokenize(base, lang);
  return {
    strict: base,
    bag: sortedJoin(tokens),
    tokens,
  };
}

/**
 * Grade a typed translation. When the prompt language has no articles and the
 * answer language does, definite vs indefinite (and bare noun) are equivalent.
 * Polish/Russian also accept free word-order permutations of the same tokens.
 * Morphology must still match — a wrong ending fails.
 */
export function isCorrectSentence(
  given: string,
  accepted: readonly string[],
  answerLang: LangCode,
  promptLang?: LangCode,
): boolean {
  return gradeSentence(given, accepted, answerLang, promptLang).correct;
}

export type GradePart = { text: string; ok: boolean; sep?: string };

export type GradeResult = {
  correct: boolean;
  reference: string;
  /** Highlighted reference tokens vs the user's answer (ok=false = mismatch). */
  parts: GradePart[];
};

/**
 * Grade and, on failure, align the user answer to the first reference so wrong
 * endings / words can be highlighted on reveal.
 */
export function gradeSentence(
  given: string,
  accepted: readonly string[],
  answerLang: LangCode,
  promptLang?: LangCode,
): GradeResult {
  const user = foldSentence(given, answerLang);
  const reference = accepted[0] ?? "";
  if (!user) {
    return {
      correct: false,
      reference,
      parts: tokenizeDisplay(reference, answerLang).map((text) => ({ text, ok: false })),
    };
  }
  const flexible = promptLang ? articleChoiceFlexible(promptLang, answerLang) : false;
  const free = closedClass(answerLang).freeWordOrder;
  const userKeys = keysForCompare(user, answerLang, flexible);

  for (const item of accepted) {
    const folded = foldSentence(item, answerLang);
    const key = keysForCompare(folded, answerLang, flexible);
    if (key.strict === userKeys.strict) {
      return {
        correct: true,
        reference: accepted[0] ?? item,
        parts: tokenizeDisplay(accepted[0] ?? item, answerLang).map((text) => ({ text, ok: true })),
      };
    }
    if (free && key.bag === userKeys.bag && key.tokens.length === userKeys.tokens.length) {
      return {
        correct: true,
        reference: accepted[0] ?? item,
        parts: tokenizeDisplay(accepted[0] ?? item, answerLang).map((text) => ({ text, ok: true })),
      };
    }
  }

  // Wrong — highlight mismatches against the canonical reference.
  const refFolded = foldSentence(reference, answerLang);
  const refKeys = keysForCompare(refFolded, answerLang, flexible);
  const userSet = new Map<string, number>();
  for (const token of userKeys.tokens) userSet.set(token, (userSet.get(token) ?? 0) + 1);

  const displayTokens = tokenizeDisplay(reference, answerLang);
  const foldedDisplay = tokenize(refKeys.strict, answerLang);
  const parts: GradePart[] = displayTokens.map((text, i) => {
    const foldedToken = foldedDisplay[i] ?? foldSentence(text, answerLang);
    const count = userSet.get(foldedToken) ?? 0;
    if (count > 0) {
      userSet.set(foldedToken, count - 1);
      return { text, ok: true };
    }
    return { text, ok: false };
  });

  return { correct: false, reference, parts };
}

/** Split a reference sentence into display tokens (keep original casing). */
export function tokenizeDisplay(sentence: string, lang: LangCode): string[] {
  const trimmed = sentence.replace(TRAILING, "").trim();
  if (lang === "zh" || lang === "ja") return [...trimmed].filter((ch) => ch.trim());
  return trimmed.split(/\s+/).filter(Boolean);
}
