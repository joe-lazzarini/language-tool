/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assembleEntries,
  hasLangPack,
  loadCatalog,
  loadLangPack,
  peekLangPack,
  resetLangPackCacheForTests,
} from "./loadDeck";
import type { Catalog, LangPack } from "../types";

afterEach(() => {
  resetLangPackCacheForTests();
  vi.unstubAllGlobals();
});

function stubFetch(handlers: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [path, body] of Object.entries(handlers)) {
        if (url.includes(path)) {
          return {
            ok: true,
            json: async () => body,
          };
        }
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
}

describe("loadLangPack cache", () => {
  it("fetches each language JSON once and reuses the parsed pack on swap", async () => {
    const en: LangPack = {
      "w1": { text: "cat", accepted: [{ text: "cat" }] },
    };
    const pl: LangPack = {
      "w1": { text: "kot", accepted: [{ text: "kot" }] },
    };
    stubFetch({
      "data/langs/en.json": en,
      "data/langs/pl.json": pl,
    });

    const firstEn = await loadLangPack("en");
    const firstPl = await loadLangPack("pl");
    expect(firstEn).toBe(en);
    expect(firstPl).toBe(pl);
    expect(hasLangPack("en")).toBe(true);
    expect(peekLangPack("pl")).toBe(pl);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Swap direction: both languages already loaded — no refetch / re-parse.
    const againEn = await loadLangPack("en");
    const againPl = await loadLangPack("pl");
    expect(againEn).toBe(firstEn);
    expect(againPl).toBe(firstPl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent loads for the same language into one fetch", async () => {
    let resolveJson: (value: LangPack) => void = () => undefined;
    const pending = new Promise<LangPack>((resolve) => {
      resolveJson = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: () => pending,
      })),
    );

    const a = loadLangPack("de");
    const b = loadLangPack("de");
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);

    const pack: LangPack = { w: { text: "Hund", accepted: [{ text: "Hund" }] } };
    resolveJson(pack);
    await expect(a).resolves.toBe(pack);
    await expect(b).resolves.toBe(pack);
    expect(peekLangPack("de")).toBe(pack);
  });
});

describe("assembleEntries reuse", () => {
  it("returns the same array when pack object identities are unchanged", async () => {
    const catalog: Catalog = {
      meta: {
        title: "test",
        languages: [],
        coverage: {},
        sources: {},
        gaps: "",
      },
      entries: [{ id: "w1", pos: "noun", ranks: { en: 1 }, concept: "cat" }],
    };
    stubFetch({ "data/catalog.json": catalog });
    await loadCatalog();

    const en: LangPack = { w1: { text: "cat", accepted: [{ text: "cat" }] } };
    const pl: LangPack = { w1: { text: "kot", accepted: [{ text: "kot" }] } };
    const packs = { en, pl };
    const first = assembleEntries(catalog, packs);
    const second = assembleEntries(catalog, packs);
    expect(second).toBe(first);
    expect(first[0]?.forms.en?.text).toBe("cat");
    expect(first[0]?.forms.pl?.text).toBe("kot");
  });
});
