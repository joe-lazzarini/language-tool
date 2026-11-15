import type { LangCode } from "../lib/languages";

/** Built-in function words — never taken from the user's study vocab. */
export type ClosedClass = {
  and: string;
  but: string;
  or: string;
  because: string;
  when: string;
  if: string;
  who: string;
  that: string;
  which: string;
  not: string;
  /** Optional yes/no question particle / complementizer (Polish czy, Mandarin 吗). */
  qParticle?: string;
  /** Copula present 3sg (empty string = omit, e.g. Russian). */
  copula: string;
  copulaPast?: string;
  copulaFuture?: string;
  /** Adverbs of manner / time / place used as optional adjuncts. */
  adverbs: readonly string[];
  /** Prepositions that take a place/thing noun (language-specific case handled in morph). */
  prepositions: ReadonlyArray<{ key: string; form: string; case: "acc" | "dat" | "loc" | "nom" }>;
  /** Subject pronouns (optional generation; pro-drop langs may omit in alts). */
  pronouns: { he: string; she: string; it: string; they: string };
  /** German/Dutch-style indefinite article helpers when needed for alts. */
  space: boolean;
  period: string;
  /** Pro-drop: subject NP may be omitted in accepted alts when using pronouns. */
  proDrop: boolean;
  /** Free word order for grading bag-of-tokens compare. */
  freeWordOrder: boolean;
};

const LATIN_ADVERBS = ["often", "now", "here"] as const;

export const CLOSED_CLASS: Record<LangCode, ClosedClass> = {
  en: {
    and: "and",
    but: "but",
    or: "or",
    because: "because",
    when: "when",
    if: "if",
    who: "who",
    that: "that",
    which: "which",
    not: "not",
    copula: "is",
    copulaPast: "was",
    copulaFuture: "will be",
    adverbs: ["often", "now", "here"],
    prepositions: [
      { key: "in", form: "in", case: "acc" },
      { key: "on", form: "on", case: "acc" },
      { key: "at", form: "at", case: "acc" },
      { key: "with", form: "with", case: "acc" },
    ],
    pronouns: { he: "he", she: "she", it: "it", they: "they" },
    space: true,
    period: ".",
    proDrop: false,
    freeWordOrder: false,
  },
  pl: {
    and: "i",
    but: "ale",
    or: "lub",
    because: "bo",
    when: "kiedy",
    if: "jeśli",
    who: "który",
    that: "który",
    which: "który",
    not: "nie",
    qParticle: "czy",
    copula: "jest",
    copulaPast: "był",
    copulaFuture: "będzie",
    adverbs: ["często", "teraz", "tutaj"],
    prepositions: [
      { key: "in", form: "w", case: "loc" },
      { key: "on", form: "na", case: "loc" },
    ],
    pronouns: { he: "on", she: "ona", it: "ono", they: "oni" },
    space: true,
    period: ".",
    proDrop: true,
    freeWordOrder: true,
  },
  de: {
    and: "und",
    but: "aber",
    or: "oder",
    because: "weil",
    when: "wenn",
    if: "wenn",
    who: "der",
    that: "der",
    which: "der",
    not: "nicht",
    copula: "ist",
    copulaPast: "war",
    copulaFuture: "wird sein",
    adverbs: ["oft", "jetzt", "hier"],
    prepositions: [
      { key: "in", form: "in", case: "dat" },
      { key: "on", form: "auf", case: "dat" },
      { key: "with", form: "mit", case: "dat" },
    ],
    pronouns: { he: "er", she: "sie", it: "es", they: "sie" },
    space: true,
    period: ".",
    proDrop: false,
    freeWordOrder: false,
  },
  es: {
    and: "y",
    but: "pero",
    or: "o",
    because: "porque",
    when: "cuando",
    if: "si",
    who: "que",
    that: "que",
    which: "que",
    not: "no",
    copula: "es",
    copulaPast: "era",
    copulaFuture: "será",
    adverbs: ["a menudo", "ahora", "aquí"],
    prepositions: [
      { key: "in", form: "en", case: "acc" },
      { key: "with", form: "con", case: "acc" },
    ],
    pronouns: { he: "él", she: "ella", it: "ello", they: "ellos" },
    space: true,
    period: ".",
    proDrop: true,
    freeWordOrder: false,
  },
  fr: {
    and: "et",
    but: "mais",
    or: "ou",
    because: "parce que",
    when: "quand",
    if: "si",
    who: "qui",
    that: "qui",
    which: "qui",
    not: "ne pas",
    copula: "est",
    copulaPast: "était",
    copulaFuture: "sera",
    adverbs: ["souvent", "maintenant", "ici"],
    prepositions: [
      { key: "in", form: "dans", case: "acc" },
      { key: "with", form: "avec", case: "acc" },
    ],
    pronouns: { he: "il", she: "elle", it: "il", they: "ils" },
    space: true,
    period: ".",
    proDrop: false,
    freeWordOrder: false,
  },
  it: {
    and: "e",
    but: "ma",
    or: "o",
    because: "perché",
    when: "quando",
    if: "se",
    who: "che",
    that: "che",
    which: "che",
    not: "non",
    copula: "è",
    copulaPast: "era",
    copulaFuture: "sarà",
    adverbs: ["spesso", "ora", "qui"],
    prepositions: [
      { key: "in", form: "in", case: "acc" },
      { key: "with", form: "con", case: "acc" },
    ],
    pronouns: { he: "lui", she: "lei", it: "esso", they: "loro" },
    space: true,
    period: ".",
    proDrop: true,
    freeWordOrder: false,
  },
  pt: {
    and: "e",
    but: "mas",
    or: "ou",
    because: "porque",
    when: "quando",
    if: "se",
    who: "que",
    that: "que",
    which: "que",
    not: "não",
    copula: "é",
    copulaPast: "era",
    copulaFuture: "será",
    adverbs: ["frequentemente", "agora", "aqui"],
    prepositions: [
      { key: "in", form: "em", case: "acc" },
      { key: "with", form: "com", case: "acc" },
    ],
    pronouns: { he: "ele", she: "ela", it: "ele", they: "eles" },
    space: true,
    period: ".",
    proDrop: true,
    freeWordOrder: false,
  },
  nl: {
    and: "en",
    but: "maar",
    or: "of",
    because: "omdat",
    when: "wanneer",
    if: "als",
    who: "die",
    that: "die",
    which: "die",
    not: "niet",
    copula: "is",
    copulaPast: "was",
    copulaFuture: "zal zijn",
    adverbs: ["vaak", "nu", "hier"],
    prepositions: [
      { key: "in", form: "in", case: "acc" },
      { key: "with", form: "met", case: "acc" },
    ],
    pronouns: { he: "hij", she: "zij", it: "het", they: "zij" },
    space: true,
    period: ".",
    proDrop: false,
    freeWordOrder: false,
  },
  ru: {
    and: "и",
    but: "но",
    or: "или",
    because: "потому что",
    when: "когда",
    if: "если",
    who: "который",
    that: "который",
    which: "который",
    not: "не",
    copula: "",
    copulaPast: "был",
    copulaFuture: "будет",
    adverbs: ["часто", "сейчас", "здесь"],
    prepositions: [
      { key: "in", form: "в", case: "loc" },
      { key: "on", form: "на", case: "loc" },
      { key: "with", form: "с", case: "acc" },
    ],
    pronouns: { he: "он", she: "она", it: "оно", they: "они" },
    space: true,
    period: ".",
    proDrop: true,
    freeWordOrder: true,
  },
  ja: {
    and: "そして",
    but: "が",
    or: "または",
    because: "から",
    when: "とき",
    if: "もし",
    who: "誰",
    that: "の",
    which: "の",
    not: "ない",
    copula: "です",
    adverbs: ["よく", "今", "ここ"],
    prepositions: [
      { key: "in", form: "で", case: "nom" },
      { key: "with", form: "と", case: "nom" },
    ],
    pronouns: { he: "彼", she: "彼女", it: "それ", they: "彼ら" },
    space: false,
    period: "。",
    proDrop: true,
    freeWordOrder: false,
  },
  zh: {
    and: "和",
    but: "但是",
    or: "或者",
    because: "因为",
    when: "当",
    if: "如果",
    who: "的",
    that: "的",
    which: "的",
    not: "不",
    qParticle: "吗",
    copula: "是",
    adverbs: ["经常", "现在", "这里"],
    prepositions: [
      { key: "in", form: "在", case: "nom" },
      { key: "with", form: "和", case: "nom" },
    ],
    pronouns: { he: "他", she: "她", it: "它", they: "他们" },
    space: false,
    period: "。",
    proDrop: true,
    freeWordOrder: false,
  },
};

export function closedClass(lang: LangCode): ClosedClass {
  return CLOSED_CLASS[lang];
}

/** Map English adverb index onto the language list (same slot). */
export function pickAdverb(lang: LangCode, rng: () => number): string {
  const list = closedClass(lang).adverbs;
  return list[Math.floor(rng() * list.length)] ?? list[0]!;
}

export function pickPrep(
  lang: LangCode,
  rng: () => number,
): { key: string; form: string; case: "acc" | "dat" | "loc" | "nom" } {
  const list = closedClass(lang).prepositions;
  return list[Math.floor(rng() * list.length)] ?? list[0]!;
}

void LATIN_ADVERBS;
