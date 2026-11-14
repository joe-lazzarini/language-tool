import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlushQueue } from "./schedule";

afterEach(() => {
  vi.useRealTimers();
});

describe("createFlushQueue", () => {
  it("writes each dirty direction once with the latest value", async () => {
    vi.useFakeTimers();
    const writes: { key: string; value: number }[] = [];
    const queue = createFlushQueue(async (key: string, value: number) => {
      writes.push({ key, value });
    }, 1000);
    queue.schedule("en_pl", 1);
    queue.schedule("en_pl", 2);
    queue.schedule("pl_en", 4);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual([
      { key: "en_pl", value: 2 },
      { key: "pl_en", value: 4 },
    ]);
    expect(queue.pendingCount()).toBe(0);
  });

  it("flushes immediately and keeps a failed direction pending", async () => {
    const writes: string[] = [];
    const queue = createFlushQueue(async (key: string) => {
      writes.push(key);
      if (key === "pl_en") throw new Error("offline");
    }, 1000);
    queue.schedule("en_pl", 1);
    queue.schedule("pl_en", 1);
    await expect(queue.flush()).rejects.toThrow(/could not be saved/);
    expect(writes).toEqual(["en_pl", "pl_en"]);
    expect(queue.pendingCount()).toBe(1);
  });
});
