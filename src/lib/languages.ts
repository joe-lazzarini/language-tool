/**
 * Supported languages. Adding one is a new object in this list plus deck data
 * (`npm run translations` and `npm run deck`). Keep `code`, `name`, `nativeName`,
 * `wiktionary`, and `wiktionaryAliases` as the first fields, in that order:
 * the deck build reads them from this file.
 *
 * `diacritics`:
 * - `required` — typed answers must include the marks (Polish ł, German ö)
 * - `strip-latin` — ignore marks on Latin letters only (romaji macrons; kana stays intact)
 * - `strip` — ignore combining marks (Russian stress, and ё matches е)
 *
 * `foldChars` is applied after lowercasing for substitutions that are not
 * combining marks (leave empty unless a language needs one).
 * `pivot` marks the Wiktionary gloss language. Only one language should set it.
 */
export const LANGUAGES = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    wiktionary: "English",
    wiktionaryAliases: [],
    flag: "🇬🇧",
    locale: "en-US",
    specialLetters: [],
    optionalPrefixes: ["to ", "a ", "an ", "the "],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: true,
    answerHint: "",
  },
  {
    code: "pl",
    name: "Polish",
    nativeName: "Polski",
    wiktionary: "Polish",
    wiktionaryAliases: [],
    flag: "🇵🇱",
    locale: "pl-PL",
    specialLetters: ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    wiktionary: "German",
    wiktionaryAliases: [],
    flag: "🇩🇪",
    locale: "de-DE",
    specialLetters: ["ä", "ö", "ü", "ß"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: true,
    pivot: false,
    answerHint: "",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    wiktionary: "Spanish",
    wiktionaryAliases: [],
    flag: "🇪🇸",
    locale: "es-ES",
    specialLetters: ["á", "é", "í", "ó", "ú", "ü", "ñ"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    wiktionary: "French",
    wiktionaryAliases: [],
    flag: "🇫🇷",
    locale: "fr-FR",
    specialLetters: ["à", "â", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "ù", "û", "ü", "œ"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    wiktionary: "Italian",
    wiktionaryAliases: [],
    flag: "🇮🇹",
    locale: "it-IT",
    specialLetters: ["à", "è", "é", "ì", "ò", "ó", "ù"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    wiktionary: "Portuguese",
    wiktionaryAliases: ["Brazilian Portuguese"],
    flag: "🇵🇹",
    locale: "pt-PT",
    specialLetters: ["á", "à", "â", "ã", "ç", "é", "ê", "í", "ó", "ô", "õ", "ú"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "nl",
    name: "Dutch",
    nativeName: "Nederlands",
    wiktionary: "Dutch",
    wiktionaryAliases: [],
    flag: "🇳🇱",
    locale: "nl-NL",
    specialLetters: ["é", "ë", "ï", "ó", "ö", "ü"],
    optionalPrefixes: [],
    diacritics: "required",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "",
  },
  {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    wiktionary: "Russian",
    wiktionaryAliases: [],
    flag: "🇷🇺",
    locale: "ru-RU",
    specialLetters: [],
    optionalPrefixes: [],
    diacritics: "strip",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "Cyrillic or Latin letters. Stress marks are ignored, and ё counts as е.",
  },
  {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    wiktionary: "Japanese",
    wiktionaryAliases: [],
    flag: "🇯🇵",
    locale: "ja-JP",
    specialLetters: [],
    optionalPrefixes: [],
    diacritics: "strip-latin",
    foldChars: [],
    capitalizeLookup: false,
    pivot: false,
    answerHint: "Japanese script or romaji. Macrons are optional (kyō = kyo). Use your keyboard for kana.",
  },
] as const;

export type LanguageInfo = (typeof LANGUAGES)[number];
export type LangCode = LanguageInfo["code"];
export type DiacriticsMode = LanguageInfo["diacritics"];

const byCode = Object.fromEntries(LANGUAGES.map((item) => [item.code, item])) as Record<
  LangCode,
  LanguageInfo
>;

export const LANG_CODES: readonly LangCode[] = LANGUAGES.map((item) => item.code);

export const SPECIAL_LETTERS: Partial<Record<LangCode, readonly string[]>> = Object.fromEntries(
  LANGUAGES.filter((item) => item.specialLetters.length > 0).map((item) => [item.code, item.specialLetters]),
);

export function isLangCode(value: string): value is LangCode {
  return Object.prototype.hasOwnProperty.call(byCode, value);
}

export function languageByCode(code: LangCode): LanguageInfo {
  return byCode[code];
}

export function languageName(code: LangCode): string {
  return byCode[code].name;
}

export function languageOptionLabel(info: LanguageInfo): string {
  return `${info.flag} ${info.nativeName} · ${info.name}`;
}

/** Another language, used when the two pickers would otherwise match. */
export function otherLanguage(code: LangCode): LangCode {
  return LANG_CODES.find((item) => item !== code) ?? LANG_CODES[0];
}

export function pivotLanguage(): LangCode | undefined {
  return LANGUAGES.find((item) => item.pivot)?.code;
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
