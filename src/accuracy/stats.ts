import type { NoveltyBias, SessionSize } from "../types";

/** Newest result is the low bit. 1 is correct. */
export const RECENT_WINDOW = 8;
export const KNOWN_TAIL = 2;
export const WEAK_ACCURACY = 0.6;
export const STAT_CAP = 1500;

/**
 * Exponent k in weight = 1 / (1 + attempts)^k for All-focus novelty bias.
 * Off (k=0) yields uniform weights; Strong (k=2) heavily favors unseen words.
 */
export const NOVELTY_BIAS_EXPONENTS: Record<NoveltyBias, number> = {
  off: 0,
  light: 0.5,
  medium: 1,
  strong: 2,
};

export const NOVELTY_BIAS_OPTIONS: readonly NoveltyBias[] = ["off", "light", "medium", "strong"];

export function isNoveltyBias(value: unknown): value is NoveltyBias {
  return value === "off" || value === "light" || value === "medium" || value === "strong";
}

export type WordStat = {
  correct: number;
  attempts: number;
  lastSeen: number;
  windowBits: number;
  windowLen: number;
  manual: boolean;
};

/** Compact on-disk shape: [correct, attempts, lastSeenMs, windowBits, windowLen, manual]. */
export type StatTuple = [number, number, number, number, number, number];

export type AccuracyDoc = {
  words: Record<string, StatTuple>;
  updatedAt: string;
};

export function dirKey(from: string, to: string): string {
  return `${from}_${to}`;
}

export function parseDirKey(key: string): [string, string] | null {
  const match = /^([a-z]{2})_([a-z]{2})$/.exec(key);
  if (!match || match[1] === match[2]) return null;
  return [match[1], match[2]];
}

export function toTuple(stat: WordStat): StatTuple {
  return [stat.correct, stat.attempts, stat.lastSeen, stat.windowBits, stat.windowLen, stat.manual ? 1 : 0];
}

export function fromTuple(value: unknown): WordStat | null {
  if (!Array.isArray(value) || value.length < 5) return null;
  const [correct, attempts, lastSeen, windowBits, windowLen, manual] = value as unknown[];
  if (![correct, attempts, lastSeen, windowBits, windowLen].every((item) => typeof item === "number" && Number.isFinite(item))) {
    return null;
  }
  const safeCorrect = Math.max(0, Math.floor(correct as number));
  const safeAttempts = Math.max(safeCorrect, Math.floor(attempts as number));
  const len = Math.max(0, Math.min(RECENT_WINDOW, Math.floor(windowLen as number)));
  const mask = len === 0 ? 0 : (1 << len) - 1;
  return {
    correct: safeCorrect,
    attempts: safeAttempts,
    lastSeen: Math.floor(lastSeen as number),
    windowBits: Math.floor(windowBits as number) & mask,
    windowLen: len,
    manual: manual === 1 || manual === true,
  };
}

export function recordAttempt(stat: WordStat | undefined, correct: boolean, now: number): WordStat {
  const prev = stat ?? {
    correct: 0,
    attempts: 0,
    lastSeen: now,
    windowBits: 0,
    windowLen: 0,
    manual: false,
  };
  const windowLen = Math.min(RECENT_WINDOW, prev.windowLen + 1);
  const mask = (1 << windowLen) - 1;
  return {
    correct: prev.correct + (correct ? 1 : 0),
    attempts: prev.attempts + 1,
    lastSeen: now,
    windowBits: (((prev.windowBits << 1) | (correct ? 1 : 0)) & 0xff) & mask,
    windowLen,
    manual: prev.manual,
  };
}

/** Null deletes a row that has no attempts and is not marked. */
export function withManual(stat: WordStat | undefined, manual: boolean, now: number): WordStat | null {
  if (!manual && (!stat || stat.attempts === 0)) return null;
  const prev = stat ?? {
    correct: 0,
    attempts: 0,
    lastSeen: now,
    windowBits: 0,
    windowLen: 0,
    manual: false,
  };
  return { ...prev, manual, lastSeen: now };
}

export function isKnown(stat: WordStat | undefined): boolean {
  if (!stat) return false;
  if (stat.manual) return true;
  return stat.windowLen >= KNOWN_TAIL && (stat.windowBits & 0b11) === 0b11;
}

/**
 * Read-time merge of A→B and B→A stats for sentence quiz. Storage stays on
 * per-direction docs (`accuracy/{from}_{to}`); this does not write or migrate.
 * Sums lifetime counts, ORs manual marks, and concatenates recent windows
 * oldest→newest by lastSeen (capped at RECENT_WINDOW) so known/weak thresholds
 * apply to one combined score for the unordered pair.
 */
export function combinePairStat(
  a: WordStat | undefined,
  b: WordStat | undefined,
): WordStat | undefined {
  if (!a) return b;
  if (!b) return a;

  const older = a.lastSeen <= b.lastSeen ? a : b;
  const newer = a.lastSeen <= b.lastSeen ? b : a;
  const attemptsOldestFirst: boolean[] = [];
  for (const side of [older, newer]) {
    for (let i = side.windowLen - 1; i >= 0; i -= 1) {
      attemptsOldestFirst.push(((side.windowBits >> i) & 1) === 1);
    }
  }
  const recent = attemptsOldestFirst.slice(-RECENT_WINDOW);
  let windowBits = 0;
  for (const ok of recent) {
    windowBits = (windowBits << 1) | (ok ? 1 : 0);
  }

  return {
    correct: a.correct + b.correct,
    attempts: a.attempts + b.attempts,
    lastSeen: Math.max(a.lastSeen, b.lastSeen),
    windowBits,
    windowLen: recent.length,
    manual: a.manual || b.manual,
  };
}

/**
 * Pair knowledge is unordered: merge A→B and B→A at read time, then apply the
 * usual known threshold to that combined stat. EN–PL does not transfer to EN–DE.
 */
export function isKnownPair(
  forward: WordStat | undefined,
  reverse: WordStat | undefined,
): boolean {
  return isKnown(combinePairStat(forward, reverse));
}

export type PairKnownSummary = {
  /** Words known for this unordered pair (combined A↔B score). */
  known: number;
};

/** Summarize pair-level known status from existing per-direction accuracy maps. */
export function summarizePairKnown(
  ids: readonly string[],
  forward: ReadonlyMap<string, WordStat>,
  reverse: ReadonlyMap<string, WordStat>,
): PairKnownSummary {
  let known = 0;
  for (const id of ids) {
    if (isKnownPair(forward.get(id), reverse.get(id))) known += 1;
  }
  return { known };
}

export function knownIdSet(stats: ReadonlyMap<string, WordStat>): Set<string> {
  const ids = new Set<string>();
  for (const [id, stat] of stats) {
    if (isKnown(stat)) ids.add(id);
  }
  return ids;
}

function ratio(correct: number, total: number): number {
  if (total <= 0) return 1;
  return correct / total;
}

export function windowAccuracy(stat: WordStat): number {
  if (stat.windowLen <= 0) return 1;
  let bits = stat.windowBits;
  let ones = 0;
  for (let i = 0; i < stat.windowLen; i += 1) {
    ones += bits & 1;
    bits >>= 1;
  }
  return ones / stat.windowLen;
}

export function isWeak(stat: WordStat | undefined): boolean {
  if (!stat || stat.attempts < 1) return false;
  if (ratio(stat.correct, stat.attempts) < WEAK_ACCURACY) return true;
  return windowAccuracy(stat) < WEAK_ACCURACY;
}

export function weakCount(pool: readonly { id: string }[], stats: ReadonlyMap<string, WordStat>): number {
  let count = 0;
  for (const card of pool) {
    if (isWeak(stats.get(card.id))) count += 1;
  }
  return count;
}

/**
 * Weak focus stays on the selected quiz direction (from→to). Sentence quiz
 * uses combinePairStat for known/weak/eligibility on the unordered pair;
 * flashcard Weak words does not use that helper.
 */
export function focusHint(focus: "all" | "weak", weak: number): string {
  if (focus === "all") return "Every card in this band can come up.";
  if (weak === 0) {
    return "No misses recorded for this direction yet, so a round still uses the whole band.";
  }
  const noun = weak === 1 ? "word" : "words";
  return `${weak} weak ${noun} in this band for this direction. A short round uses those first and fills with new cards if it needs more. Choosing All cards uses only the weak ones.`;
}

export function mergeStat(a: WordStat, b: WordStat): WordStat {
  const newer = a.lastSeen >= b.lastSeen ? a : b;
  const correct = Math.max(a.correct, b.correct);
  const attempts = Math.max(a.attempts, b.attempts, correct);
  return {
    correct,
    attempts,
    lastSeen: newer.lastSeen,
    windowBits: newer.windowBits,
    windowLen: newer.windowLen,
    manual: newer.manual,
  };
}

export function statsToDoc(stats: ReadonlyMap<string, WordStat>, updatedAt: string): AccuracyDoc {
  const words: Record<string, StatTuple> = {};
  for (const [id, stat] of stats) words[id] = toTuple(stat);
  return { words, updatedAt };
}

export function docToStats(doc: AccuracyDoc | null | undefined): Map<string, WordStat> {
  const map = new Map<string, WordStat>();
  if (!doc?.words) return map;
  for (const [id, tuple] of Object.entries(doc.words)) {
    if (!id || id.length > 80) continue;
    const stat = fromTuple(tuple);
    if (stat) map.set(id, stat);
  }
  return map;
}

function evict(stats: Map<string, WordStat>): void {
  while (stats.size > STAT_CAP) {
    let dropId: string | null = null;
    let dropSeen = Number.POSITIVE_INFINITY;
    let unmarked = false;
    for (const stat of stats.values()) {
      if (!stat.manual) {
        unmarked = true;
        break;
      }
    }
    for (const [id, stat] of stats) {
      if (unmarked && stat.manual) continue;
      if (stat.lastSeen < dropSeen) {
        dropSeen = stat.lastSeen;
        dropId = id;
      }
    }
    if (!dropId) break;
    stats.delete(dropId);
  }
}

export function putStat(stats: ReadonlyMap<string, WordStat>, id: string, stat: WordStat | null): Map<string, WordStat> {
  const next = new Map(stats);
  if (!id || id.length > 80 || !stat) next.delete(id);
  else next.set(id, stat);
  evict(next);
  return next;
}

export function mergeStats(local: ReadonlyMap<string, WordStat>, remote: ReadonlyMap<string, WordStat>): Map<string, WordStat> {
  const next = new Map<string, WordStat>();
  const ids = new Set([...local.keys(), ...remote.keys()]);
  for (const id of ids) {
    const left = local.get(id);
    const right = remote.get(id);
    if (left && right) next.set(id, mergeStat(left, right));
    else if (left) next.set(id, left);
    else if (right) next.set(id, right);
  }
  evict(next);
  return next;
}

export function sameWords(a: AccuracyDoc | undefined, b: AccuracyDoc | undefined): boolean {
  if (!a || !b) return false;
  const aKeys = Object.keys(a.words);
  if (aKeys.length !== Object.keys(b.words).length) return false;
  return aKeys.every((id) => {
    const left = a.words[id];
    const right = b.words[id];
    return Boolean(right) && left.length === right.length && left.every((item, index) => item === right[index]);
  });
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Lifetime attempts for the unordered pair (A→B + B→A), matching known-pair scoring. */
export function pairAttempts(
  forward: WordStat | undefined,
  reverse: WordStat | undefined,
): number {
  return combinePairStat(forward, reverse)?.attempts ?? 0;
}

/**
 * Sampling weight for All-focus novelty bias.
 * weight = 1 / (1 + attempts)^k with k from NOVELTY_BIAS_EXPONENTS.
 */
export function noveltyWeight(attempts: number, bias: NoveltyBias): number {
  const k = NOVELTY_BIAS_EXPONENTS[bias];
  if (k === 0) return 1;
  const safe = Math.max(0, attempts);
  return 1 / (1 + safe) ** k;
}

export function noveltyBiasHint(bias: NoveltyBias, focus: "all" | "weak"): string {
  if (focus === "weak") {
    return "Newer-word bias applies only when Focus is All. Weak words keep their own order.";
  }
  if (bias === "off") return "Each card in the band is equally likely.";
  if (bias === "light") return "Slightly favors words you have practiced less (both directions combined).";
  if (bias === "medium") return "Prefers less-practiced words; heavily practiced ones still appear.";
  return "Strongly favors new and rarely practiced words; practiced ones can still show up.";
}

/**
 * Weighted random sample without replacement. Zero-weight rows fall back to a
 * uniform draw among remaining items when the total weight is zero.
 */
export function weightedSampleWithoutReplacement<T>(
  items: readonly T[],
  weights: readonly number[],
  limit: number,
  rng: () => number,
): T[] {
  const remaining = items.map((item, index) => ({
    item,
    weight: Math.max(0, weights[index] ?? 0),
  }));
  const picked: T[] = [];
  const n = Math.min(Math.max(0, limit), remaining.length);
  for (let pick = 0; pick < n; pick += 1) {
    let total = 0;
    for (const entry of remaining) total += entry.weight;
    let index = remaining.length - 1;
    if (total <= 0) {
      index = Math.min(remaining.length - 1, Math.max(0, Math.floor(rng() * remaining.length)));
    } else {
      let target = rng() * total;
      for (let i = 0; i < remaining.length; i += 1) {
        target -= remaining[i]!.weight;
        if (target < 0) {
          index = i;
          break;
        }
      }
    }
    const [chosen] = remaining.splice(index, 1);
    if (chosen) picked.push(chosen.item);
  }
  return picked;
}

export type SelectCardsOptions = {
  /** Prefer less-practiced words when Focus is All. Default off (uniform). */
  noveltyBias?: NoveltyBias;
  /**
   * Opposite-direction stats for the same unordered pair. Used with `stats`
   * via combinePairStat so practice count matches pair-level known scoring.
   */
  reverseStats?: ReadonlyMap<string, WordStat>;
};

/**
 * All shuffles the band and cuts it to the round size, the same shape as a
 * normal session. With noveltyBias other than off, All uses weighted sampling
 * by combined pair attempts instead of a uniform shuffle. Weak prefers
 * low-accuracy cards and fills a short round when there are not enough of
 * them. With no history it uses the whole band. Weak ignores noveltyBias.
 */
export function selectCards<T extends { id: string }>(
  pool: readonly T[],
  stats: ReadonlyMap<string, WordStat>,
  focus: "all" | "weak",
  size: SessionSize,
  rng: () => number = Math.random,
  options?: SelectCardsOptions,
): T[] {
  const limit = size === "all" ? pool.length : Math.max(0, size);
  if (focus !== "weak") {
    const bias = options?.noveltyBias ?? "off";
    if (bias === "off") return shuffle(pool, rng).slice(0, limit);
    const reverse = options?.reverseStats;
    const weights = pool.map((card) =>
      noveltyWeight(pairAttempts(stats.get(card.id), reverse?.get(card.id)), bias),
    );
    return weightedSampleWithoutReplacement(pool, weights, limit, rng);
  }

  const weak: T[] = [];
  const unseen: T[] = [];
  const rest: T[] = [];
  for (const card of pool) {
    const stat = stats.get(card.id);
    if (isWeak(stat)) weak.push(card);
    else if (!stat || stat.attempts === 0) unseen.push(card);
    else rest.push(card);
  }
  if (weak.length === 0) return shuffle(pool, rng).slice(0, limit);
  if (size === "all") return shuffle(weak, rng);
  return [...shuffle(weak, rng), ...shuffle(unseen, rng), ...shuffle(rest, rng)].slice(0, limit);
}
