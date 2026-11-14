export type FlushQueue<T> = {
  schedule: (key: string, value: T) => void;
  flush: () => Promise<void>;
  pendingCount: () => number;
};

/** Coalesce writes by key. A later value for the same key replaces the earlier one. */
export function createFlushQueue<T>(
  write: (key: string, value: T) => Promise<void> | void,
  wait = 1000,
): FlushQueue<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  const pending = new Map<string, T>();

  function schedule(key: string, value: T) {
    pending.set(key, value);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, wait);
  }

  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const batch = [...pending.entries()];
    pending.clear();
    const run = chain.catch(() => undefined).then(async () => {
      const failed: [string, T][] = [];
      for (const [key, value] of batch) {
        try {
          await write(key, value);
        } catch {
          failed.push([key, value]);
        }
      }
      for (const [key, value] of failed) {
        if (!pending.has(key)) pending.set(key, value);
      }
      if (failed.length > 0) throw new Error("Some practice history could not be saved.");
    });
    chain = run;
    return run;
  }

  return { schedule, flush, pendingCount: () => pending.size };
}
