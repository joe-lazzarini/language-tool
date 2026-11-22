import type { LangCode } from "../lib/languages";

export type Sem = "person" | "animal" | "place" | "thing" | "food" | "drink" | "readable";

/**
 * Light adjective–noun compatibility domains.
 * Adjectives list what they modify; nouns list what they accept.
 * `open` on an adjective means unconstrained; nouns never need `open`.
 */
export type AdjDomain =
  | "human"
  | "physical"
  | "taste"
  | "nationality"
  | "evaluative"
  | "temporal"
  | "open";

export type Gender = "m" | "f" | "n";

/** Legacy single-clause shapes kept as structure tags; compositional ids are richer. */
export type SentenceFrame = string;

export type SentenceFrames = {
  vi: string;
  vt: string;
  adj: string;
  /** Extra accepted pattern, used for the Japanese adjective without です. */
  adjPlain?: string;
};

/**
 * Per-language pack. Frames remain as simple-clause fallbacks / documentation;
 * the compositional generator uses closed-class data and language renderers.
 */
export type SentencePack = {
  frames: SentenceFrames;
};

/** Per-language surface data for one study word. */
export type LangSurface = {
  lemma: string;
  gender?: Gender;
  /** Bare accusative lemma when different from nominative. */
  acc?: string;
  /** Bare genitive / dative / locative when known (skip slot if needed and missing). */
  gen?: string;
  dat?: string;
  loc?: string;
  /** Plural nominative when known. */
  pl?: string;
  plAcc?: string;
  /** Ready-made noun phrases (include article when the language has one). */
  npNom?: string;
  npAcc?: string;
  /** Finite 3rd-person singular (or polite Japanese) verb form — present. */
  fin?: string;
  /** Past / future finite forms when reliable; otherwise morphology derives or skips. */
  past?: string;
  pastM?: string;
  pastF?: string;
  pastN?: string;
  pastPl?: string;
  future?: string;
  /** Infinitive / bare stem helpers. */
  inf?: string;
  participle?: string;
  alts?: string[];
  /** Predicative adjective forms by subject gender. */
  m?: string;
  f?: string;
  n?: string;
  /** Attributive adjective overrides by case/gender when rules are unsafe. */
  attrNomM?: string;
  attrNomF?: string;
  attrNomN?: string;
  attrAccM?: string;
  attrAccF?: string;
  attrAccN?: string;
};

export type GrammarWord = {
  pos: "noun" | "verb" | "adjective";
  concept?: string;
  sem?: Sem[];
  /** Adjective domains, or noun-accepted domains for adj compatibility. */
  domains?: AdjDomain[];
  valence?: "vi" | "vt";
  subject?: Sem[];
  object?: Sem[];
  langs: Partial<Record<LangCode, LangSurface>>;
};

export type GrammarFile = {
  version: number;
  words: Record<string, GrammarWord>;
};

/** A study card that can fill sentence slots for the current pair. */
export type SlotWord = {
  id: string;
  pos: "noun" | "verb" | "adjective";
  concept?: string;
  sem: Sem[];
  /** Adjective domains, or noun-accepted domains for adj compatibility. */
  domains?: AdjDomain[];
  valence?: "vi" | "vt";
  subject?: Sem[];
  object?: Sem[];
  prompt: LangSurface;
  answer: LangSurface;
};

export type VocabIndex = {
  nouns: SlotWord[];
  verbs: SlotWord[];
  adjectives: SlotWord[];
  byId: Map<string, SlotWord>;
  byPos: { noun: SlotWord[]; verb: SlotWord[]; adjective: SlotWord[] };
};

/** Progress signal for difficulty / length scaling. */
export type GeneratorProgress = {
  /** Eligible known non-weak study words available for slots. */
  knownCount: number;
  /** Mean lifetime accuracy of those words (0–1); 1 when unknown. */
  avgAccuracy: number;
};

export type PracticeSentence = {
  id: string;
  /** Structure tag used to avoid consecutive repeats (e.g. svo, coord-and, subord-because). */
  frame: SentenceFrame;
  structure: string;
  /** Study word ids used as content (not closed-class). */
  wordIds: string[];
  prompt: string;
  /** Canonical reference answer is accepted[0]; further entries are alternates. */
  accepted: string[];
  /** Difficulty band that produced this sentence (0 = simplest). */
  difficulty: number;
};

export type Tense = "present" | "past" | "future";
export type GramNumber = "sg" | "pl";
export type Case = "nom" | "acc" | "gen" | "dat" | "loc";
