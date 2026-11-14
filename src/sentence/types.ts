export type Sem = "person" | "animal" | "place" | "thing" | "food" | "drink" | "readable";

export type Gender = "m" | "f" | "n";

export type LexNoun = {
  id: string;
  sem: Sem[];
  deckIds: string[];
};

export type LexVerb = {
  id: string;
  valence: "vi" | "vt";
  subject: Sem[];
  object?: Sem[];
  deckIds: string[];
};

export type LexAdj = {
  id: string;
  deckIds: string[];
};

export type Lexicon = {
  nouns: LexNoun[];
  verbs: LexVerb[];
  adjectives: LexAdj[];
};

export type NounForm = {
  npNom: string;
  npAcc: string;
  gender: Gender;
};

export type VerbForm = {
  form: string;
  alts?: string[];
};

export type AdjForm = {
  m: string;
  f: string;
  n: string;
};

export type SentenceFrames = {
  vi: string;
  vt: string;
  adj: string;
  /** Extra accepted pattern, used for the Japanese adjective without です. */
  adjPlain?: string;
};

export type SentencePack = {
  frames: SentenceFrames;
  nouns: Record<string, NounForm>;
  verbs: Record<string, VerbForm>;
  adjectives: Record<string, AdjForm>;
};

export type SentenceFrame = "vi" | "vt" | "adj";

export type PracticeSentence = {
  id: string;
  frame: SentenceFrame;
  /** Lexicon ids: subject, verb or adjective, and object when there is one. */
  wordIds: string[];
  prompt: string;
  accepted: string[];
};
