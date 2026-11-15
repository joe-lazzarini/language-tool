import { languageByCode, type LangCode } from "../lib/languages";
import { closedClass, pickAdverb, pickPrep } from "./closedClass";
import { finiteVerb } from "./morph";
import { renderNp, renderPredAdj } from "./np";
import type {
  GeneratorProgress,
  Gender,
  GramNumber,
  PracticeSentence,
  Sem,
  SlotWord,
  Tense,
  VocabIndex,
} from "./types";

const MIN_BASIC_FALLBACK = 4;

export type StructureKind =
  | "vi"
  | "vt"
  | "adj"
  | "attr-vi"
  | "attr-vt"
  | "vi-adv"
  | "vt-pp"
  | "neg-vi"
  | "neg-vt"
  | "q-vi"
  | "q-vt"
  | "past-vi"
  | "past-vt"
  | "future-vi"
  | "coord-and"
  | "coord-but"
  | "subord-because"
  | "subord-when"
  | "subord-if"
  | "rel-vi";

const STRUCTURES_BY_LEVEL: StructureKind[][] = [
  ["vi", "vt", "adj"],
  ["vi", "vt", "adj", "attr-vi", "attr-vt"],
  ["vi", "vt", "adj", "attr-vi", "attr-vt", "vi-adv", "vt-pp"],
  ["vi", "vt", "adj", "attr-vi", "attr-vt", "vi-adv", "vt-pp", "neg-vi", "neg-vt", "q-vi"],
  ["vi", "vt", "adj", "attr-vi", "attr-vt", "vi-adv", "vt-pp", "neg-vi", "q-vi", "q-vt", "past-vi", "coord-and"],
  [
    "vi",
    "vt",
    "adj",
    "attr-vi",
    "attr-vt",
    "vi-adv",
    "vt-pp",
    "neg-vi",
    "q-vi",
    "past-vi",
    "past-vt",
    "future-vi",
    "coord-and",
    "coord-but",
    "subord-because",
  ],
  [
    "vi",
    "vt",
    "adj",
    "attr-vi",
    "attr-vt",
    "vi-adv",
    "vt-pp",
    "neg-vi",
    "q-vi",
    "past-vi",
    "future-vi",
    "coord-and",
    "coord-but",
    "subord-because",
    "subord-when",
    "subord-if",
    "rel-vi",
  ],
];

export function difficultyLevel(progress: GeneratorProgress): number {
  const n = progress.knownCount;
  let level = 0;
  if (n >= 6) level = 1;
  if (n >= 8) level = 2;
  if (n >= 10) level = 3;
  if (n >= 12) level = 4;
  if (n >= 16) level = 5;
  if (n >= 20) level = 6;
  if (progress.avgAccuracy >= 0.85) level = Math.min(6, level + 1);
  return level;
}

export function structuresForLevel(level: number): StructureKind[] {
  const idx = Math.max(0, Math.min(level, STRUCTURES_BY_LEVEL.length - 1));
  return STRUCTURES_BY_LEVEL[idx]!;
}

function capitalize(text: string, lang: LangCode): string {
  if (!text) return text;
  if (lang === "zh" || lang === "ja") return text;
  const chars = [...text];
  chars[0] = chars[0]!.toLocaleUpperCase(languageByCode(lang).locale);
  return chars.join("");
}

function endSentence(text: string, lang: LangCode, question: boolean): string {
  const cc = closedClass(lang);
  if (question) {
    if (lang === "zh") return `${text}${cc.qParticle ?? ""}${cc.period}`;
    if (lang === "ja") return `${text}か${cc.period}`;
    return `${text}?`;
  }
  return `${text}${cc.period}`;
}

function overlaps(tags: readonly string[], allowed: readonly string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return tags.some((tag) => allowed.includes(tag));
}

function isAnimate(sem: readonly Sem[]): boolean {
  return sem.includes("person") || sem.includes("animal");
}

function pick<T>(items: readonly T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)]!;
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function genderOf(word: SlotWord, side: "prompt" | "answer"): Gender {
  return (side === "prompt" ? word.prompt : word.answer).gender ?? "n";
}

type ClauseBits = {
  subject: SlotWord;
  subjectAttr?: SlotWord;
  verb?: SlotWord;
  object?: SlotWord;
  objectAttr?: SlotWord;
  adj?: SlotWord;
  tense: Tense;
  negated: boolean;
  question: boolean;
  adverb?: string;
  pp?: { prepForm: string; prepCase: "acc" | "dat" | "loc" | "nom"; noun: SlotWord };
  number: GramNumber;
};

function renderClause(lang: LangCode, side: "prompt" | "answer", bits: ClauseBits): string | null {
  const subGender = genderOf(bits.subject, side);
  const subj = renderNp(lang, {
    noun: bits.subject,
    side,
    role: "nom",
    number: bits.number,
    attr: bits.subjectAttr,
    animate: isAnimate(bits.subject.sem),
  });
  if (!subj) return null;

  if (bits.adj) {
    const adj = renderPredAdj(lang, bits.adj, side, subGender);
    if (!adj) return null;
    return renderCopular(lang, subj, adj, bits);
  }

  if (!bits.verb) return null;
  const verbSurface = side === "prompt" ? bits.verb.prompt : bits.verb.answer;
  const verb = finiteVerb(lang, verbSurface, bits.tense, subGender, bits.number);
  if (!verb) return null;

  let obj: string | null = null;
  if (bits.object) {
    obj = renderNp(lang, {
      noun: bits.object,
      side,
      role: "acc",
      number: "sg",
      attr: bits.objectAttr,
      animate: isAnimate(bits.object.sem),
    });
    if (!obj) return null;
  }

  let pp: string | null = null;
  if (bits.pp) {
    const np = renderNp(lang, {
      noun: bits.pp.noun,
      side,
      role: bits.pp.prepCase === "nom" ? "nom" : bits.pp.prepCase,
      animate: isAnimate(bits.pp.noun.sem),
    });
    if (!np) return null;
    if (lang === "ja") pp = `${np}${bits.pp.prepForm}`;
    else if (lang === "zh") pp = `${bits.pp.prepForm}${np}`;
    else pp = `${bits.pp.prepForm} ${np}`;
  }

  return assembleVerbal(lang, {
    subject: subj,
    verb: verb.form,
    verbAlts: verb.alts,
    object: obj,
    negated: bits.negated,
    question: bits.question,
    adverb: bits.adverb,
    pp,
    tense: bits.tense,
  });
}

function renderCopular(lang: LangCode, subject: string, adj: string, bits: ClauseBits): string | null {
  const cc = closedClass(lang);
  let cop = cc.copula;
  if (bits.tense === "past" && cc.copulaPast) cop = cc.copulaPast;
  if (bits.tense === "future" && cc.copulaFuture) cop = cc.copulaFuture;

  if (lang === "zh") {
    const core = bits.negated ? `${subject}不很${adj}` : `${subject}很${adj}`;
    return core;
  }
  if (lang === "ja") {
    const core = bits.negated ? `${subject}は${adj}ではありません` : `${subject}は${adj}です`;
    return core;
  }
  if (lang === "ru" && bits.tense === "present") {
    const core = bits.negated ? `${subject} не ${adj}` : `${subject} ${adj}`;
    return core;
  }

  if (lang === "de") {
    if (bits.question) return `${cop} ${subject} ${bits.negated ? "nicht " : ""}${adj}`.replace(/\s+/g, " ").trim();
    return `${subject} ${cop} ${bits.negated ? "nicht " : ""}${adj}`.replace(/\s+/g, " ").trim();
  }

  if (lang === "fr" && bits.negated) {
    return `${subject} n'${cop} pas ${adj}`;
  }

  if (bits.question && lang === "en") {
    const aux = bits.tense === "past" ? "was" : bits.tense === "future" ? "will" : "is";
    if (bits.tense === "future") return `${aux} ${subject} be ${adj}`;
    return `${aux} ${subject} ${bits.negated ? "not " : ""}${adj}`.trim();
  }
  if (bits.question && (lang === "pl") && cc.qParticle) {
    return `${cc.qParticle} ${subject} ${cop} ${bits.negated ? "nie " : ""}${adj}`.replace(/\s+/g, " ").trim();
  }

  const neg =
    bits.negated && lang === "en"
      ? "not "
      : bits.negated && (lang === "pl" || lang === "es" || lang === "it" || lang === "pt" || lang === "nl" || lang === "ru")
        ? `${cc.not} `
        : "";
  if (!cop) return `${subject} ${neg}${adj}`.replace(/\s+/g, " ").trim();
  return `${subject} ${cop} ${neg}${adj}`.replace(/\s+/g, " ").trim();
}

function assembleVerbal(
  lang: LangCode,
  parts: {
    subject: string;
    verb: string;
    verbAlts: string[];
    object: string | null;
    negated: boolean;
    question: boolean;
    adverb?: string;
    pp: string | null;
    tense: Tense;
  },
): string | null {
  const cc = closedClass(lang);
  const obj = parts.object;
  const adv = parts.adverb;
  const pp = parts.pp;

  if (lang === "zh") {
    const neg = parts.negated ? cc.not : "";
    const mid = [adv, pp, neg, parts.verb, obj].filter(Boolean).join("");
    return `${parts.subject}${mid}`;
  }
  if (lang === "ja") {
    const objBit = obj ? `${obj}を` : "";
    const advBit = adv ?? "";
    const ppBit = pp ?? "";
    let verb = parts.verb;
    if (parts.negated) {
      // Prefer plain-form alt + ない when available; otherwise skip.
      const plain = parts.verbAlts[0];
      if (!plain) return null;
      verb = `${plain.replace(/る$/, "")}ない`;
    }
    return `${parts.subject}は${ppBit}${advBit}${objBit}${verb}`;
  }

  // German V2 / verb-final handled below.
  if (lang === "de") {
    return assembleGerman(parts);
  }

  // English questions / negation with do-support for present lexical verbs.
  if (lang === "en") {
    return assembleEnglish(parts);
  }

  if (lang === "pl") {
    return assemblePolish(parts);
  }

  // Default SVO / SV with optional negation particle before verb.
  const neg = parts.negated ? `${cc.not} ` : "";
  if (parts.question && cc.qParticle) {
    const body = [parts.subject, neg + parts.verb, obj, adv, pp].filter(Boolean).join(" ");
    return `${cc.qParticle} ${body}`.replace(/\s+/g, " ").trim();
  }
  if (parts.question && (lang === "nl" || lang === "es" || lang === "it" || lang === "pt" || lang === "fr")) {
    // Simple inversion / rising intonation: Verb Subject Object for NL; others keep order + ?
    if (lang === "nl") {
      const body = [parts.verb, parts.subject, obj, adv, pp].filter(Boolean).join(" ");
      return body;
    }
  }
  const body = [parts.subject, neg + parts.verb, obj, adv, pp].filter(Boolean).join(" ");
  return body.replace(/\s+/g, " ").trim();
}

function assembleEnglish(parts: {
  subject: string;
  verb: string;
  object: string | null;
  negated: boolean;
  question: boolean;
  adverb?: string;
  pp: string | null;
  tense: Tense;
}): string | null {
  const obj = parts.object;
  const tail = [obj, parts.adverb, parts.pp].filter(Boolean).join(" ");

  if (parts.tense === "future") {
    // verb form is "will sleep"
    const base = parts.verb.replace(/^will\s+/, "");
    if (parts.question) {
      return `will ${parts.subject} ${parts.negated ? "not " : ""}${base}${tail ? ` ${tail}` : ""}`.trim();
    }
    return `${parts.subject} will ${parts.negated ? "not " : ""}${base}${tail ? ` ${tail}` : ""}`.trim();
  }

  if (parts.question || parts.negated) {
    const aux = parts.tense === "past" ? "did" : "does";
    // Recover base from 3sg/past is hard; for present use strip -s heuristic on verb when present.
    let base = parts.verb;
    if (parts.tense === "present") {
      if (base.endsWith("ies")) base = `${base.slice(0, -3)}y`;
      else if (base.endsWith("es") && /(s|x|z|ch|sh)es$/i.test(base)) base = base.slice(0, -2);
      else if (base.endsWith("s")) base = base.slice(0, -1);
    }
    // For past questions/negation, EN_PAST was already applied — use lemma-like from "did"
    // When tense is past, finiteVerb returned past form; do-support needs base. Skip unsafe past q/neg.
    if (parts.tense === "past") {
      // "did the cat sleep" needs base; we only allow past statements without do-support complexity
      // unless not question and not negated (handled below).
      if (parts.question || parts.negated) return null;
    }
    if (parts.question) {
      return `${aux} ${parts.subject} ${parts.negated ? "not " : ""}${base}${tail ? ` ${tail}` : ""}`.trim();
    }
    return `${parts.subject} ${aux} not ${base}${tail ? ` ${tail}` : ""}`.trim();
  }

  return `${parts.subject} ${parts.verb}${tail ? ` ${tail}` : ""}`.trim();
}

function assemblePolish(parts: {
  subject: string;
  verb: string;
  object: string | null;
  negated: boolean;
  question: boolean;
  adverb?: string;
  pp: string | null;
}): string {
  const cc = closedClass("pl");
  const neg = parts.negated ? `${cc.not} ` : "";
  const body = [parts.subject, neg + parts.verb, parts.object, parts.adverb, parts.pp].filter(Boolean).join(" ");
  if (parts.question) return `${cc.qParticle} ${body}`.replace(/\s+/g, " ").trim();
  return body.replace(/\s+/g, " ").trim();
}

function assembleGerman(parts: {
  subject: string;
  verb: string;
  object: string | null;
  negated: boolean;
  question: boolean;
  adverb?: string;
  pp: string | null;
  tense: Tense;
}): string {
  // Perfect: "hat gesehen" / "ist gegangen" — finite aux in V2, participle at end.
  const perfect = parts.verb.includes(" ") ? parts.verb.split(" ") : null;
  const finite = perfect ? perfect[0]! : parts.verb;
  const participle = perfect && perfect.length > 1 ? perfect.slice(1).join(" ") : null;

  const mid: string[] = [];
  if (parts.object) mid.push(parts.object);
  if (parts.adverb) mid.push(parts.adverb);
  if (parts.pp) mid.push(parts.pp);
  if (parts.negated) mid.push("nicht");

  if (parts.question) {
    const bits = [finite, parts.subject, ...mid];
    if (participle) bits.push(participle);
    if (parts.tense === "future" && parts.verb.startsWith("wird ")) {
      // wird + infinitive at end
      const inf = parts.verb.replace(/^wird\s+/, "");
      return ["wird", parts.subject, ...mid.filter((x) => x !== "nicht"), parts.negated ? "nicht" : "", inf]
        .filter(Boolean)
        .join(" ");
    }
    return bits.filter(Boolean).join(" ");
  }

  if (parts.tense === "future" && parts.verb.startsWith("wird ")) {
    const inf = parts.verb.replace(/^wird\s+/, "");
    return [parts.subject, "wird", ...mid.filter((x) => x !== "nicht"), parts.negated ? "nicht" : "", inf]
      .filter(Boolean)
      .join(" ");
  }

  const bits = [parts.subject, finite, ...mid];
  if (participle) bits.push(participle);
  return bits.filter(Boolean).join(" ");
}

function renderSubordinate(
  lang: LangCode,
  side: "prompt" | "answer",
  main: ClauseBits,
  marker: "because" | "when" | "if",
  dep: ClauseBits,
): string | null {
  const cc = closedClass(lang);
  const conj = cc[marker];
  const mainText = renderClause(lang, side, { ...main, question: false });
  if (!mainText) return null;

  if (lang === "de") {
    const depInner = renderGermanVerbFinal(side, dep);
    if (!depInner) return null;
    return `${mainText}, ${conj} ${depInner}`;
  }

  const depText = renderClause(lang, side, { ...dep, question: false });
  if (!depText) return null;

  if (lang === "zh") {
    if (marker === "because") return `${conj}${depText}所以${mainText}`;
    if (marker === "if") return `${conj}${depText}就${mainText}`;
    return `${conj}${depText}时${mainText}`;
  }
  if (lang === "ja") {
    return `${depText}${conj}${mainText}`;
  }
  return `${mainText} ${conj} ${depText}`;
}

function renderGermanVerbFinal(side: "prompt" | "answer", bits: ClauseBits): string | null {
  const subj = renderNp("de", {
    noun: bits.subject,
    side,
    role: "nom",
    number: bits.number,
    attr: bits.subjectAttr,
    animate: isAnimate(bits.subject.sem),
  });
  if (!subj) return null;
  if (bits.adj) {
    const adj = renderPredAdj("de", bits.adj, side, genderOf(bits.subject, side));
    if (!adj) return null;
    const cop = bits.tense === "past" ? "war" : bits.tense === "future" ? "sein wird" : "ist";
    return `${subj} ${bits.negated ? "nicht " : ""}${adj} ${cop}`.replace(/\s+/g, " ").trim();
  }
  if (!bits.verb) return null;
  const verbSurface = side === "prompt" ? bits.verb.prompt : bits.verb.answer;
  const verb = finiteVerb("de", verbSurface, bits.tense, genderOf(bits.subject, side), bits.number);
  if (!verb) return null;
  let obj: string | null = null;
  if (bits.object) {
    obj = renderNp("de", {
      noun: bits.object,
      side,
      role: "acc",
      attr: bits.objectAttr,
      animate: isAnimate(bits.object.sem),
    });
    if (!obj) return null;
  }
  const mid = [obj, bits.adverb, bits.negated ? "nicht" : ""].filter(Boolean);
  if (verb.form.includes(" ")) {
    const [aux, ...rest] = verb.form.split(" ");
    return `${subj} ${mid.join(" ")} ${rest.join(" ")} ${aux}`.replace(/\s+/g, " ").trim();
  }
  if (bits.tense === "future" && verb.form.startsWith("wird ")) {
    const inf = verb.form.replace(/^wird\s+/, "");
    return `${subj} ${mid.join(" ")} ${inf} wird`.replace(/\s+/g, " ").trim();
  }
  return `${subj} ${mid.join(" ")} ${verb.form}`.replace(/\s+/g, " ").trim();
}

function renderCoord(
  lang: LangCode,
  side: "prompt" | "answer",
  left: ClauseBits,
  conjKey: "and" | "but" | "or",
  right: ClauseBits,
): string | null {
  const cc = closedClass(lang);
  const a = renderClause(lang, side, { ...left, question: false });
  const b = renderClause(lang, side, { ...right, question: false });
  if (!a || !b) return null;
  if (lang === "zh" || lang === "ja") return `${a}${cc[conjKey]}${b}`;
  return `${a} ${cc[conjKey]} ${b}`;
}

function renderRelative(lang: LangCode, side: "prompt" | "answer", head: ClauseBits, mainVerb: SlotWord, object?: SlotWord): string | null {
  // "The dog that sleeps sees the cat" — head NP with relative vi clause as subject of vt.
  const cc = closedClass(lang);
  const relBits: ClauseBits = {
    subject: head.subject,
    subjectAttr: head.subjectAttr,
    verb: head.verb,
    tense: "present",
    negated: false,
    question: false,
    number: "sg",
  };
  const headNp = renderNp(lang, {
    noun: head.subject,
    side,
    role: "nom",
    attr: head.subjectAttr,
    animate: isAnimate(head.subject.sem),
  });
  if (!headNp || !head.verb) return null;

  const verbSurface = side === "prompt" ? mainVerb.prompt : mainVerb.answer;
  const mainFin = finiteVerb(lang, verbSurface, "present", genderOf(head.subject, side), "sg");
  if (!mainFin) return null;

  let obj: string | null = null;
  if (object) {
    obj = renderNp(lang, {
      noun: object,
      side,
      role: "acc",
      animate: isAnimate(object.sem),
    });
    if (!obj) return null;
  }

  if (lang === "en") {
    const relVerb = finiteVerb("en", side === "prompt" ? head.verb.prompt : head.verb.answer, "present", genderOf(head.subject, side), "sg");
    if (!relVerb) return null;
    const subj = `${headNp} that ${relVerb.form}`;
    return obj ? `${subj} ${mainFin.form} ${obj}` : `${subj} ${mainFin.form}`;
  }
  if (lang === "de") {
    const relVerb = finiteVerb("de", side === "prompt" ? head.verb.prompt : head.verb.answer, "present", genderOf(head.subject, side), "sg");
    if (!relVerb) return null;
    const gender = genderOf(head.subject, side);
    const relPron = gender === "f" ? "die" : gender === "n" ? "das" : "der";
    // der Hund, der schläft, sieht die Katze
    const subj = `${headNp}, ${relPron} ${relVerb.form},`;
    return obj ? `${subj} ${mainFin.form} ${obj}` : `${subj} ${mainFin.form}`;
  }
  if (lang === "pl") {
    const relVerb = finiteVerb("pl", side === "prompt" ? head.verb.prompt : head.verb.answer, "present", genderOf(head.subject, side), "sg");
    if (!relVerb) return null;
    const gender = genderOf(head.subject, side);
    const relPron = gender === "f" ? "która" : gender === "n" ? "które" : "który";
    const subj = `${headNp}, ${relPron} ${relVerb.form},`;
    return obj ? `${subj} ${mainFin.form} ${obj}` : `${subj} ${mainFin.form}`;
  }
  // Fallback: skip relative for other languages when agreement is unclear.
  void cc;
  void relBits;
  return null;
}

function clauseFromParts(
  subject: SlotWord,
  opts: Partial<ClauseBits> & { verb?: SlotWord; adj?: SlotWord },
): ClauseBits {
  return {
    subject,
    subjectAttr: opts.subjectAttr,
    verb: opts.verb,
    object: opts.object,
    objectAttr: opts.objectAttr,
    adj: opts.adj,
    tense: opts.tense ?? "present",
    negated: opts.negated ?? false,
    question: opts.question ?? false,
    adverb: opts.adverb,
    pp: opts.pp,
    number: opts.number ?? "sg",
  };
}

function finalize(
  lang: LangCode,
  text: string | null,
  question: boolean,
  alts: string[] = [],
): string[] {
  if (!text) return [];
  const main = endSentence(capitalize(text, lang), lang, question);
  const out = [main];
  for (const alt of alts) {
    out.push(endSentence(capitalize(alt, lang), lang, question));
  }
  // Japanese plain-form adjective / verb alts are added by callers when needed.
  return [...new Set(out)];
}

/**
 * Compose one sentence for the pair. Returns null if the chosen structure
 * cannot be filled with reliable morphology from the current vocab.
 */
export function composeOne(
  index: VocabIndex,
  promptLang: LangCode,
  answerLang: LangCode,
  structure: StructureKind,
  rng: () => number,
  difficulty: number,
): PracticeSentence | null {
  const nouns = index.nouns;
  const verbs = index.verbs;
  const adjectives = index.adjectives;
  if (nouns.length === 0) return null;

  const tryBuild = (): PracticeSentence | null => {
    switch (structure) {
      case "vi":
      case "attr-vi":
      case "vi-adv":
      case "neg-vi":
      case "q-vi":
      case "past-vi":
      case "future-vi":
        return buildVi(structure);
      case "vt":
      case "attr-vt":
      case "vt-pp":
      case "neg-vt":
      case "q-vt":
      case "past-vt":
        return buildVt(structure);
      case "adj":
        return buildAdj();
      case "coord-and":
      case "coord-but":
        return buildCoord(structure === "coord-but" ? "but" : "and");
      case "subord-because":
      case "subord-when":
      case "subord-if":
        return buildSubord(structure === "subord-because" ? "because" : structure === "subord-when" ? "when" : "if");
      case "rel-vi":
        return buildRel();
      default:
        return null;
    }
  };

  function buildVi(kind: StructureKind): PracticeSentence | null {
    const viVerbs = verbs.filter((v) => (v.valence ?? "vi") === "vi" || !v.object);
    const verb = pick(viVerbs.length ? viVerbs : verbs, rng);
    if (!verb) return null;
    const subjects = nouns.filter((n) => overlaps(n.sem, verb.subject));
    const subject = pick(subjects.length ? subjects : nouns, rng);
    if (!subject) return null;
    const attr = kind.startsWith("attr") ? pick(adjectives, rng) ?? undefined : undefined;
    if (kind.startsWith("attr") && !attr) return null;
    const tense: Tense = kind === "past-vi" ? "past" : kind === "future-vi" ? "future" : "present";
    const bits = clauseFromParts(subject, {
      verb,
      subjectAttr: attr ?? undefined,
      tense,
      negated: kind.startsWith("neg"),
      question: kind.startsWith("q"),
      adverb: kind === "vi-adv" ? pickAdverb(promptLang, rng) : undefined,
    });
    // Adverb must be language-specific per side — rebuild per language.
    const promptAdv = kind === "vi-adv" ? pickAdverb(promptLang, () => 0) : undefined;
    const answerAdv = kind === "vi-adv" ? closedClass(answerLang).adverbs[closedClass(promptLang).adverbs.indexOf(promptAdv ?? "")] ?? pickAdverb(answerLang, rng) : undefined;

    const promptBits = { ...bits, adverb: kind === "vi-adv" ? promptAdv : undefined };
    const answerBits = { ...bits, adverb: kind === "vi-adv" ? answerAdv : undefined };

    const prompt = renderClause(promptLang, "prompt", promptBits);
    const answer = renderClause(answerLang, "answer", answerBits);
    if (!prompt || !answer) return null;

    // Japanese verb alts
    const answerVerb = answerLang === "ja" ? bits.verb?.answer.alts ?? [] : [];
    const accepted = finalize(answerLang, answer, bits.question);
    if (answerLang === "ja" && answerVerb[0] && bits.verb) {
      const plainBits = { ...answerBits };
      const plain = renderClause(answerLang, "answer", {
        ...plainBits,
        // force plain by temporarily swapping fin
      });
      void plain;
      const polite = accepted[0]!;
      const replaced = polite.replace(bits.verb.answer.fin ?? "", answerVerb[0]);
      if (replaced !== polite) accepted.push(replaced);
    }

    const promptText = finalize(promptLang, prompt, bits.question)[0];
    if (!promptText || accepted.length === 0) return null;
    const wordIds = [subject.id, verb.id, attr?.id].filter(Boolean) as string[];
    return {
      id: `${kind}:${wordIds.join(":")}`,
      frame: kind,
      structure: kind,
      wordIds,
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  function buildVt(kind: StructureKind): PracticeSentence | null {
    const vtVerbs = verbs.filter((v) => v.valence === "vt" || Boolean(v.object));
    const verb = pick(vtVerbs.length ? vtVerbs : verbs.filter((v) => v.valence !== "vi"), rng) ?? pick(verbs, rng);
    if (!verb) return null;
    const subjects = nouns.filter((n) => overlaps(n.sem, verb.subject));
    const subject = pick(subjects.length ? subjects : nouns, rng);
    if (!subject) return null;
    const objects = nouns.filter((n) => n.id !== subject.id && overlaps(n.sem, verb.object ?? ["thing", "person", "animal", "food", "drink", "readable", "place"]));
    const object = pick(objects.length ? objects : nouns.filter((n) => n.id !== subject.id), rng);
    if (!object) return null;
    const attr = kind.startsWith("attr") ? pick(adjectives, rng) ?? undefined : undefined;
    if (kind.startsWith("attr") && !attr) return null;
    const tense: Tense = kind === "past-vt" ? "past" : "present";

    let ppPrompt: ClauseBits["pp"];
    let ppAnswer: ClauseBits["pp"];
    if (kind === "vt-pp") {
      const place = pick(
        nouns.filter((n) => n.id !== subject.id && n.id !== object.id && (n.sem.includes("place") || n.sem.includes("thing"))),
        rng,
      );
      if (!place) return null;
      const prepP = pickPrep(promptLang, rng);
      const prepA = closedClass(answerLang).prepositions.find((p) => p.key === prepP.key) ?? pickPrep(answerLang, rng);
      ppPrompt = { prepForm: prepP.form, prepCase: prepP.case, noun: place };
      ppAnswer = { prepForm: prepA.form, prepCase: prepA.case, noun: place };
    }

    const base = {
      verb,
      object,
      subjectAttr: attr ?? undefined,
      tense,
      negated: kind.startsWith("neg"),
      question: kind.startsWith("q"),
    };
    const promptBits = clauseFromParts(subject, { ...base, pp: ppPrompt });
    const answerBits = clauseFromParts(subject, { ...base, pp: ppAnswer });
    const prompt = renderClause(promptLang, "prompt", promptBits);
    const answer = renderClause(answerLang, "answer", answerBits);
    if (!prompt || !answer) return null;
    const promptText = finalize(promptLang, prompt, promptBits.question)[0];
    const accepted = finalize(answerLang, answer, answerBits.question);
    if (!promptText || accepted.length === 0) return null;
    const wordIds = [subject.id, verb.id, object.id, attr?.id, ppPrompt?.noun.id].filter(Boolean) as string[];
    return {
      id: `${kind}:${wordIds.join(":")}`,
      frame: kind,
      structure: kind,
      wordIds,
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  function buildAdj(): PracticeSentence | null {
    const subject = pick(nouns, rng);
    const adj = pick(adjectives, rng);
    if (!subject || !adj) return null;
    const bits = clauseFromParts(subject, { adj, tense: "present" });
    const prompt = renderClause(promptLang, "prompt", bits);
    const answer = renderClause(answerLang, "answer", bits);
    if (!prompt || !answer) return null;
    const promptText = finalize(promptLang, prompt, false)[0];
    const accepted = finalize(answerLang, answer, false);
    // Japanese plain adj without です
    if (answerLang === "ja" && accepted[0]) {
      accepted.push(accepted[0].replace(/です。/, "。"));
    }
    if (!promptText || accepted.length === 0) return null;
    return {
      id: `adj:${subject.id}:${adj.id}`,
      frame: "adj",
      structure: "adj",
      wordIds: [subject.id, adj.id],
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  function pickSubjectFor(verb: SlotWord): SlotWord | null {
    const matched = nouns.filter((n) => overlaps(n.sem, verb.subject));
    return pick(matched.length ? matched : [], rng);
  }

  function buildCoord(conj: "and" | "but"): PracticeSentence | null {
    const viVerbs = verbs.filter((v) => (v.valence ?? "vi") === "vi" || !v.object);
    const verbL = pick(viVerbs.length ? viVerbs : verbs, rng);
    const verbR = pick(viVerbs.length ? viVerbs : verbs, rng);
    if (!verbL || !verbR) return null;
    const subjL = pickSubjectFor(verbL);
    const subjR = pickSubjectFor(verbR);
    if (!subjL || !subjR) return null;
    if (subjL.id === subjR.id && verbL.id === verbR.id) return null;
    const leftBits = clauseFromParts(subjL, { verb: verbL });
    const rightBits = clauseFromParts(subjR, { verb: verbR });
    const prompt = renderCoord(promptLang, "prompt", leftBits, conj, rightBits);
    const answer = renderCoord(answerLang, "answer", leftBits, conj, rightBits);
    if (!prompt || !answer) return null;
    const kind = conj === "but" ? "coord-but" : "coord-and";
    const promptText = finalize(promptLang, prompt, false)[0];
    const accepted = finalize(answerLang, answer, false);
    if (!promptText || accepted.length === 0) return null;
    return {
      id: `${kind}:${subjL.id}:${verbL.id}:${subjR.id}:${verbR.id}`,
      frame: kind,
      structure: kind,
      wordIds: [subjL.id, verbL.id, subjR.id, verbR.id],
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  function buildSubord(marker: "because" | "when" | "if"): PracticeSentence | null {
    const viVerbs = verbs.filter((v) => (v.valence ?? "vi") === "vi" || !v.object);
    const verbM = pick(viVerbs.length ? viVerbs : verbs, rng);
    const verbD = pick(viVerbs.length ? viVerbs : verbs, rng);
    if (!verbM || !verbD) return null;
    const subjectM = pickSubjectFor(verbM);
    const subjectD = pickSubjectFor(verbD);
    if (!subjectM || !subjectD) return null;
    const main = clauseFromParts(subjectM, { verb: verbM });
    const dep = clauseFromParts(subjectD, { verb: verbD });
    const prompt = renderSubordinate(promptLang, "prompt", main, marker, dep);
    const answer = renderSubordinate(answerLang, "answer", main, marker, dep);
    if (!prompt || !answer) return null;
    const kind = `subord-${marker}` as StructureKind;
    const promptText = finalize(promptLang, prompt, false)[0];
    const accepted = finalize(answerLang, answer, false);
    if (!promptText || accepted.length === 0) return null;
    return {
      id: `${kind}:${subjectM.id}:${verbM.id}:${subjectD.id}:${verbD.id}`,
      frame: kind,
      structure: kind,
      wordIds: [subjectM.id, verbM.id, subjectD.id, verbD.id],
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  function buildRel(): PracticeSentence | null {
    const headNoun = pick(
      nouns.filter((n) => isAnimate(n.sem)),
      rng,
    );
    const viVerbs = verbs.filter((v) => (v.valence ?? "vi") === "vi" || !v.object);
    const relVerb = pick(viVerbs, rng);
    const mainVerb = pick(
      verbs.filter((v) => v.valence === "vt" || Boolean(v.object)),
      rng,
    );
    const object = pick(
      nouns.filter((n) => n.id !== headNoun?.id),
      rng,
    );
    if (!headNoun || !relVerb || !mainVerb || !object) return null;
    // Only languages with solid relative support
    if (!["en", "de", "pl"].includes(promptLang) || !["en", "de", "pl"].includes(answerLang)) return null;
    const headBits = clauseFromParts(headNoun, { verb: relVerb });
    const prompt = renderRelative(promptLang, "prompt", headBits, mainVerb, object);
    const answer = renderRelative(answerLang, "answer", headBits, mainVerb, object);
    if (!prompt || !answer) return null;
    const promptText = finalize(promptLang, prompt, false)[0];
    const accepted = finalize(answerLang, answer, false);
    if (!promptText || accepted.length === 0) return null;
    return {
      id: `rel-vi:${headNoun.id}:${relVerb.id}:${mainVerb.id}:${object.id}`,
      frame: "rel-vi",
      structure: "rel-vi",
      wordIds: [headNoun.id, relVerb.id, mainVerb.id, object.id],
      prompt: promptText,
      accepted,
      difficulty,
    };
  }

  // A few attempts with the chosen structure before giving up.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const built = tryBuild();
    if (built) return built;
  }
  return null;
}

/** Exhaustive simple clauses (vi / vt / adj) with deterministic morphology. */
export function enumerateBasicClauses(
  index: VocabIndex,
  promptLang: LangCode,
  answerLang: LangCode,
  difficulty: number,
): PracticeSentence[] {
  const out: PracticeSentence[] = [];
  const { nouns, verbs, adjectives } = index;

  for (const verb of verbs) {
    const valence = verb.valence ?? "vi";
    for (const subject of nouns) {
      if (!overlaps(subject.sem, verb.subject)) continue;
      if (valence === "vi" || !verb.object) {
        const bits = clauseFromParts(subject, { verb });
        const prompt = renderClause(promptLang, "prompt", bits);
        const answer = renderClause(answerLang, "answer", bits);
        if (!prompt || !answer) continue;
        const accepted = finalize(answerLang, answer, false);
        if (answerLang === "ja" && verb.answer.alts?.[0] && verb.answer.fin) {
          const polite = accepted[0];
          if (polite) {
            const replaced = polite.replace(verb.answer.fin, verb.answer.alts[0]);
            if (replaced !== polite) accepted.push(replaced);
          }
        }
        const promptText = finalize(promptLang, prompt, false)[0];
        if (!promptText || accepted.length === 0) continue;
        out.push({
          id: `vi:${subject.id}:${verb.id}`,
          frame: "vi",
          structure: "vi",
          wordIds: [subject.id, verb.id],
          prompt: promptText,
          accepted,
          difficulty,
        });
        continue;
      }

      for (const object of nouns) {
        if (object.id === subject.id) continue;
        if (verb.object && !overlaps(object.sem, verb.object)) continue;
        const bits = clauseFromParts(subject, { verb, object });
        const prompt = renderClause(promptLang, "prompt", bits);
        const answer = renderClause(answerLang, "answer", bits);
        if (!prompt || !answer) continue;
        const accepted = finalize(answerLang, answer, false);
        if (answerLang === "ja" && verb.answer.alts?.[0] && verb.answer.fin) {
          const polite = accepted[0];
          if (polite) {
            const replaced = polite.replace(verb.answer.fin, verb.answer.alts[0]);
            if (replaced !== polite) accepted.push(replaced);
          }
        }
        const promptText = finalize(promptLang, prompt, false)[0];
        if (!promptText || accepted.length === 0) continue;
        out.push({
          id: `vt:${subject.id}:${verb.id}:${object.id}`,
          frame: "vt",
          structure: "vt",
          wordIds: [subject.id, verb.id, object.id],
          prompt: promptText,
          accepted,
          difficulty,
        });
      }
    }
  }

  for (const subject of nouns) {
    for (const adj of adjectives) {
      const bits = clauseFromParts(subject, { adj });
      const prompt = renderClause(promptLang, "prompt", bits);
      const answer = renderClause(answerLang, "answer", bits);
      if (!prompt || !answer) continue;
      const accepted = finalize(answerLang, answer, false);
      if (answerLang === "ja" && accepted[0]) accepted.push(accepted[0].replace(/です。/, "。"));
      const promptText = finalize(promptLang, prompt, false)[0];
      if (!promptText || accepted.length === 0) continue;
      out.push({
        id: `adj:${subject.id}:${adj.id}`,
        frame: "adj",
        structure: "adj",
        wordIds: [subject.id, adj.id],
        prompt: promptText,
        accepted,
        difficulty,
      });
    }
  }

  return out;
}

/**
 * Build a pool of distinct compositional sentences for unlock counting and rounds.
 * Always includes exhaustive basic vi/vt/adj clauses, then samples richer structures.
 */
export function composePool(
  index: VocabIndex,
  promptLang: LangCode,
  answerLang: LangCode,
  progress: GeneratorProgress,
  opts: { max?: number; rng?: () => number; avoidStructures?: ReadonlySet<string> } = {},
): PracticeSentence[] {
  const max = opts.max ?? 120;
  const rng = opts.rng ?? Math.random;
  const level = difficultyLevel(progress);
  const structures = structuresForLevel(level);
  const avoid = opts.avoidStructures ?? new Set<string>();
  const byId = new Map<string, PracticeSentence>();

  const basics = enumerateBasicClauses(index, promptLang, answerLang, level);
  // Keep simple clauses for unlock / golden coverage, but when VT fan-out is huge
  // cap them so compositional structures still fit in the pool.
  const basicBudget = Math.max(32, Math.floor(max * 0.45));
  const basicKeep =
    basics.length <= basicBudget
      ? basics
      : (() => {
          const copy = [...basics];
          shuffleInPlace(copy, rng);
          return copy.slice(0, basicBudget);
        })();
  for (const sentence of basicKeep) {
    byId.set(sentence.id, sentence);
  }

  const preferred = structures.filter((s) => !avoid.has(s) && s !== "vi" && s !== "vt" && s !== "adj");
  const order = preferred.length > 0 ? preferred : structures.filter((s) => s !== "vi" && s !== "vt" && s !== "adj");

  let guard = 0;
  while (byId.size < max && guard < max * 14 && order.length > 0) {
    guard += 1;
    const pickStructure = order[Math.floor(rng() * order.length)]!;
    const sentence = composeOne(index, promptLang, answerLang, pickStructure, rng, level);
    if (sentence) byId.set(sentence.id, sentence);
  }

  // If compositional sampling failed (tiny vocab), fall back to all basics.
  if (byId.size < MIN_BASIC_FALLBACK) {
    for (const sentence of basics) {
      byId.set(sentence.id, sentence);
      if (byId.size >= max) break;
    }
  }

  const list = [...byId.values()];
  list.sort((a, b) => a.id.localeCompare(b.id));
  return list;
}

/**
 * Sample a round, avoiding the previous structure tag when alternatives exist.
 */
export function sampleComposed(
  pool: readonly PracticeSentence[],
  size: number,
  rng: () => number = Math.random,
  previousIds: ReadonlySet<string> = new Set(),
  previousStructures: ReadonlySet<string> = new Set(),
): PracticeSentence[] {
  const level = pool.reduce((max, item) => Math.max(max, item.difficulty), 0);
  const rich = pool.filter((item) => !["vi", "vt", "adj"].includes(item.structure));
  // At higher difficulty, bias the working set toward compositional structures so
  // rounds are not flooded by the exhaustive simple-clause enumeration.
  const biasedPool =
    level >= 3 && rich.length >= Math.min(size, 4)
      ? [...rich, ...rich, ...pool]
      : [...pool];

  const preferred = biasedPool.filter((item) => !previousIds.has(item.id) && !previousStructures.has(item.structure));
  const withoutIds = biasedPool.filter((item) => !previousIds.has(item.id));
  let working =
    preferred.length >= Math.min(size, biasedPool.length)
      ? [...preferred]
      : withoutIds.length >= Math.min(size, biasedPool.length)
        ? [...withoutIds]
        : [...biasedPool];
  // Dedupe by id while preserving bias order, then shuffle.
  const seen = new Set<string>();
  working = working.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  shuffleInPlace(working, rng);

  const out: PracticeSentence[] = [];
  const usedStructures: string[] = [];
  for (const item of working) {
    if (out.length >= size) break;
    if (usedStructures.length > 0 && item.structure === usedStructures[usedStructures.length - 1] && working.length > size) {
      continue;
    }
    out.push(item);
    usedStructures.push(item.structure);
  }
  if (out.length < Math.min(size, pool.length)) {
    for (const item of working) {
      if (out.length >= size) break;
      if (out.some((x) => x.id === item.id)) continue;
      out.push(item);
    }
  }
  return out;
}
