import { languageHasArticles, type LangCode } from "../lib/languages";

/**
 * Leading article tokens stripped when the prompt language cannot express
 * definiteness. Keep content words strict; only these grammar words flex.
 */
const ARTICLE_TOKENS: Partial<Record<LangCode, readonly string[]>> = {
  en: ["the", "a", "an"],
  de: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines"],
  es: ["el", "la", "los", "las", "un", "una", "unos", "unas", "al"],
  fr: ["le", "la", "les", "un", "une", "des", "l"],
  it: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "l"],
  pt: ["o", "a", "os", "as", "um", "uma", "uns", "umas"],
  nl: ["de", "het", "een"],
};

/**
 * True when the prompt side has no articles and the answer side does.
 * In that direction, definite vs indefinite (and bare noun) must not be marked wrong.
 */
export function articleChoiceFlexible(promptLang: LangCode, answerLang: LangCode): boolean {
  return !languageHasArticles(promptLang) && languageHasArticles(answerLang);
}

/**
 * Fold a sentence for comparison when article choice is flexible: drop leading
 * article tokens before content words, and French/Italian l' clitics.
 * Everything else (nouns, verbs, agreement endings) stays.
 */
export function stripArticlesForCompare(folded: string, lang: LangCode): string {
  const tokens = ARTICLE_TOKENS[lang];
  if (!tokens || !folded) return folded;
  const set = new Set(tokens);
  const parts = folded.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    // French / Italian elision: l'eau → eau
    if ((lang === "fr" || lang === "it") && /^l'/i.test(part) && part.length > 2) {
      out.push(part.slice(2));
      continue;
    }
    if (set.has(part)) continue;
    out.push(part);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
