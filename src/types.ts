export type Direction = "en-pl" | "pl-en";
export type Mode = "study" | "quiz";

export type Word = {
  id: number;
  pl: string;
  pos: string;
  en: string;
  accepted: string[];
};

export type Dataset = {
  meta: {
    title: string;
    count: number;
    frequencySource: {
      name: string;
      url: string;
      corpus: string;
      note: string;
      citation: string;
    };
    glossSource: {
      name: string;
      url: string;
      license: string;
    };
  };
  words: Word[];
};

export type RangeId =
  | "top100"
  | "top250"
  | "top500"
  | "all"
  | "band2"
  | "band3"
  | "band4"
  | "band5";

export type SessionSize = 10 | 20 | 50 | "all";

export type Settings = {
  mode: Mode;
  direction: Direction;
  range: RangeId;
  size: SessionSize;
};

export type CardResult = {
  word: Word;
  correct: boolean;
  given: string;
};
