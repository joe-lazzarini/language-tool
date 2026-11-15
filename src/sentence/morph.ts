import type { LangCode } from "../lib/languages";
import type { Case, Gender, GramNumber, LangSurface, Tense } from "./types";

function capitalizeDe(lemma: string): string {
  if (!lemma) return lemma;
  return lemma.charAt(0).toLocaleUpperCase("de-DE") + lemma.slice(1);
}

/** Definite article for German by gender and case. */
export function germanArticle(gender: Gender, role: Case, number: GramNumber = "sg"): string | null {
  if (number === "pl") {
    if (role === "nom" || role === "acc") return "die";
    if (role === "dat") return "den";
    if (role === "gen") return "der";
    return null;
  }
  if (role === "nom") {
    if (gender === "m") return "der";
    if (gender === "f") return "die";
    return "das";
  }
  if (role === "acc") {
    if (gender === "m") return "den";
    if (gender === "f") return "die";
    return "das";
  }
  if (role === "dat") {
    if (gender === "m" || gender === "n") return "dem";
    return "der";
  }
  if (role === "gen") {
    if (gender === "f") return "der";
    return "des";
  }
  return null;
}

/**
 * Weak adjective ending after a definite article (der/die/das…).
 * Uses the lemma and appends the ending; strips a trailing -e first when present.
 */
export function germanAttrAdj(lemma: string, gender: Gender, role: Case, number: GramNumber = "sg"): string {
  const stem = lemma.replace(/e$/i, "");
  let ending = "e";
  if (number === "pl") {
    ending = role === "dat" ? "en" : "e";
  } else if (role === "nom") {
    ending = "e";
  } else if (role === "acc") {
    ending = gender === "m" ? "en" : "e";
  } else if (role === "dat" || role === "gen") {
    ending = "en";
  }
  return `${stem}${ending}`;
}

/** English regular plural; returns null for words that look irregular without data. */
export function enPlural(lemma: string): string | null {
  const w = lemma.toLowerCase();
  const irregular: Record<string, string> = {
    child: "children",
    man: "men",
    woman: "women",
    person: "people",
    mouse: "mice",
    goose: "geese",
    foot: "feet",
    tooth: "teeth",
    leaf: "leaves",
    knife: "knives",
    life: "lives",
    sheep: "sheep",
    fish: "fish",
    deer: "deer",
  };
  if (irregular[w]) return irregular[w]!;
  if (w.endsWith("s") || w.endsWith("x") || w.endsWith("z") || w.endsWith("ch") || w.endsWith("sh")) return `${w}es`;
  if (w.endsWith("y") && w.length > 1 && !"aeiou".includes(w[w.length - 2]!)) return `${w.slice(0, -1)}ies`;
  if (w.endsWith("f")) return `${w.slice(0, -1)}ves`;
  if (w.endsWith("fe")) return `${w.slice(0, -2)}ves`;
  return `${w}s`;
}

const EN_PAST: Record<string, string> = {
  sleep: "slept",
  see: "saw",
  read: "read",
  eat: "ate",
  drink: "drank",
  go: "went",
  come: "came",
  write: "wrote",
  speak: "spoke",
  take: "took",
  give: "gave",
  find: "found",
  know: "knew",
  think: "thought",
  bring: "brought",
  buy: "bought",
  run: "ran",
  sit: "sat",
  stand: "stood",
  make: "made",
  have: "had",
  be: "was",
  do: "did",
  say: "said",
  get: "got",
  leave: "left",
  feel: "felt",
  meet: "met",
  hear: "heard",
  hold: "held",
  keep: "kept",
  lose: "lost",
  pay: "paid",
  sell: "sold",
  tell: "told",
  win: "won",
  begin: "began",
  break: "broke",
  choose: "chose",
  drive: "drove",
  fall: "fell",
  fly: "flew",
  forget: "forgot",
  grow: "grew",
  hide: "hid",
  hit: "hit",
  hurt: "hurt",
  put: "put",
  shut: "shut",
  cut: "cut",
  let: "let",
  set: "set",
  swim: "swam",
  teach: "taught",
  understand: "understood",
  wear: "wore",
  work: "worked",
  play: "played",
  walk: "walked",
  watch: "watched",
  look: "looked",
  live: "lived",
  love: "loved",
  like: "liked",
  want: "wanted",
  need: "needed",
  open: "opened",
  close: "closed",
  start: "started",
  stop: "stopped",
  help: "helped",
  ask: "asked",
  call: "called",
  wait: "waited",
  learn: "learned",
  study: "studied",
  cook: "cooked",
  wash: "washed",
  clean: "cleaned",
};

export function enPast(lemma: string): string | null {
  const w = lemma.toLowerCase().replace(/^to\s+/, "");
  if (EN_PAST[w]) return EN_PAST[w]!;
  if (w.endsWith("e")) return `${w}d`;
  if (w.endsWith("y") && w.length > 1 && !"aeiou".includes(w[w.length - 2]!)) return `${w.slice(0, -1)}ied`;
  if (w.length >= 3 && !"aeiou".includes(w[w.length - 1]!) && "aeiou".includes(w[w.length - 2]!) && !"aeiou".includes(w[w.length - 3]!)) {
    return `${w}${w[w.length - 1]}ed`;
  }
  return `${w}ed`;
}

export function enFuture(lemma: string): string {
  return `will ${lemma.toLowerCase().replace(/^to\s+/, "")}`;
}

export function enBase(lemma: string): string {
  return lemma.toLowerCase().replace(/^to\s+/, "");
}

/** Polish nominative plural for common productive patterns; null if unsafe. */
export function plPlural(lemma: string, gender: Gender): string | null {
  const lower = lemma.toLowerCase();
  const irregular: Record<string, string> = {
    pies: "psy",
    kot: "koty",
    dom: "domy",
    człowiek: "ludzie",
    dziecko: "dzieci",
    książka: "książki",
    przyjaciel: "przyjaciele",
    oko: "oczy",
    ręka: "ręce",
  };
  if (irregular[lower]) return irregular[lower]!;
  if (gender === "f" && lower.endsWith("ka")) return `${lemma.slice(0, -2)}ki`;
  if (gender === "f" && lower.endsWith("a")) return `${lemma.slice(0, -1)}y`;
  if (gender === "n" && lower.endsWith("o")) return `${lemma.slice(0, -1)}a`;
  if (gender === "n" && lower.endsWith("e")) return `${lemma.slice(0, -1)}a`;
  if (gender === "m" && (lower.endsWith("k") || lower.endsWith("g") || lower.endsWith("ch"))) return `${lemma}i`;
  if (gender === "m") return `${lemma}y`;
  return null;
}

/** Polish locative singular — only when productive or listed; else null. */
export function plLocative(lemma: string, gender: Gender): string | null {
  const lower = lemma.toLowerCase();
  const irregular: Record<string, string> = {
    dom: "domu",
    pies: "psie",
    kot: "kocie",
    książka: "książce",
    woda: "wodzie",
    dziecko: "dziecku",
    szkoła: "szkole",
    miasto: "mieście",
    praca: "pracy",
    pokój: "pokoju",
    stół: "stole",
    las: "lesie",
  };
  if (irregular[lower]) return irregular[lower]!;
  if (gender === "f" && lower.endsWith("ka")) return `${lemma.slice(0, -2)}ce`;
  if (gender === "f" && lower.endsWith("a")) return `${lemma.slice(0, -1)}ie`;
  if (gender === "n" && lower.endsWith("o")) return `${lemma.slice(0, -1)}ie`;
  if (gender === "m") return `${lemma}ie`;
  return null;
}

/**
 * Polish genitive singular — needed for genitive-of-negation on direct objects.
 * Returns null when the pattern is unsafe rather than guessing.
 */
export function plGenitive(lemma: string, gender: Gender, animate = false): string | null {
  const lower = lemma.toLowerCase();
  const irregular: Record<string, string> = {
    pies: "psa",
    kot: "kota",
    dom: "domu",
    dziecko: "dziecka",
    książka: "książki",
    woda: "wody",
    przyjaciel: "przyjaciela",
    człowiek: "człowieka",
    ojciec: "ojca",
    brat: "brata",
    mąż: "męża",
    bóg: "boga",
    stół: "stołu",
    pokój: "pokoju",
    koń: "konia",
    nauczyciel: "nauczyciela",
  };
  if (irregular[lower]) return irregular[lower]!;
  if (gender === "f" && lower.endsWith("a")) {
    const stem = lemma.slice(0, -1);
    const last = stem.slice(-1).toLowerCase();
    // Soft stem / velar → -i; otherwise -y.
    if (last === "k" || last === "g" || stem.toLowerCase().endsWith("ch")) return `${stem}i`;
    return `${stem}y`;
  }
  if (gender === "n" && (lower.endsWith("o") || lower.endsWith("e") || lower.endsWith("um"))) {
    // dziecko is irregular above; productive neuters in -o → -a are rare/unsafe.
    return null;
  }
  if (gender === "m" && animate) {
    if (lower.endsWith("iec")) return `${lemma.slice(0, -3)}ca`;
    if (lower.endsWith("ek")) return `${lemma.slice(0, -2)}ka`;
    return `${lemma}a`;
  }
  if (gender === "m") {
    // Common inanimate masculine genitive in -u (domu, stołu); skip softer patterns.
    if (/[bcdfghjklmnprstwxz]$/i.test(lower)) return `${lemma}u`;
  }
  return null;
}

/**
 * Polish past 3rd person. Aspect is not fully modeled; uses imperfective-style -ł forms.
 * Returns null when the infinitive pattern is unfamiliar.
 */
export function plPast(lemma: string, gender: Gender, number: GramNumber = "sg"): string | null {
  const irregular: Record<string, { m: string; f: string; n: string; pl: string }> = {
    spać: { m: "spał", f: "spała", n: "spało", pl: "spali" },
    jeść: { m: "jadł", f: "jadła", n: "jadło", pl: "jedli" },
    pić: { m: "pił", f: "piła", n: "piło", pl: "pili" },
    widzieć: { m: "widział", f: "widziała", n: "widziało", pl: "widzieli" },
    czytać: { m: "czytał", f: "czytała", n: "czytało", pl: "czytali" },
    mieć: { m: "miał", f: "miała", n: "miało", pl: "mieli" },
    być: { m: "był", f: "była", n: "było", pl: "byli" },
    iść: { m: "szedł", f: "szła", n: "szło", pl: "szli" },
    móc: { m: "mógł", f: "mogła", n: "mogło", pl: "mogli" },
    chcieć: { m: "chciał", f: "chciała", n: "chciało", pl: "chcieli" },
    pracować: { m: "pracował", f: "pracowała", n: "pracowało", pl: "pracowali" },
    pisać: { m: "pisał", f: "pisała", n: "pisało", pl: "pisali" },
    mówić: { m: "mówił", f: "mówiła", n: "mówiło", pl: "mówili" },
    robić: { m: "robił", f: "robiła", n: "robiło", pl: "robili" },
  };
  const w = lemma.toLowerCase();
  const known = irregular[w];
  if (known) {
    if (number === "pl") return known.pl;
    return known[gender];
  }
  if (w.endsWith("ować")) {
    const stem = `${lemma.slice(0, -4)}owa`;
    if (number === "pl") return `${stem}li`;
    if (gender === "f") return `${stem}ła`;
    if (gender === "n") return `${stem}ło`;
    return `${stem}ł`;
  }
  if (w.endsWith("ać") || w.endsWith("eć") || w.endsWith("ić") || w.endsWith("yć")) {
    const stem = lemma.slice(0, -1);
    if (number === "pl") return `${stem}li`;
    if (gender === "f") return `${stem}ła`;
    if (gender === "n") return `${stem}ło`;
    return `${stem}ł`;
  }
  return null;
}

/** Polish future: będzie + infinitive (imperfective analytic). */
export function plFuture(lemma: string): string {
  return `będzie ${lemma}`;
}

/** Attributive Polish adjective agreeing in gender/case/number (sg only unless override). */
export function plAttrAdj(
  surface: LangSurface,
  gender: Gender,
  role: Case,
  number: GramNumber = "sg",
): string | null {
  if (number === "pl") return null;
  const lemma = surface.lemma;
  if (!lemma) return null;
  if (role === "nom") {
    if (gender === "m") return surface.attrNomM || surface.m || lemma;
    if (gender === "f") return surface.attrNomF || surface.f || lemma;
    return surface.attrNomN || surface.n || lemma;
  }
  if (role === "acc") {
    if (gender === "m") {
      // Animate objects use genitive-like -ego; inanimates = nominative.
      return surface.attrAccM || derivePlAttrAccM(lemma, surface.m || lemma);
    }
    if (gender === "f") {
      return surface.attrAccF || derivePlAttrAccF(surface.f || lemma);
    }
    return surface.attrAccN || surface.n || lemma;
  }
  return null;
}

function derivePlAttrAccM(lemma: string, nomM: string): string {
  const lower = lemma.toLowerCase();
  if (lower.endsWith("y") || lower.endsWith("i")) return `${nomM.slice(0, -1)}ego`;
  return `${nomM}ego`;
}

function derivePlAttrAccF(nomF: string): string {
  if (nomF.endsWith("a")) return `${nomF.slice(0, -1)}ą`;
  return nomF;
}

/** German finite present is already in surface.fin; past via war/hatte only for copula elsewhere. */
export function dePastParticiple(lemma: string): string | null {
  const irregular: Record<string, string> = {
    schlafen: "geschlafen",
    sehen: "gesehen",
    lesen: "gelesen",
    essen: "gegessen",
    trinken: "getrunken",
    gehen: "gegangen",
    kommen: "gekommen",
    schreiben: "geschrieben",
    sprechen: "gesprochen",
    geben: "gegeben",
    nehmen: "genommen",
    finden: "gefunden",
    wissen: "gewusst",
    denken: "gedacht",
    bringen: "gebracht",
    kaufen: "gekauft",
    arbeiten: "gearbeitet",
    spielen: "gespielt",
    machen: "gemacht",
    haben: "gehabt",
    sein: "gewesen",
    werden: "geworden",
    bleiben: "geblieben",
    helfen: "geholfen",
    laufen: "gelaufen",
    fahren: "gefahren",
  };
  const w = lemma.toLowerCase();
  if (irregular[w]) return irregular[w]!;
  if (w.endsWith("ieren")) return `ge${w.slice(0, -2)}t`;
  if (w.endsWith("en")) return `ge${w.slice(0, -2)}t`;
  return null;
}

const DE_SEIN_VERBS = new Set(["gehen", "kommen", "laufen", "fahren", "bleiben", "sein", "werden", "fliegen", "schwimmen"]);

export function dePerfect(lemma: string, finPresent: string): string | null {
  const part = dePastParticiple(lemma);
  if (!part) return null;
  const aux = DE_SEIN_VERBS.has(lemma.toLowerCase()) ? "ist" : "hat";
  // Keep present fin for agreement awareness; perfect is aux + participle (V2 handled by renderer).
  void finPresent;
  return `${aux} ${part}`;
}

export function deFuture(lemma: string): string {
  return `wird ${lemma}`;
}

/**
 * Resolve a noun head form (bare, no article) for a case/number.
 * Returns null when the required form cannot be derived safely.
 */
export function nounHead(
  lang: LangCode,
  surface: LangSurface,
  role: Case,
  opts: { number?: GramNumber; animate?: boolean } = {},
): string | null {
  const number = opts.number ?? "sg";
  const gender = surface.gender ?? "n";
  const lemma = surface.lemma?.trim();
  if (!lemma) return null;

  if (number === "pl") {
    if (surface.pl && (role === "nom" || (role === "acc" && !opts.animate))) return surface.pl;
    if (surface.plAcc && role === "acc") return surface.plAcc;
    if (lang === "en") return enPlural(lemma);
    if (lang === "pl") return role === "nom" || role === "acc" ? plPlural(lemma, gender) : null;
    if (lang === "zh" || lang === "ja") return lemma;
    // Without plural data, skip rather than guess for DE/RU/Romance.
    return null;
  }

  if (role === "nom") return lemma;
  if (role === "acc") {
    if (surface.acc) return surface.acc;
    if (lang === "pl" || lang === "ru" || lang === "de") {
      // Prefer stored acc; otherwise citation for languages that mark elsewhere (articles).
      return lemma;
    }
    return lemma;
  }
  if (role === "loc") {
    if (surface.loc) return surface.loc;
    if (lang === "pl") return plLocative(lemma, gender);
    return null;
  }
  if (role === "dat") {
    if (surface.dat) return surface.dat;
    return null;
  }
  if (role === "gen") {
    if (surface.gen) return surface.gen;
    if (lang === "pl") return plGenitive(lemma, gender, opts.animate === true);
    // Russian and others: skip rather than invent genitive.
    return null;
  }
  return lemma;
}

/**
 * Finite verb form for tense/polarity. Negation particles are applied by the renderer.
 * Returns null when the tense cannot be formed reliably.
 */
export function finiteVerb(
  lang: LangCode,
  surface: LangSurface,
  tense: Tense,
  subjectGender: Gender,
  number: GramNumber = "sg",
): { form: string; alts: string[] } | null {
  const lemma = surface.lemma?.trim() || surface.inf?.trim();
  const alts = surface.alts ?? [];

  if (tense === "present") {
    const form = surface.fin?.trim();
    if (!form) return null;
    return { form, alts };
  }

  if (tense === "past") {
    if (surface.past) return { form: surface.past, alts };
    if (number === "pl" && surface.pastPl) return { form: surface.pastPl, alts };
    if (subjectGender === "m" && surface.pastM) return { form: surface.pastM, alts };
    if (subjectGender === "f" && surface.pastF) return { form: surface.pastF, alts };
    if (subjectGender === "n" && surface.pastN) return { form: surface.pastN, alts };

    if (lang === "en" && lemma) {
      const past = enPast(lemma);
      return past ? { form: past, alts } : null;
    }
    if (lang === "pl" && lemma) {
      const past = plPast(lemma, subjectGender, number);
      return past ? { form: past, alts } : null;
    }
    if (lang === "de" && lemma && surface.fin) {
      const perfect = dePerfect(lemma, surface.fin);
      return perfect ? { form: perfect, alts } : null;
    }
    if (lang === "zh") {
      // Prefer the finite citation (看) over a divergent grammar lemma (见).
      const base = surface.fin?.trim() || lemma;
      return base ? { form: `${base}了`, alts } : null;
    }
    if (lang === "ja" && surface.fin) {
      // Only accept explicit past metadata; do not invent た-forms.
      return null;
    }
    return null;
  }

  // future
  if (surface.future) return { form: surface.future, alts };
  if (lang === "en" && lemma) return { form: enFuture(lemma), alts };
  if (lang === "pl" && lemma) return { form: plFuture(lemma), alts };
  if (lang === "de" && lemma) return { form: deFuture(lemma), alts };
  if (lang === "zh" && lemma) return { form: `会${lemma}`, alts };
  return null;
}

export function predicativeAdj(surface: LangSurface, gender: Gender): string | null {
  const text = surface[gender] || surface.lemma;
  return text?.trim() || null;
}

export { capitalizeDe };
