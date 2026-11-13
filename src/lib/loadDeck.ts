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
  const existing = packRequests.get(code);
  if (existing) return existing;
  const pending = fetchJson<LangPack>(`data/langs/${code}.json`).catch((error) => {
    packRequests.delete(code);
    throw error;
  });
  packRequests.set(code, pending);
  return pending;
}

export function assembleEntries(catalog: Catalog, packs: Partial<Record<LangCode, LangPack>>): Entry[] {
  return catalog.entries.map((entry) => {
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
}
