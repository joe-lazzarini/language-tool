import type { LangCode } from "./languages";

/**
 * Language-specific lemma *candidates* for when the dictionary is unavailable.
 * Callers must verify each candidate (Wiktionary / known data) before accepting —
 * never silently guess an unverified form.
 *
 * zh / ja: empty (no productive inflection rules in this app).
 */
export function lemmaCandidates(lang: LangCode, surface: string): string[] {
  const word = surface.trim().replace(/\s+/g, " ");
  if (!word || /\s/.test(word)) return [];
  switch (lang) {
    case "pl":
      return polishCandidates(word);
    case "en":
      return englishCandidates(word);
    case "de":
      return germanCandidates(word);
    case "es":
      return romanceCandidates(word, ["ar", "er", "ir"]);
    case "fr":
      return frenchCandidates(word);
    case "it":
      return romanceCandidates(word, ["are", "ere", "ire"]);
    case "pt":
      return romanceCandidates(word, ["ar", "er", "ir"]);
    case "nl":
      return dutchCandidates(word);
    case "ru":
      return russianCandidates(word);
    case "zh":
    case "ja":
      return [];
    default:
      return [];
  }
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.normalize("NFC");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function polishCandidates(word: string): string[] {
  const out: string[] = [];
  // Present 1sg: -am / -em / -ę → infinitive candidates
  if (word.endsWith("am") && word.length > 3) out.push(`${word.slice(0, -2)}ać`);
  if (word.endsWith("em") && word.length > 3) {
    out.push(`${word.slice(0, -2)}eć`, `${word.slice(0, -2)}ić`);
  }
  if (word.endsWith("ę") && word.length > 2) {
    // robię → robić (íć-class 1sg replaces final ć with ę)
    out.push(`${word.slice(0, -1)}ć`);
    // Soft-stem -ać verbs (piszę → pisać) and -eć are verified later.
    const stem = word.slice(0, -1);
    if (stem.endsWith("sz") || stem.endsWith("ż") || stem.endsWith("cz")) {
      out.push(`${stem.slice(0, -1)}ać`, `${stem.slice(0, -2)}ać`);
    }
    out.push(`${stem}eć`, `${stem}ać`);
  }
  // Present 2sg
  if (word.endsWith("asz") && word.length > 4) out.push(`${word.slice(0, -3)}ać`);
  if (word.endsWith("isz") && word.length > 4) out.push(`${word.slice(0, -3)}ić`);
  if (word.endsWith("ysz") && word.length > 4) out.push(`${word.slice(0, -3)}yć`);
  // Present 3sg -a (weak signal; verification required)
  if (word.endsWith("a") && word.length > 3 && !word.endsWith("ia") && !word.endsWith("ła")) {
    out.push(`${word.slice(0, -1)}ać`);
  }
  // Genitive / locative singular -u / -a → bare stem (noun)
  if (word.endsWith("u") && word.length > 3) out.push(word.slice(0, -1));
  if (word.endsWith("a") && word.length > 3) out.push(word.slice(0, -1));
  // Feminine / non-virile plural -y / -i
  if ((word.endsWith("y") || word.endsWith("i")) && word.length > 3) {
    out.push(`${word.slice(0, -1)}a`);
  }
  return uniq(out);
}

function englishCandidates(word: string): string[] {
  const lower = word.toLocaleLowerCase("en-US");
  const out: string[] = [];
  const irregular: Record<string, string> = {
    went: "go",
    gone: "go",
    was: "be",
    were: "be",
    been: "be",
    did: "do",
    done: "do",
    had: "have",
    children: "child",
    men: "man",
    women: "woman",
    mice: "mouse",
    feet: "foot",
    teeth: "tooth",
    better: "good",
    best: "good",
    worse: "bad",
    worst: "bad",
  };
  if (irregular[lower]) out.push(irregular[lower]);
  if (lower.endsWith("ies") && lower.length > 4) out.push(`${lower.slice(0, -3)}y`);
  if (lower.endsWith("ves") && lower.length > 4) {
    out.push(`${lower.slice(0, -3)}f`, `${lower.slice(0, -3)}fe`);
  }
  if (lower.endsWith("es") && lower.length > 3) out.push(lower.slice(0, -2), lower.slice(0, -1));
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) out.push(lower.slice(0, -1));
  if (lower.endsWith("ied") && lower.length > 4) out.push(`${lower.slice(0, -3)}y`);
  if (lower.endsWith("ed") && lower.length > 3) {
    out.push(lower.slice(0, -2), lower.slice(0, -1));
    if (/(.)\1ed$/.test(lower)) out.push(lower.slice(0, -3));
  }
  if (lower.endsWith("ing") && lower.length > 4) {
    out.push(lower.slice(0, -3));
    if (/(.)\1ing$/.test(lower)) out.push(lower.slice(0, -4));
    out.push(`${lower.slice(0, -3)}e`);
  }
  return uniq(out.filter((item) => item !== lower));
}

function germanCandidates(word: string): string[] {
  const out: string[] = [];
  const irregular: Record<string, string> = {
    ging: "gehen",
    kam: "kommen",
    war: "sein",
    hatte: "haben",
    wurde: "werden",
    häuser: "Haus",
    kinder: "Kind",
    männer: "Mann",
    frauen: "Frau",
    bücher: "Buch",
  };
  const folded = word.toLocaleLowerCase("de-DE");
  if (irregular[folded]) out.push(irregular[folded]);
  // Weak adjective / plural endings. Prefer longer suffixes first so
  // "kleinen" → "klein" is tried before "kleine".
  for (const ending of ["em", "en", "er", "es", "e"] as const) {
    if (folded.endsWith(ending) && folded.length > ending.length + 2) {
      out.push(folded.slice(0, -ending.length));
    }
  }
  // ge-…-t participle → stem + en
  if (/^ge.+t$/i.test(word) && word.length > 4) {
    out.push(`${folded.slice(2, -1)}en`, `${folded.slice(2)}en`);
  }
  return uniq(out.filter((item) => item !== folded));
}

function romanceCandidates(word: string, infinitives: string[]): string[] {
  const lower = word.toLocaleLowerCase();
  const out: string[] = [];
  // Common finite endings → try each infinitive class on the stem
  const endings = [
    "amos",
    "áis",
    "ais",
    "an",
    "as",
    "o",
    "e",
    "es",
    "emos",
    "éis",
    "en",
    "imos",
    "ís",
    "en",
    "i",
    "iamo",
    "ate",
    "ete",
    "ono",
    "ano",
    "iamo",
    "ete",
    "iamo",
  ];
  for (const ending of endings) {
    if (lower.endsWith(ending) && lower.length > ending.length + 1) {
      const stem = lower.slice(0, -ending.length);
      for (const inf of infinitives) out.push(stem + inf);
    }
  }
  // Noun plurals: -as/-os → -a/-o ; Italian -i → -o/-e ; -es → -e/-∅
  if (lower.endsWith("as") && lower.length > 3) out.push(`${lower.slice(0, -1)}`);
  if (lower.endsWith("os") && lower.length > 3) out.push(`${lower.slice(0, -1)}`);
  if (lower.endsWith("es") && lower.length > 3) out.push(lower.slice(0, -1), lower.slice(0, -2));
  if (lower.endsWith("i") && lower.length > 2) {
    out.push(`${lower.slice(0, -1)}o`, `${lower.slice(0, -1)}e`);
  }
  return uniq(out.filter((item) => item !== lower));
}

function frenchCandidates(word: string): string[] {
  const lower = word.toLocaleLowerCase("fr-FR");
  const out: string[] = [];
  // Present / imperative fragments → -er / -ir / -re
  for (const ending of ["ons", "ez", "ent", "e", "es", "is", "it", "issez", "issent"] as const) {
    if (lower.endsWith(ending) && lower.length > ending.length + 1) {
      const stem = lower.slice(0, -ending.length);
      out.push(`${stem}er`, `${stem}ir`, `${stem}re`);
    }
  }
  if (lower.endsWith("s") && lower.length > 3) out.push(lower.slice(0, -1));
  return uniq(out.filter((item) => item !== lower));
}

function dutchCandidates(word: string): string[] {
  const lower = word.toLocaleLowerCase("nl-NL");
  const out: string[] = [];
  const irregular: Record<string, string> = {
    ging: "gaan",
    was: "zijn",
    had: "hebben",
    huizen: "huis",
    kinderen: "kind",
  };
  if (irregular[lower]) out.push(irregular[lower]);
  if (lower.endsWith("en") && lower.length > 4) out.push(lower.slice(0, -2));
  if (lower.endsWith("s") && lower.length > 3) out.push(lower.slice(0, -1));
  return uniq(out.filter((item) => item !== lower));
}

function russianCandidates(word: string): string[] {
  // Light-touch: strip common case / person endings; verification required.
  const out: string[] = [];
  const endings = ["ами", "ями", "ах", "ях", "ов", "ев", "ей", "ом", "ем", "ам", "ям", "у", "ю", "а", "я", "ы", "и", "е"];
  for (const ending of endings) {
    if (word.endsWith(ending) && word.length > ending.length + 1) {
      out.push(word.slice(0, -ending.length));
    }
  }
  // 3sg present -ит / -ет → infinitive -ить / -еть / -ать
  if (word.endsWith("ит") && word.length > 3) out.push(`${word.slice(0, -2)}ить`);
  if (word.endsWith("ет") && word.length > 3) {
    out.push(`${word.slice(0, -2)}еть`, `${word.slice(0, -2)}ать`);
  }
  return uniq(out);
}
