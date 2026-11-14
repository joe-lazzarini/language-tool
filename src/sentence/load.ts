import type { LangCode } from "../lib/languages";
import type { Lexicon, SentencePack } from "./types";

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

function isLexicon(value: unknown): value is Lexicon {
  if (!value || typeof value !== "object") return false;
  const record = value as Lexicon;
  return Array.isArray(record.nouns) && Array.isArray(record.verbs) && Array.isArray(record.adjectives);
}

function isPack(value: unknown): value is SentencePack {
  if (!value || typeof value !== "object") return false;
  const frames = (value as SentencePack).frames;
  return Boolean(
    frames &&
      typeof frames.vi === "string" &&
      typeof frames.vt === "string" &&
      typeof frames.adj === "string" &&
      (value as SentencePack).nouns &&
      (value as SentencePack).verbs &&
      (value as SentencePack).adjectives,
  );
}

let lexiconRequest: Promise<Lexicon> | null = null;
const packRequests = new Map<LangCode, Promise<SentencePack>>();

export function loadLexicon(): Promise<Lexicon> {
  if (!lexiconRequest) {
    lexiconRequest = fetchJson("data/sentences/index.json")
      .then((value) => {
        if (!isLexicon(value)) throw new Error("Could not load sentence patterns.");
        return value;
      })
      .catch((error) => {
        lexiconRequest = null;
        throw error;
      });
  }
  return lexiconRequest;
}

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
