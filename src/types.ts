import type { LangCode } from "./lib/languages";

export type { LangCode };

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
  /**
   * Shared concept id (usually the English citation head).
   * Pairs without a frequency list collapse entries that share one.
   */
  concept?: string;
  /** Saved by the user. Included in My words and the full deck, not frequency bands. */
  custom?: boolean;
};

export type CustomWord = {
  id: string;
  pos: string;
  forms: Partial<Record<LangCode, Form>>;
  createdAt: string;
  updatedAt: string;
};

export type DeckSource = {
  name: string;
  url: string;
  corpus?: string;
  note?: string;
  citation?: string;
  license?: string;
};

export type DeckMeta = {
  title: string;
  languages: { code: string; name: string; nativeName: string; flag?: string }[];
  coverage: Record<string, number>;
  sources: Record<string, DeckSource>;
  gaps: string;
};

export type CatalogEntry = {
  id: string;
  pos: string;
  ranks: Partial<Record<LangCode, number>>;
  concept?: string;
};

export type Catalog = {
  meta: DeckMeta;
  entries: CatalogEntry[];
};

/** Per-language forms, keyed by catalog entry id. Loaded on demand. */
export type LangPack = Record<string, Form>;

export type Dataset = {
  meta: DeckMeta;
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
  | "band5"
  | "mine";

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
