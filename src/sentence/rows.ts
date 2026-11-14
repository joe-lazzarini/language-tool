import { isKnown, type WordStat } from "../accuracy/stats";
import { isLexiconItemKnown } from "./generate";
import type { Lexicon, SentencePack } from "./types";

export type SentenceWordRow = {
  id: string;
  pos: "noun" | "verb" | "adjective";
  prompt: string;
  answer: string;
  promptKnown: boolean;
  answerKnown: boolean;
  promptManual: boolean;
  answerManual: boolean;
};

function knownSide(item: { id: string; deckIds: string[] }, stats: ReadonlyMap<string, WordStat>): {
  known: boolean;
  manual: boolean;
} {
  const ids = [item.id, ...item.deckIds];
  const statsForIds = ids.map((id) => stats.get(id)).filter((stat): stat is WordStat => Boolean(stat));
  const known = isLexiconItemKnown(
    item,
    new Set(ids.filter((id) => isKnown(stats.get(id)))),
  );
  return { known, manual: statsForIds.some((stat) => stat.manual && isKnown(stat)) };
}

function showNoun(pack: SentencePack, id: string): string {
  return pack.nouns[id]?.npNom || id;
}

function showVerb(pack: SentencePack, id: string): string {
  return pack.verbs[id]?.form || id;
}

function showAdj(pack: SentencePack, id: string): string {
  const form = pack.adjectives[id];
  if (!form) return id;
  const forms = [form.m, form.f, form.n].filter(Boolean);
  return [...new Set(forms)].join(" / ");
}

export function sentenceRows(
  lexicon: Lexicon,
  promptPack: SentencePack,
  answerPack: SentencePack,
  promptStats: ReadonlyMap<string, WordStat>,
  answerStats: ReadonlyMap<string, WordStat>,
): SentenceWordRow[] {
  const rows: SentenceWordRow[] = [];
  for (const noun of lexicon.nouns) {
    const prompt = knownSide(noun, promptStats);
    const answer = knownSide(noun, answerStats);
    rows.push({
      id: noun.id,
      pos: "noun",
      prompt: showNoun(promptPack, noun.id),
      answer: showNoun(answerPack, noun.id),
      promptKnown: prompt.known,
      answerKnown: answer.known,
      promptManual: prompt.manual,
      answerManual: answer.manual,
    });
  }
  for (const verb of lexicon.verbs) {
    const prompt = knownSide(verb, promptStats);
    const answer = knownSide(verb, answerStats);
    rows.push({
      id: verb.id,
      pos: "verb",
      prompt: showVerb(promptPack, verb.id),
      answer: showVerb(answerPack, verb.id),
      promptKnown: prompt.known,
      answerKnown: answer.known,
      promptManual: prompt.manual,
      answerManual: answer.manual,
    });
  }
  for (const adj of lexicon.adjectives) {
    const prompt = knownSide(adj, promptStats);
    const answer = knownSide(adj, answerStats);
    rows.push({
      id: adj.id,
      pos: "adjective",
      prompt: showAdj(promptPack, adj.id),
      answer: showAdj(answerPack, adj.id),
      promptKnown: prompt.known,
      answerKnown: answer.known,
      promptManual: prompt.manual,
      answerManual: answer.manual,
    });
  }
  return rows;
}
