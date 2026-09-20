export type LangCode = "en" | "pl" | "de";
export type Mode = "study" | "quiz";

export type AcceptedAnswer = {
  text: string;
  /** Short gender / sense / register label shown on reveal. */
  context?: string;
};

export type Form = {
  text: string;
  accepted: AcceptedAnswer[];
};

export type Entry = {
  id: string;
  pos: string;
  ranks: Partial<Record<LangCode, number>>;
  forms: Partial<Record<LangCode, Form>>;
};

export type LanguageInfo = {
  code: LangCode;
  name: string;
  nativeName: string;
};

export type Dataset = {
  meta: {
    title: string;
    languages: LanguageInfo[];
    coverage: Partial<Record<string, number>>;
    sources: {
      polishFrequency: {
        name: string;
        url: string;
        corpus: string;
        note: string;
        citation: string;
      };
      germanFrequency: {
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
    gaps: string;
  };
  entries: Entry[];
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
  from: LangCode;
  to: LangCode;
  range: RangeId;
  size: SessionSize;
};

export type CardResult = {
  word: Entry;
  correct: boolean;
  given: string;
};

/** @deprecated Kept only for migrating older localStorage settings. */
export type LegacyDirection = "en-pl" | "pl-en";
