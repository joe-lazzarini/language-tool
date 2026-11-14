import { isKnown, isWeak, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import type {
  Gender,
  GrammarFile,
  GrammarWord,
  LangSurface,
  Sem,
  SlotWord,
  VocabIndex,
} from "./types";

const SENTENCE_POS = new Set(["noun", "verb", "adjective"]);

function normalizePos(pos: string): "noun" | "verb" | "adjective" | null {
  const key = pos.trim().toLowerCase();
  if (key === "proper noun") return "noun";
  if (SENTENCE_POS.has(key)) return key as "noun" | "verb" | "adjective";
  return null;
}

function genderFromContext(context: string | undefined): Gender | null {
  if (!context) return null;
  const lower = context.toLowerCase();
  if (lower.includes("masculine")) return "m";
  if (lower.includes("feminine")) return "f";
  if (lower.includes("neuter")) return "n";
  return null;
}

function citationLemma(entry: Entry, lang: LangCode): string | null {
  const form = entry.forms[lang];
  if (!form) return null;
  for (const answer of form.accepted) {
    const text = answer.text.trim();
    if (!text) continue;
    if (answer.context === "pinyin" || answer.context === "romanization") continue;
    let lemma = text.split("/")[0]!.trim();
    if (lang === "en") lemma = lemma.replace(/^to\s+/i, "").trim();
    return lemma || null;
  }
  const fallback = form.text.split("/")[0]!.trim();
  if (lang === "en") return fallback.replace(/^to\s+/i, "").trim() || null;
  return fallback || null;
}

function inferGender(entry: Entry, lang: LangCode, lemma: string): Gender | null {
  const form = entry.forms[lang];
  if (form) {
    for (const answer of form.accepted) {
      const gender = genderFromContext(answer.context);
      if (gender) return gender;
    }
  }
  if (lang === "en" || lang === "zh" || lang === "ja" || lang === "ru") return "n";
  if (lang === "pl") {
    const lower = lemma.toLowerCase();
    if (lower.endsWith("a") || lower.endsWith("ia")) return "f";
    if (lower.endsWith("o") || lower.endsWith("e") || lower.endsWith("ę") || lower.endsWith("um")) return "n";
    return "m";
  }
  return null;
}

function en3sg(lemma: string): string {
  const w = lemma.toLowerCase();
  if (w.endsWith("s") || w.endsWith("x") || w.endsWith("z") || w.endsWith("ch") || w.endsWith("sh")) return `${w}es`;
  if (w.endsWith("y") && w.length > 1 && !"aeiou".includes(w[w.length - 2]!)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

function pl3sg(lemma: string): string | null {
  const irregular: Record<string, string> = {
    spać: "śpi",
    jeść: "je",
    pić: "pije",
    widzieć: "widzi",
    mieć: "ma",
    być: "jest",
    iść: "idzie",
    móc: "może",
    chcieć: "chce",
    wiedzieć: "wie",
  };
  const w = lemma.toLowerCase();
  if (irregular[w]) return irregular[w]!;
  if (w.endsWith("ować")) return `${w.slice(0, -4)}uje`;
  if (w.endsWith("awać")) return `${w.slice(0, -4)}aje`;
  if (w.endsWith("ać")) return `${w.slice(0, -2)}a`;
  if (w.endsWith("eć")) return `${w.slice(0, -2)}e`;
  if (w.endsWith("ić")) return `${w.slice(0, -2)}i`;
  if (w.endsWith("yć")) return `${w.slice(0, -2)}y`;
  return null;
}

function plAdjForms(lemma: string): { m: string; f: string; n: string } {
  const lower = lemma.toLowerCase();
  if (lower.endsWith("y")) return { m: lemma, f: `${lemma.slice(0, -1)}a`, n: `${lemma.slice(0, -1)}e` };
  if (lower.endsWith("i")) return { m: lemma, f: `${lemma}a`, n: `${lemma}e` };
  return { m: lemma, f: lemma, n: lemma };
}

function plAcc(lemma: string, gender: Gender): string {
  if (gender === "f" && lemma.endsWith("a")) return `${lemma.slice(0, -1)}ę`;
  return lemma;
}

/** Infer surface forms from a study card when grammar.json has gaps. */
export function inferSurface(entry: Entry, lang: LangCode, pos: "noun" | "verb" | "adjective"): LangSurface | null {
  const lemma = citationLemma(entry, lang);
  if (!lemma) return null;
  if (pos === "noun") {
    const gender = inferGender(entry, lang, lemma);
    if (!gender && (lang === "de" || lang === "es" || lang === "fr" || lang === "it" || lang === "pt" || lang === "nl")) {
      return null;
    }
    const surface: LangSurface = { lemma, gender: gender ?? "n" };
    if (lang === "pl") surface.acc = plAcc(lemma, gender ?? "m");
    return surface;
  }
  if (pos === "verb") {
    if (lang === "en") return { lemma, fin: en3sg(lemma) };
    if (lang === "zh") return { lemma, fin: lemma };
    if (lang === "pl") {
      const fin = pl3sg(lemma);
      return fin ? { lemma, fin } : null;
    }
    // Japanese polite forms and other conjugations need grammar metadata.
    return null;
  }
  if (lang === "pl") return { lemma, ...plAdjForms(lemma) };
  return { lemma, m: lemma, f: lemma, n: lemma };
}

function mergeSurface(base: LangSurface | undefined, inferred: LangSurface | null): LangSurface | null {
  if (!base && !inferred) return null;
  if (!base) return inferred;
  if (!inferred) return base;
  return {
    ...inferred,
    ...base,
    lemma: base.lemma || inferred.lemma,
    gender: base.gender ?? inferred.gender,
    acc: base.acc ?? inferred.acc,
    fin: base.fin ?? inferred.fin,
    alts: base.alts ?? inferred.alts,
    m: base.m ?? inferred.m,
    f: base.f ?? inferred.f,
    n: base.n ?? inferred.n,
    npNom: base.npNom ?? inferred.npNom,
    npAcc: base.npAcc ?? inferred.npAcc,
  };
}

function surfaceReady(pos: "noun" | "verb" | "adjective", surface: LangSurface, lang: LangCode): boolean {
  if (pos === "verb") return Boolean(surface.fin);
  if (pos === "adjective") return Boolean(surface.m || surface.lemma);
  if (surface.npNom && surface.npAcc) return true;
  if (!surface.lemma) return false;
  if (lang === "de" || lang === "es" || lang === "fr" || lang === "it" || lang === "pt" || lang === "nl") {
    return Boolean(surface.gender);
  }
  return true;
}

function grammarForEntry(grammar: GrammarFile, entry: Entry): GrammarWord | undefined {
  const direct = grammar.words[entry.id];
  if (direct) return direct;
  if (!entry.concept) return undefined;
  for (const word of Object.values(grammar.words)) {
    if (word.concept === entry.concept && word.pos === normalizePos(entry.pos)) return word;
  }
  return undefined;
}

export function isEligibleStat(stat: WordStat | undefined): boolean {
  return isKnown(stat) && !isWeak(stat);
}

/**
 * Build in-memory indexes of study words that are known and not weak on both
 * sides and that have enough POS/grammar metadata for the current pair.
 */
export function buildVocabIndex(
  studyEntries: readonly Entry[],
  grammar: GrammarFile,
  promptLang: LangCode,
  answerLang: LangCode,
  promptStats: ReadonlyMap<string, WordStat>,
  answerStats: ReadonlyMap<string, WordStat>,
): VocabIndex {
  const nouns: SlotWord[] = [];
  const verbs: SlotWord[] = [];
  const adjectives: SlotWord[] = [];
  const byId = new Map<string, SlotWord>();

  for (const entry of studyEntries) {
    const pos = normalizePos(entry.pos);
    if (!pos) continue;
    if (!isEligibleStat(promptStats.get(entry.id)) || !isEligibleStat(answerStats.get(entry.id))) continue;

    const meta = grammarForEntry(grammar, entry);
    const metaPos = meta?.pos ?? pos;
    if (metaPos !== pos && meta) continue;

    const prompt = mergeSurface(meta?.langs[promptLang], inferSurface(entry, promptLang, pos));
    const answer = mergeSurface(meta?.langs[answerLang], inferSurface(entry, answerLang, pos));
    if (!prompt || !answer) continue;
    if (!surfaceReady(pos, prompt, promptLang) || !surfaceReady(pos, answer, answerLang)) continue;

    const slot: SlotWord = {
      id: entry.id,
      pos,
      concept: entry.concept ?? meta?.concept,
      // Unknown nouns may fill any noun slot; curated grammar still supplies tighter tags.
      sem: (meta?.sem as Sem[] | undefined) ?? (pos === "noun" ? ["thing", "person", "animal", "place", "food", "drink", "readable"] : []),
      valence: meta?.valence ?? (pos === "verb" ? "vi" : undefined),
      subject: meta?.subject ?? (pos === "verb" ? ["person", "animal", "thing", "place"] : undefined),
      object: meta?.object,
      prompt,
      answer,
    };
    byId.set(slot.id, slot);
    if (pos === "noun") nouns.push(slot);
    else if (pos === "verb") verbs.push(slot);
    else adjectives.push(slot);
  }

  return {
    nouns,
    verbs,
    adjectives,
    byId,
    byPos: { noun: nouns, verb: verbs, adjective: adjectives },
  };
}

/** Study words that could fill slots once known (have metadata), for lobby display. */
export function listGrammarCandidates(
  studyEntries: readonly Entry[],
  grammar: GrammarFile,
  promptLang: LangCode,
  answerLang: LangCode,
): Entry[] {
  const out: Entry[] = [];
  for (const entry of studyEntries) {
    const pos = normalizePos(entry.pos);
    if (!pos) continue;
    const meta = grammarForEntry(grammar, entry);
    const prompt = mergeSurface(meta?.langs[promptLang], inferSurface(entry, promptLang, pos));
    const answer = mergeSurface(meta?.langs[answerLang], inferSurface(entry, answerLang, pos));
    if (!prompt || !answer) continue;
    if (!surfaceReady(pos, prompt, promptLang) || !surfaceReady(pos, answer, answerLang)) continue;
    out.push(entry);
  }
  return out;
}

export function wordsNeededHint(ready: number, index: VocabIndex, minReady: number): string {
  if (ready >= minReady) return "";
  const need = minReady - ready;
  const nouns = index.nouns.length;
  const verbs = index.verbs.length;
  const adjs = index.adjectives.length;
  if (nouns === 0 && verbs === 0 && adjs === 0) {
    return `Know a few more study words (nouns, verbs, or adjectives) on both sides. About ${need} more sentences unlock the quiz.`;
  }
  if (nouns === 0) return `Know at least one more noun on both sides (${need} more sentence${need === 1 ? "" : "s"} needed).`;
  if (verbs === 0 && adjs === 0) {
    return `Know at least one more verb or adjective on both sides (${need} more sentence${need === 1 ? "" : "s"} needed).`;
  }
  return `${ready} of ${minReady} sentences ready. Know a few more eligible study words to unlock.`;
}
