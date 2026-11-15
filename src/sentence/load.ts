import type { LangCode } from "../lib/languages";
import type { GrammarFile, SentencePack } from "./types";

function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path}`;
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error("Could not load sentence patterns.");
  return response.json() as Promise<unknown>;
}

function isGrammar(value: unknown): value is GrammarFile {
  if (!value || typeof value !== "object") return false;
  const record = value as GrammarFile;
  return typeof record.version === "number" && Boolean(record.words) && typeof record.words === "object";
}

function isPack(value: unknown): value is SentencePack {
  if (!value || typeof value !== "object") return false;
  const frames = (value as SentencePack).frames;
  return Boolean(frames && typeof frames.vi === "string" && typeof frames.vt === "string" && typeof frames.adj === "string");
}

let grammarRequest: Promise<GrammarFile> | null = null;
const packRequests = new Map<LangCode, Promise<SentencePack>>();

export function loadGrammar(): Promise<GrammarFile> {
  if (!grammarRequest) {
    grammarRequest = fetchJson("data/sentences/grammar.json")
      .then((value) => {
        if (!isGrammar(value)) throw new Error("Could not load sentence patterns.");
        return value;
      })
      .catch((error) => {
        grammarRequest = null;
        throw error;
      });
  }
  return grammarRequest;
}

/** @deprecated Use loadGrammar. Kept name alias for call-site clarity during migration. */
export const loadLexicon = loadGrammar;

export function loadSentencePack(code: LangCode): Promise<SentencePack> {
  const existing = packRequests.get(code);
  if (existing) return existing;
  const pending = fetchJson(`data/sentences/${code}.json`)
    .then((value) => {
      if (!isPack(value)) throw new Error("Could not load sentence patterns.");
      return value;
    })
    .catch((error) => {
      packRequests.delete(code);
      throw error;
    });
  packRequests.set(code, pending);
  return pending;
}
