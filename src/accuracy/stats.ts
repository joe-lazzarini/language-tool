import type { SessionSize } from "../types";

/** Newest result is the low bit. 1 is correct. */
export const RECENT_WINDOW = 8;
export const KNOWN_TAIL = 2;
export const WEAK_ACCURACY = 0.6;
export const STAT_CAP = 1500;

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

export function focusHint(focus: "all" | "weak", weak: number): string {
  if (focus === "all") return "Every card in this band can come up.";
  if (weak === 0) {
    return "No misses recorded for this pair yet, so a round still uses the whole band.";
  }
  const noun = weak === 1 ? "word" : "words";
  return `${weak} weak ${noun} in this band for this pair. A short round uses those first and fills with new cards if it needs more. Choosing All cards uses only the weak ones.`;
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

/**
 * All shuffles the band and cuts it to the round size, the same shape as a
 * normal session. Weak prefers low-accuracy cards and fills a short round
 * when there are not enough of them. With no history it uses the whole band.
 */
export function selectCards<T extends { id: string }>(
  pool: readonly T[],
  stats: ReadonlyMap<string, WordStat>,
  focus: "all" | "weak",
  size: SessionSize,
  rng: () => number = Math.random,
): T[] {
  const limit = size === "all" ? pool.length : Math.max(0, size);
  if (focus !== "weak") return shuffle(pool, rng).slice(0, limit);

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
