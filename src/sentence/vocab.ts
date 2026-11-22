import { combinePairStat, isKnown, isWeak, type WordStat } from "../accuracy/stats";
import type { LangCode } from "../lib/languages";
import type { Entry } from "../types";
import type {
  AdjDomain,
  Gender,
  GrammarFile,
  GrammarWord,
  LangSurface,
  Sem,
  SlotWord,
  VocabIndex,
} from "./types";

const SENTENCE_POS = new Set(["noun", "verb", "adjective"]);

/** Conservative default for unlisted / custom / proper nouns. */
export const DEFAULT_NOUN_SEM: Sem[] = ["thing"];

/** Default verb subject when grammar omits restrictions — animate agents only. */
export const DEFAULT_VERB_SUBJECT: Sem[] = ["person", "animal"];

export function normalizePos(pos: string): "noun" | "verb" | "adjective" | null {
  const key = pos.trim().toLowerCase();
  if (key === "proper noun") return "noun";
  if (SENTENCE_POS.has(key)) return key as "noun" | "verb" | "adjective";
  return null;
}

/** Derive noun-accepted adjective domains from semantic tags when unset. */
export function domainsFromSem(sem: readonly Sem[]): AdjDomain[] {
  const out: AdjDomain[] = [];
  const add = (d: AdjDomain) => {
    if (!out.includes(d)) out.push(d);
  };
  if (sem.includes("person")) {
    add("human");
    add("physical");
    add("evaluative");
    add("nationality");
  }
  if (sem.includes("animal")) {
    add("human");
    add("physical");
    add("evaluative");
  }
  if (sem.includes("place")) {
    add("physical");
    add("evaluative");
    add("nationality");
  }
  if (sem.includes("food") || sem.includes("drink")) {
    add("physical");
    add("taste");
    add("evaluative");
  }
  if (sem.includes("readable")) {
    add("physical");
    add("evaluative");
  }
  if (sem.includes("thing")) {
    add("physical");
    add("evaluative");
  }
  if (out.length === 0) {
    add("physical");
    add("evaluative");
  }
  return out;
}

/**
 * Hook for tagging a concept when a custom word is added.
 * Keep defaults conservative; a later PR may expose category UI.
 */
export function defaultGrammarTagsForNewWord(
  pos: "noun" | "verb" | "adjective" | string,
  opts: { sem?: Sem[]; domains?: AdjDomain[]; placeName?: boolean } = {},
): Pick<GrammarWord, "sem" | "domains" | "valence" | "subject" | "object"> {
  const normalized = normalizePos(pos) ?? "noun";
  if (normalized === "noun") {
    const sem = opts.sem ?? (opts.placeName ? (["place", "thing"] as Sem[]) : DEFAULT_NOUN_SEM);
    return { sem, domains: opts.domains ?? domainsFromSem(sem) };
  }
  if (normalized === "verb") {
    return { valence: "vi", subject: DEFAULT_VERB_SUBJECT };
  }
  return { domains: opts.domains ?? (["evaluative", "open"] as AdjDomain[]) };
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
  const w = lemma.toLowerCase().replace(/^to\s+/, "").trim();
  const invariant = new Set(["must", "can", "may", "might", "should", "would", "could", "shall", "will", "ought"]);
  if (invariant.has(w)) return w;
  if (w === "be" || w === "be able to") return w === "be" ? "is" : "is able to";
  if (w === "have") return "has";
  if (w === "do") return "does";
  if (w === "go") return "goes";
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
    powiedzieć: "powie",
    opowiedzieć: "opowie",
    jechać: "jedzie",
    myśleć: "myśli",
    pomyśleć: "pomyśli",
    słyszeć: "słyszy",
    siedzieć: "siedzi",
    stać: "stoi",
    musieć: "musi",
    żyć: "żyje",
    brać: "bierze",
    rozumieć: "rozumie",
    zrozumieć: "zrozumie",
    patrzeć: "patrzy",
    należeć: "należy",
    leżeć: "leży",
    zależeć: "zależy",
    istnieć: "istnieje",
    brzmieć: "brzmi",
    woleć: "woli",
    umieć: "umie",
    odpowiedzieć: "odpowie",
    dowiedzieć: "dowie",
    przypomnieć: "przypomni",
    wspomnieć: "wspomni",
  };
  const w = lemma.toLowerCase();
  if (irregular[w]) return irregular[w]!;
  if (w.endsWith("ować")) return `${w.slice(0, -4)}uje`;
  if (w.endsWith("awać")) return `${w.slice(0, -4)}aje`;
  // -ieć (widzieć-style) → -i, not naive -e (*powiedzie). Covered irregulars above.
  if (w.endsWith("ieć")) return `${w.slice(0, -3)}i`;
  if (w.endsWith("ać")) return `${w.slice(0, -2)}a`;
  if (w.endsWith("eć")) return `${w.slice(0, -2)}e`;
  if (w.endsWith("ić")) return `${w.slice(0, -2)}i`;
  if (w.endsWith("yć")) return `${w.slice(0, -2)}y`;
  return null;
}

function plAdjForms(lemma: string): { m: string; f: string; n: string } {
  const lower = lemma.toLowerCase();
  // Hard stems: wielki → wielka / wielkie; szybki → szybka / szybkie (not *wielkia).
  if (lower.endsWith("ki") || lower.endsWith("gi")) {
    return { m: lemma, f: `${lemma.slice(0, -1)}a`, n: `${lemma}e` };
  }
  if (lower.endsWith("y")) return { m: lemma, f: `${lemma.slice(0, -1)}a`, n: `${lemma.slice(0, -1)}e` };
  if (lower.endsWith("i")) return { m: lemma, f: `${lemma}a`, n: `${lemma}e` };
  return { m: lemma, f: lemma, n: lemma };
}

/** Masculine-animate accusative for common study lemmas and productive endings. */
function plMasculineAnimateAcc(lemma: string): string {
  const irregular: Record<string, string> = {
    pies: "psa",
    kot: "kota",
    ojciec: "ojca",
    człowiek: "człowieka",
    brat: "brata",
    mąż: "męża",
    książę: "księcia",
    bóg: "boga",
    mieszkaniec: "mieszkańca",
  };
  const lower = lemma.toLowerCase();
  if (irregular[lower]) return irregular[lower]!;
  if (lower.endsWith("iec")) return `${lemma.slice(0, -3)}ca`;
  if (lower.endsWith("ek")) return `${lemma.slice(0, -2)}ka`;
  return `${lemma}a`;
}

function plAcc(lemma: string, gender: Gender, animate = false): string {
  if (gender === "f" && lemma.endsWith("a")) return `${lemma.slice(0, -1)}ę`;
  if (gender === "m" && animate) return plMasculineAnimateAcc(lemma);
  return lemma;
}

/** True when a stored Polish feminine looks like the old -ki/-gi → *ia bug. */
function isBrokenPlAdjFeminine(lemma: string, feminine: string | undefined): boolean {
  if (!feminine) return false;
  const lower = lemma.toLowerCase();
  if (!(lower.endsWith("ki") || lower.endsWith("gi"))) return false;
  return feminine.toLowerCase() === `${lower.slice(0, -1)}ia`;
}

/** Infer surface forms from a study card when grammar.json has gaps. */
export function inferSurface(
  entry: Entry,
  lang: LangCode,
  pos: "noun" | "verb" | "adjective",
  opts: { animate?: boolean } = {},
): LangSurface | null {
  const lemma = citationLemma(entry, lang);
  if (!lemma) return null;
  if (pos === "noun") {
    const gender = inferGender(entry, lang, lemma);
    if (!gender && (lang === "de" || lang === "es" || lang === "fr" || lang === "it" || lang === "pt" || lang === "nl")) {
      return null;
    }
    const surface: LangSurface = { lemma, gender: gender ?? "n" };
    if (lang === "pl") surface.acc = plAcc(lemma, gender ?? "m", opts.animate === true);
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

/** Prefer a study-card lemma when grammar.json copied an English gloss (e.g. pl lemma "see"). */
function preferLemma(lang: LangCode, grammarLemma: string | undefined, inferredLemma: string | undefined): string {
  const g = grammarLemma?.trim() || "";
  const inferred = inferredLemma?.trim() || "";
  if (lang === "pl") {
    const looksPl = (w: string) => /[ąćęłńóśźż]/i.test(w) || /(?:ować|[aeiy]ć)$/i.test(w);
    if (inferred && looksPl(inferred)) return inferred;
    if (g && looksPl(g)) return g;
    return inferred || g;
  }
  if (lang === "zh") {
    // Prefer the deck citation (看) over a divergent grammar lemma (见).
    return inferred || g;
  }
  return g || inferred;
}

function mergeSurface(
  base: LangSurface | undefined,
  inferred: LangSurface | null,
  lang?: LangCode,
): LangSurface | null {
  if (!base && !inferred) return null;
  if (!base) return inferred;
  if (!inferred) return base;
  const lemma = preferLemma(lang ?? "en", base.lemma, inferred.lemma);
  const preferInferredF = isBrokenPlAdjFeminine(lemma, base.f) && Boolean(inferred.f);
  return {
    ...inferred,
    ...base,
    lemma,
    gender: base.gender ?? inferred.gender,
    acc: base.acc ?? inferred.acc,
    fin: base.fin ?? inferred.fin,
    alts: base.alts ?? inferred.alts,
    m: base.m ?? inferred.m,
    f: preferInferredF ? inferred.f : (base.f ?? inferred.f),
    n: base.n ?? inferred.n,
    npNom: base.npNom ?? inferred.npNom,
    npAcc: base.npAcc ?? inferred.npAcc,
  };
}

function isAnimateSem(sem: readonly Sem[] | undefined): boolean {
  return Boolean(sem?.includes("person") || sem?.includes("animal"));
}

/** Prefer a real masculine-animate accusative when grammar left the nominative. */
function repairPlNounAcc(surface: LangSurface, animate: boolean): LangSurface {
  if (!animate || surface.gender !== "m") return surface;
  const lemma = surface.lemma;
  if (!lemma) return surface;
  const fixed = plAcc(lemma, "m", true);
  const accIsNom = !surface.acc || surface.acc === lemma;
  const npAccIsNom = !surface.npAcc || surface.npAcc === lemma;
  if (!accIsNom && !npAccIsNom) return surface;
  return {
    ...surface,
    acc: accIsNom ? fixed : surface.acc,
    npAcc: npAccIsNom ? fixed : surface.npAcc,
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

/** Sentence eligibility: known and not weak on the combined unordered-pair score. */
export function isEligiblePair(
  promptStat: WordStat | undefined,
  answerStat: WordStat | undefined,
): boolean {
  return isEligibleStat(combinePairStat(promptStat, answerStat));
}

/**
 * Build in-memory indexes of study words that are eligible for sentences
 * (combined A↔B score meets known and is not weak) and that have enough
 * POS/grammar metadata for the current pair.
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
    if (!isEligiblePair(promptStats.get(entry.id), answerStats.get(entry.id))) continue;

    const meta = grammarForEntry(grammar, entry);
    const metaPos = meta?.pos ?? pos;
    if (metaPos !== pos && meta) continue;

    // Animacy comes only from curated grammar tags — do not infer it from the
    // open default sem list, or inanimates like dom would get *doma.
    const animate = pos === "noun" && isAnimateSem(meta?.sem);
    let prompt = mergeSurface(meta?.langs[promptLang], inferSurface(entry, promptLang, pos, { animate }), promptLang);
    let answer = mergeSurface(meta?.langs[answerLang], inferSurface(entry, answerLang, pos, { animate }), answerLang);
    if (!prompt || !answer) continue;
    if (pos === "noun" && promptLang === "pl") prompt = repairPlNounAcc(prompt, animate);
    if (pos === "noun" && answerLang === "pl") answer = repairPlNounAcc(answer, animate);
    if (!surfaceReady(pos, prompt, promptLang) || !surfaceReady(pos, answer, answerLang)) continue;

    const sem: Sem[] =
      (meta?.sem as Sem[] | undefined) ??
      (pos === "noun" ? DEFAULT_NOUN_SEM : []);
    const domains: AdjDomain[] | undefined =
      (meta?.domains as AdjDomain[] | undefined) ??
      (pos === "noun" ? domainsFromSem(sem) : pos === "adjective" ? (["evaluative", "open"] as AdjDomain[]) : undefined);

    const slot: SlotWord = {
      id: entry.id,
      pos,
      concept: entry.concept ?? meta?.concept,
      // Unlisted / custom / proper nouns default to conservative "thing" only.
      sem,
      domains,
      valence: meta?.valence ?? (pos === "verb" ? "vi" : undefined),
      subject: meta?.subject ?? (pos === "verb" ? DEFAULT_VERB_SUBJECT : undefined),
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
    const sem = meta?.sem as Sem[] | undefined;
    const animate = pos === "noun" && isAnimateSem(sem);
    let prompt = mergeSurface(meta?.langs[promptLang], inferSurface(entry, promptLang, pos, { animate }), promptLang);
    let answer = mergeSurface(meta?.langs[answerLang], inferSurface(entry, answerLang, pos, { animate }), answerLang);
    if (!prompt || !answer) continue;
    if (pos === "noun" && promptLang === "pl") prompt = repairPlNounAcc(prompt, animate);
    if (pos === "noun" && answerLang === "pl") answer = repairPlNounAcc(answer, animate);
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
    return `Know a few more study words (nouns, verbs, or adjectives) for this pair. About ${need} more sentences unlock the quiz.`;
  }
  if (nouns === 0) {
    return `Know at least one more noun for this pair (${need} more sentence${need === 1 ? "" : "s"} needed).`;
  }
  if (verbs === 0 && adjs === 0) {
    return `Know at least one more verb or adjective for this pair (${need} more sentence${need === 1 ? "" : "s"} needed).`;
  }
  return `${ready} of ${minReady} sentences ready. Know a few more study words for this pair to unlock.`;
}
