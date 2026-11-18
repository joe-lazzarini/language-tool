import { LANG_CODES } from "./languages";
import type { Catalog, Entry, LangCode, LangPack } from "../types";

function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error("Could not load the word list.");
  return (await response.json()) as T;
}

let catalogRequest: Promise<Catalog> | null = null;
const packRequests = new Map<LangCode, Promise<LangPack>>();
/** Resolved packs kept for sync reuse (swap must not refetch or re-parse). */
const packCache = new Map<LangCode, LangPack>();

export function loadCatalog(): Promise<Catalog> {
  if (!catalogRequest) {
    catalogRequest = fetchJson<Catalog>("data/catalog.json").catch((error) => {
      catalogRequest = null;
      throw error;
    });
  }
  return catalogRequest;
}

export function loadLangPack(code: LangCode): Promise<LangPack> {
  const hit = packCache.get(code);
  if (hit) return Promise.resolve(hit);
  const existing = packRequests.get(code);
  if (existing) return existing;
  const pending = fetchJson<LangPack>(`data/langs/${code}.json`)
    .then((pack) => {
      packCache.set(code, pack);
      packRequests.delete(code);
      return pack;
    })
    .catch((error) => {
      packRequests.delete(code);
      throw error;
    });
  packRequests.set(code, pending);
  return pending;
}

/** True when this language JSON is already fetched and parsed. */
export function hasLangPack(code: LangCode): boolean {
  return packCache.has(code);
}

/** Sync read of a cached pack, or null when not loaded yet. */
export function peekLangPack(code: LangCode): LangPack | null {
  return packCache.get(code) ?? null;
}

/** Test helper: clear in-memory language/catalog caches. */
export function resetLangPackCacheForTests(): void {
  catalogRequest = null;
  packRequests.clear();
  packCache.clear();
  assembledCache = null;
}

type AssembledCache = {
  catalog: Catalog;
  packs: Partial<Record<LangCode, LangPack>>;
  packCodes: string;
  entries: Entry[];
};

let assembledCache: AssembledCache | null = null;

function packsKey(packs: Partial<Record<LangCode, LangPack>>): string {
  return LANG_CODES.filter((code) => packs[code]).join(",");
}

/**
 * Merge catalog rows with loaded language packs.
 * Reuses the previous Entry[] when the same pack object identities are present
 * so a language swap does not rebuild 2k cards.
 */
export function assembleEntries(catalog: Catalog, packs: Partial<Record<LangCode, LangPack>>): Entry[] {
  const key = packsKey(packs);
  if (
    assembledCache &&
    assembledCache.catalog === catalog &&
    assembledCache.packCodes === key &&
    LANG_CODES.every((code) => !packs[code] || assembledCache!.packs[code] === packs[code])
  ) {
    return assembledCache.entries;
  }

  const entries = catalog.entries.map((entry) => {
    const forms: Entry["forms"] = {};
    for (const code of LANG_CODES) {
      const form = packs[code]?.[entry.id];
      if (!form?.text?.trim() || !form.accepted?.some((item) => item.text.trim())) continue;
      forms[code] = form;
    }
    return {
      id: entry.id,
      pos: entry.pos,
      ranks: entry.ranks ?? {},
      concept: entry.concept,
      forms,
    };
  });

  assembledCache = { catalog, packs: { ...packs }, packCodes: key, entries };
  return entries;
}
