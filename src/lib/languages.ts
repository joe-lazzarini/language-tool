import type { LangCode, LanguageInfo } from "../types";

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "de", name: "German", nativeName: "Deutsch" },
];

export const LANG_CODES = LANGUAGES.map((item) => item.code);

export const SPECIAL_LETTERS: Partial<Record<LangCode, readonly string[]>> = {
  pl: ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"],
  de: ["ä", "ö", "ü", "ß"],
};

const byCode = Object.fromEntries(LANGUAGES.map((item) => [item.code, item])) as Record<
  LangCode,
  LanguageInfo
>;

export function isLangCode(value: string): value is LangCode {
  return value === "en" || value === "pl" || value === "de";
}

export function languageName(code: LangCode): string {
  return byCode[code].name;
}

export function pairLabel(from: LangCode, to: LangCode): string {
  return `${languageName(from)} → ${languageName(to)}`;
}

export function pairHint(from: LangCode, to: LangCode): string {
  return `See the ${languageName(from)} prompt and type the ${languageName(to)} word.`;
}

export function answerPlaceholder(to: LangCode): string {
  return `Type the ${languageName(to)} word`;
}
