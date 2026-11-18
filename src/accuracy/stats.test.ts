import { describe, expect, it } from "vitest";
import {
  STAT_CAP,
  docToStats,
  focusHint,
  fromTuple,
  isKnown,
  isWeak,
  knownIdSet,
  mergeStat,
  putStat,
  recordAttempt,
  selectCards,
  statsToDoc,
  toTuple,
  windowAccuracy,
  withManual,
  type WordStat,
} from "./stats";
import { parseAccuracyDoc, parseAccuracyStore } from "./storage";

function missed(now = 1): WordStat {
  return recordAttempt(undefined, false, now);
}

describe("recordAttempt", () => {
  it("counts the attempt, shifts the window, and remembers when it happened", () => {
    const once = recordAttempt(undefined, true, 10);
    expect(once).toMatchObject({ correct: 1, attempts: 1, lastSeen: 10, windowLen: 1, windowBits: 1 });
    const twice = recordAttempt(once, false, 20);
    expect(twice).toMatchObject({ correct: 1, attempts: 2, lastSeen: 20, windowLen: 2 });
    expect(twice.windowBits & 1).toBe(0);
  });
});

describe("isKnown", () => {
  it("needs the two newest answers correct, or a manual mark", () => {
    const once = recordAttempt(undefined, true, 1);
    expect(isKnown(once)).toBe(false);
    const twice = recordAttempt(once, true, 2);
    expect(isKnown(twice)).toBe(true);
    expect(isKnown(recordAttempt(twice, false, 3))).toBe(false);
    const marked = withManual(undefined, true, 4);
    expect(marked && isKnown(marked)).toBe(true);
    expect(marked?.attempts).toBe(0);
    expect(withManual(marked ?? undefined, false, 5)).toBeNull();
  });

  it("keeps a manual mark when a later answer is wrong", () => {
    const marked = withManual(undefined, true, 1)!;
    const missedAfter = recordAttempt(marked, false, 2);
    expect(isKnown(missedAfter)).toBe(true);
    expect(missedAfter.attempts).toBe(1);
  });

  it("collects known ids from a map", () => {
    const stats = new Map<string, WordStat>([
      ["pl-103", recordAttempt(recordAttempt(undefined, true, 1), true, 2)],
      ["pl-1", recordAttempt(undefined, true, 3)],
    ]);
    expect([...knownIdSet(stats)]).toEqual(["pl-103"]);
  });
});

describe("isWeak", () => {
  it("treats a miss as weak and a clean record as solid", () => {
    expect(isWeak(undefined)).toBe(false);
    expect(isWeak(withManual(undefined, true, 1) ?? undefined)).toBe(false);
    expect(isWeak(missed())).toBe(true);
    let solid = recordAttempt(undefined, true, 1);
    solid = recordAttempt(solid, true, 2);
    solid = recordAttempt(solid, true, 3);
    solid = recordAttempt(solid, true, 4);
    expect(isWeak(solid)).toBe(false);
  });

  it("uses the recent window when lifetime accuracy is still high", () => {
    let stat = recordAttempt(undefined, true, 1);
    for (let i = 0; i < 19; i += 1) stat = recordAttempt(stat, true, i + 2);
    for (let i = 0; i < 5; i += 1) stat = recordAttempt(stat, false, 30 + i);
    expect(stat.correct / stat.attempts).toBeGreaterThan(0.6);
    expect(windowAccuracy(stat)).toBeLessThan(0.6);
    expect(isWeak(stat)).toBe(true);
    expect(isKnown(stat)).toBe(false);
  });
});

describe("selectCards", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const stats = new Map<string, WordStat>([
    ["a", missed()],
    ["b", recordAttempt(recordAttempt(undefined, true, 1), true, 2)],
  ]);

  it("keeps a short weak round on the weak cards and fills with unseen ones", () => {
    expect(selectCards(pool, stats, "weak", 1, () => 0).map((card) => card.id)).toEqual(["a"]);
    const three = selectCards(pool, stats, "weak", 3, () => 0);
    expect(three[0]?.id).toBe("a");
    expect(three.slice(1).map((card) => card.id).sort()).toEqual(["c", "d"]);
  });

  it("uses only weak cards when the round size is All", () => {
    expect(selectCards(pool, stats, "weak", "all", () => 0).map((card) => card.id)).toEqual(["a"]);
  });

  it("falls back to the whole band when nothing is weak yet", () => {
    const picked = selectCards(pool, new Map(), "weak", 2, () => 0);
    expect(picked).toHaveLength(2);
    expect(picked.every((card) => pool.some((item) => item.id === card.id))).toBe(true);
    expect(selectCards(pool, new Map(), "weak", "all", () => 0)).toHaveLength(4);
  });

  it("All focus can include a card the user already knows", () => {
    const picked = selectCards(pool, stats, "all", "all", () => 0);
    expect(picked.map((card) => card.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("mergeStat", () => {
  it("keeps the higher counts and the newer window", () => {
    const older = recordAttempt(withManual(undefined, true, 1)!, true, 5);
    const newer = recordAttempt(recordAttempt(undefined, false, 8), false, 9);
    const merged = mergeStat(older, newer);
    expect(merged.correct).toBe(Math.max(older.correct, newer.correct));
    expect(merged.attempts).toBeGreaterThanOrEqual(merged.correct);
    expect(merged.lastSeen).toBe(newer.lastSeen);
    expect(merged.windowBits).toBe(newer.windowBits);
    expect(merged.manual).toBe(false);
  });
});

describe("cap", () => {
  it("drops the oldest unmarked word when a direction is full", () => {
    let stats = new Map<string, WordStat>();
    for (let i = 0; i < STAT_CAP - 1; i += 1) {
      stats = putStat(stats, `m-${i}`, withManual(undefined, true, 100 + i)!);
    }
    stats = putStat(stats, "old", missed(1));
    expect(stats.size).toBe(STAT_CAP);
    stats = putStat(stats, "new", missed(9_999));
    expect(stats.size).toBe(STAT_CAP);
    expect(stats.has("new")).toBe(true);
    expect(stats.has("old")).toBe(false);
    expect(stats.has("m-0")).toBe(true);
  });
});

describe("tuple storage", () => {
  it("round-trips a stat and rejects a bad direction", () => {
    const stat = recordAttempt(recordAttempt(undefined, true, 4), false, 8);
    expect(fromTuple(toTuple(stat))).toEqual(stat);
    const doc = statsToDoc(new Map([["pl-103", stat]]), "2026-01-01T00:00:00.000Z");
    expect(docToStats(doc).get("pl-103")).toEqual(stat);
    const raw = JSON.stringify({ en_pl: doc, en_en: doc, nope: { words: {} } });
    const store = parseAccuracyStore(raw);
    expect(Object.keys(store)).toEqual(["en_pl"]);
    expect(parseAccuracyDoc("en_pl", doc)?.words["pl-103"]).toEqual(toTuple(stat));
    expect(parseAccuracyDoc("english_polish", doc)).toBeNull();
  });

  it("raises attempts to at least the correct count", () => {
    expect(fromTuple([4, 1, 0, 0, 0, 0])?.attempts).toBe(4);
  });
});

describe("focusHint", () => {
  it("describes the fallback and the weak count for the selected pair", () => {
    expect(focusHint("weak", 0)).toContain("whole band");
    expect(focusHint("weak", 0)).toContain("this pair");
    expect(focusHint("weak", 1)).toContain("1 weak word");
    expect(focusHint("weak", 1)).toContain("this pair");
    expect(focusHint("weak", 3)).toContain("3 weak words");
    expect(focusHint("all", 3)).toContain("Every card");
  });
});
