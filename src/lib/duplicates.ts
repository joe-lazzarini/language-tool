import {
  formCitation,
  formsMatchCitation,
  normalizePos,
  type LemmaIndex,
} from "./lemma";
import { customWordsForPair, type CustomWord } from "./customWords";
import type { LangPair } from "./languages";
import type { Entry, Form, LangCode } from "../types";

export { duplicateContentKey } from "./lemma";

export type DuplicateHit = {
  kind: "custom" | "deck";
  id: string;
  /** Citation shown in the message, usually the matched language form. */
  display: string;
  lang: LangCode;
  word?: CustomWord;
  entry?: Entry;
};

function pairEntries(deck: Entry[], pair: LangPair): Entry[] {
  return deck.filter((entry) => {
    if (entry.custom) return false;
    const a = entry.forms[pair[0]];
    const b = entry.forms[pair[1]];
    return Boolean(
      a?.text.trim() &&
        a.accepted.some((row) => row.text.trim()) &&
        b?.text.trim() &&
        b.accepted.some((row) => row.text.trim()),
    );
  });
}

/**
 * Find an existing My-words or built-in card for this pair that already has the
 * same canonical citation in `lang` with the same part of speech.
 */
export function findDuplicateWord(opts: {
  lang: LangCode;
  citation: string;
  pos: string;
  pair: LangPair;
  customWords: CustomWord[];
  deck: Entry[];
  excludeId?: string;
  lemmaIndex?: LemmaIndex | null;
}): DuplicateHit | null {
  const citation = opts.citation.trim();
  if (!citation) return null;
  const pos = normalizePos(opts.pos);
  const mine = customWordsForPair(opts.customWords, opts.pair[0], opts.pair[1]);

  for (const word of mine) {
    if (opts.excludeId && word.id === opts.excludeId) continue;
    if (normalizePos(word.pos) !== pos) continue;
    if (!formsMatchCitation(opts.lang, word.forms[opts.lang], citation, opts.lemmaIndex)) continue;
    return {
      kind: "custom",
      id: word.id,
      display: formCitation(word.forms[opts.lang]) || citation,
      lang: opts.lang,
      word,
    };
  }

  for (const entry of pairEntries(opts.deck, opts.pair)) {
    if (normalizePos(entry.pos) !== pos) continue;
    if (!formsMatchCitation(opts.lang, entry.forms[opts.lang], citation, opts.lemmaIndex)) continue;
    return {
      kind: "deck",
      id: entry.id,
      display: formCitation(entry.forms[opts.lang]) || citation,
      lang: opts.lang,
      entry,
    };
  }

  return null;
}

/**
 * After lookup / edit, check the source language form (and optionally both
 * pair languages) against My words and the built-in deck.
 */
export function findDraftDuplicate(opts: {
  forms: Partial<Record<LangCode, Form>>;
  pos: string;
  pair: LangPair;
  /** Language the user typed in — checked first. */
  source: LangCode;
  customWords: CustomWord[];
  deck: Entry[];
  excludeId?: string;
  lemmaIndex?: LemmaIndex | null;
}): DuplicateHit | null {
  const order: LangCode[] = [opts.source, ...opts.pair.filter((code) => code !== opts.source)];
  for (const lang of order) {
    const form = opts.forms[lang];
    const citation = formCitation(form);
    if (!citation) continue;
    const hit = findDuplicateWord({
      lang,
      citation,
      pos: opts.pos,
      pair: opts.pair,
      customWords: opts.customWords,
      deck: opts.deck,
      excludeId: opts.excludeId,
      lemmaIndex: opts.lemmaIndex,
    });
    if (hit) return hit;
  }
  return null;
}
