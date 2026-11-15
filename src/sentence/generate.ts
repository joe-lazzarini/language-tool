import type { LangCode } from "../lib/languages";
import { adjForm, nounPhrase, renderAccepted, renderFrame, verbForm } from "./render";
import type { PracticeSentence, SentencePack, SlotWord, VocabIndex } from "./types";
import { wordsNeededHint } from "./vocab";

export const MIN_READY_SENTENCES = 4;
export const SENTENCE_ROUND = 8;

function overlaps(tags: readonly string[], allowed: readonly string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return tags.some((tag) => allowed.includes(tag));
}

function isAnimate(sem: readonly string[]): boolean {
  return sem.includes("person") || sem.includes("animal");
}

/**
 * Build every grammatical sentence whose content words are eligible study
 * words (known and not weak on both sides). Articles, the copula, Japanese
 * particles, and Mandarin 很 live in the template.
 */
export function generateSentences(
  index: VocabIndex,
  promptLang: LangCode,
  promptPack: SentencePack,
  answerLang: LangCode,
  answerPack: SentencePack,
): PracticeSentence[] {
  const sentences: PracticeSentence[] = [];
  const nouns = index.nouns;
  const verbs = index.verbs;
  const adjectives = index.adjectives;

  for (const verb of verbs) {
    const promptVerb = verbForm(verb.prompt);
    const answerVerb = verbForm(verb.answer);
    if (!promptVerb || !answerVerb) continue;
    const valence = verb.valence ?? "vi";

    for (const subject of nouns) {
      if (!overlaps(subject.sem, verb.subject)) continue;
      const promptSubject = nounPhrase(promptLang, subject.prompt, "nom");
      const answerSubject = nounPhrase(answerLang, subject.answer, "nom");
      if (!promptSubject || !answerSubject) continue;

      if (valence === "vi") {
        const prompt = renderFrame(promptPack, promptLang, "vi", {
          subject: promptSubject,
          verb: promptVerb.form,
        });
        const accepted = renderAccepted(
          answerPack,
          answerLang,
          "vi",
          { subject: answerSubject, verb: answerVerb.form },
          answerVerb.alts,
        );
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
        if (verb.object && !overlaps(object.sem, verb.object)) continue;
        const animate = isAnimate(object.sem);
        const promptObject = nounPhrase(promptLang, object.prompt, "acc", { animateObject: animate });
        const answerObject = nounPhrase(answerLang, object.answer, "acc", { animateObject: animate });
        if (!promptObject || !answerObject) continue;
        const prompt = renderFrame(promptPack, promptLang, "vt", {
          subject: promptSubject,
          verb: promptVerb.form,
          object: promptObject,
        });
        const accepted = renderAccepted(
          answerPack,
          answerLang,
          "vt",
          { subject: answerSubject, verb: answerVerb.form, object: answerObject },
          answerVerb.alts,
        );
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
    const promptSubject = nounPhrase(promptLang, subject.prompt, "nom");
    const answerSubject = nounPhrase(answerLang, subject.answer, "nom");
    if (!promptSubject || !answerSubject) continue;
    const promptGender = subject.prompt.gender ?? "n";
    const answerGender = subject.answer.gender ?? "n";
    for (const adj of adjectives) {
      const promptAdj = adjForm(adj.prompt, promptGender);
      const answerAdj = adjForm(adj.answer, answerGender);
      if (!promptAdj || !answerAdj) continue;
      const prompt = renderFrame(promptPack, promptLang, "adj", {
        subject: promptSubject,
        adj: promptAdj,
      });
      const accepted = renderAccepted(
        answerPack,
        answerLang,
        "adj",
        { subject: answerSubject, adj: answerAdj },
        [],
      );
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

export function eligibleKnownCount(index: VocabIndex): number {
  return index.nouns.length + index.verbs.length + index.adjectives.length;
}

export function unlockHint(ready: number, index: VocabIndex): string {
  return wordsNeededHint(ready, index, MIN_READY_SENTENCES);
}

/**
 * Sample a round with no immediate sentence-id repeats from the previous round
 * when enough alternatives exist. Randomizes template/word combinations.
 */
export function sampleSentences(
  sentences: readonly PracticeSentence[],
  size: number,
  rng: () => number = Math.random,
  previousIds: ReadonlySet<string> = new Set(),
): PracticeSentence[] {
  const preferred = sentences.filter((item) => !previousIds.has(item.id));
  const pool = preferred.length >= Math.min(size, sentences.length) ? preferred : [...sentences];
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(size, copy.length));
}

export function slotLabel(word: SlotWord, side: "prompt" | "answer"): string {
  const surface = side === "prompt" ? word.prompt : word.answer;
  if (word.pos === "verb") return surface.fin || surface.lemma;
  if (word.pos === "adjective") {
    const forms = [surface.m, surface.f, surface.n].filter(Boolean) as string[];
    return [...new Set(forms)].join(" / ") || surface.lemma;
  }
  return surface.npNom || surface.lemma;
}
