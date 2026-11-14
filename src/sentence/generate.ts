import { languageByCode, type LangCode } from "../lib/languages";
import type {
  LexAdj,
  Lexicon,
  LexNoun,
  LexVerb,
  PracticeSentence,
  SentenceFrame,
  SentencePack,
} from "./types";

export const MIN_READY_SENTENCES = 4;
export const SENTENCE_ROUND = 8;

type LexItem = { id: string; deckIds: string[] };

export function isLexiconItemKnown(item: LexItem, known: ReadonlySet<string>): boolean {
  if (known.has(item.id)) return true;
  return item.deckIds.some((id) => known.has(id));
}

export function lexiconKnownCount(lexicon: Lexicon, known: ReadonlySet<string>): number {
  return [...lexicon.nouns, ...lexicon.verbs, ...lexicon.adjectives].filter((item) =>
    isLexiconItemKnown(item, known),
  ).length;
}

function overlaps(tags: readonly string[], allowed: readonly string[]): boolean {
  return tags.some((tag) => allowed.includes(tag));
}

function capitalize(text: string, lang: LangCode): string {
  const chars = [...text];
  if (chars.length === 0) return text;
  chars[0] = chars[0]!.toLocaleUpperCase(languageByCode(lang).locale);
  return chars.join("");
}

function fill(pattern: string, slots: Record<string, string>): string | null {
  let missing = false;
  const text = pattern.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = slots[key];
    if (!value) {
      missing = true;
      return "";
    }
    return value;
  });
  if (missing || text.includes("{")) return null;
  return text;
}

function nounForm(pack: SentencePack, noun: LexNoun) {
  const form = pack.nouns[noun.id];
  if (!form?.npNom || !form.npAcc || !form.gender) return null;
  return form;
}

function verbForm(pack: SentencePack, verb: LexVerb) {
  const form = pack.verbs[verb.id];
  if (!form?.form) return null;
  return form;
}

function adjForm(pack: SentencePack, adj: LexAdj, gender: "m" | "f" | "n") {
  const form = pack.adjectives[adj.id];
  const text = form?.[gender];
  if (!text) return null;
  return text;
}

function variants(pack: SentencePack, lang: LangCode, frame: SentenceFrame, slots: Record<string, string>, verbAlts: string[]): string[] {
  const patterns = [pack.frames[frame]];
  if (frame === "adj" && pack.frames.adjPlain) patterns.push(pack.frames.adjPlain);
  const out: string[] = [];
  for (const pattern of patterns) {
    const canonical = fill(pattern, slots);
    if (canonical) out.push(capitalize(canonical, lang));
    for (const alt of verbAlts) {
      const next = fill(pattern, { ...slots, verb: alt });
      if (next) out.push(capitalize(next, lang));
    }
  }
  return [...new Set(out)];
}

function knownNouns(nouns: LexNoun[], promptKnown: ReadonlySet<string>, answerKnown: ReadonlySet<string>): LexNoun[] {
  return nouns.filter((noun) => isLexiconItemKnown(noun, promptKnown) && isLexiconItemKnown(noun, answerKnown));
}

function knownVerbs(verbs: LexVerb[], promptKnown: ReadonlySet<string>, answerKnown: ReadonlySet<string>): LexVerb[] {
  return verbs.filter((verb) => isLexiconItemKnown(verb, promptKnown) && isLexiconItemKnown(verb, answerKnown));
}

function knownAdjs(adjectives: LexAdj[], promptKnown: ReadonlySet<string>, answerKnown: ReadonlySet<string>): LexAdj[] {
  return adjectives.filter((adj) => isLexiconItemKnown(adj, promptKnown) && isLexiconItemKnown(adj, answerKnown));
}

/**
 * Build every grammatical sentence whose content words are known on both sides.
 * Articles, the copula, and Japanese particles live in the template.
 * A missing form drops that sentence instead of leaving a blank slot.
 */
export function generateSentences(
  lexicon: Lexicon,
  promptLang: LangCode,
  promptPack: SentencePack,
  answerLang: LangCode,
  answerPack: SentencePack,
  promptKnown: ReadonlySet<string>,
  answerKnown: ReadonlySet<string>,
): PracticeSentence[] {
  const nouns = knownNouns(lexicon.nouns, promptKnown, answerKnown);
  const verbs = knownVerbs(lexicon.verbs, promptKnown, answerKnown);
  const adjectives = knownAdjs(lexicon.adjectives, promptKnown, answerKnown);
  const sentences: PracticeSentence[] = [];

  for (const verb of verbs) {
    const promptVerb = verbForm(promptPack, verb);
    const answerVerb = verbForm(answerPack, verb);
    if (!promptVerb || !answerVerb) continue;
    for (const subject of nouns) {
      if (!overlaps(subject.sem, verb.subject)) continue;
      const promptNoun = nounForm(promptPack, subject);
      const answerNoun = nounForm(answerPack, subject);
      if (!promptNoun || !answerNoun) continue;
      if (verb.valence === "vi") {
        const prompt = render(promptPack, promptLang, "vi", {
          subject: promptNoun.npNom,
          verb: promptVerb.form,
        });
        const accepted = renderAll(answerPack, answerLang, "vi", {
          subject: answerNoun.npNom,
          verb: answerVerb.form,
        }, answerVerb.alts ?? []);
        if (prompt && accepted.length > 0) {
          sentences.push({
            id: `vi:${subject.id}:${verb.id}`,
            frame: "vi",
            wordIds: [subject.id, verb.id],
            prompt,
            accepted,
          });
        }
        continue;
      }
      for (const object of nouns) {
        if (object.id === subject.id) continue;
        if (!verb.object || !overlaps(object.sem, verb.object)) continue;
        const promptObject = nounForm(promptPack, object);
        const answerObject = nounForm(answerPack, object);
        if (!promptObject || !answerObject) continue;
        const prompt = render(promptPack, promptLang, "vt", {
          subject: promptNoun.npNom,
          verb: promptVerb.form,
          object: promptObject.npAcc,
        });
        const accepted = renderAll(answerPack, answerLang, "vt", {
          subject: answerNoun.npNom,
          verb: answerVerb.form,
          object: answerObject.npAcc,
        }, answerVerb.alts ?? []);
        if (!prompt || accepted.length === 0) continue;
        sentences.push({
          id: `vt:${subject.id}:${verb.id}:${object.id}`,
          frame: "vt",
          wordIds: [subject.id, verb.id, object.id],
          prompt,
          accepted,
        });
      }
    }
  }

  for (const subject of nouns) {
    const promptNoun = nounForm(promptPack, subject);
    const answerNoun = nounForm(answerPack, subject);
    if (!promptNoun || !answerNoun) continue;
    for (const adj of adjectives) {
      const promptAdj = adjForm(promptPack, adj, promptNoun.gender);
      const answerAdj = adjForm(answerPack, adj, answerNoun.gender);
      if (!promptAdj || !answerAdj) continue;
      const prompt = render(promptPack, promptLang, "adj", { subject: promptNoun.npNom, adj: promptAdj });
      const accepted = renderAll(answerPack, answerLang, "adj", { subject: answerNoun.npNom, adj: answerAdj }, []);
      if (!prompt || accepted.length === 0) continue;
      sentences.push({
        id: `adj:${subject.id}:${adj.id}`,
        frame: "adj",
        wordIds: [subject.id, adj.id],
        prompt,
        accepted,
      });
    }
  }

  sentences.sort((a, b) => a.id.localeCompare(b.id));
  return sentences;
}

function render(pack: SentencePack, lang: LangCode, frame: SentenceFrame, slots: Record<string, string>): string | null {
  const text = fill(pack.frames[frame], slots);
  return text ? capitalize(text, lang) : null;
}

function renderAll(
  pack: SentencePack,
  lang: LangCode,
  frame: SentenceFrame,
  slots: Record<string, string>,
  verbAlts: string[],
): string[] {
  return variants(pack, lang, frame, slots, verbAlts);
}

export function sampleSentences(
  sentences: readonly PracticeSentence[],
  size: number,
  rng: () => number = Math.random,
): PracticeSentence[] {
  const copy = [...sentences];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(size, copy.length));
}
