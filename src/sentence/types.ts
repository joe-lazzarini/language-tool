import type { LangCode } from "../lib/languages";

export type Sem = "person" | "animal" | "place" | "thing" | "food" | "drink" | "readable";

export type Gender = "m" | "f" | "n";

export type SentenceFrame = "vi" | "vt" | "adj";

export type SentenceFrames = {
  vi: string;
  vt: string;
  adj: string;
  /** Extra accepted pattern, used for the Japanese adjective without です. */
  adjPlain?: string;
};

export type SentencePack = {
  frames: SentenceFrames;
};

/** Per-language surface data for one study word. */
export type LangSurface = {
  lemma: string;
  gender?: Gender;
  /** Bare accusative lemma when different from nominative. */
  acc?: string;
  /** Ready-made noun phrases (include article when the language has one). */
  npNom?: string;
  npAcc?: string;
  /** Finite 3rd-person singular (or polite Japanese) verb form. */
  fin?: string;
  alts?: string[];
  /** Predicative adjective forms by subject gender. */
  m?: string;
  f?: string;
  n?: string;
};

export type GrammarWord = {
  pos: "noun" | "verb" | "adjective";
  concept?: string;
  sem?: Sem[];
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

export type PracticeSentence = {
  id: string;
  frame: SentenceFrame;
  /** Study word ids: subject, verb or adjective, and object when there is one. */
  wordIds: string[];
  prompt: string;
  /** Canonical reference answer is accepted[0]; further entries are alternates. */
  accepted: string[];
};
