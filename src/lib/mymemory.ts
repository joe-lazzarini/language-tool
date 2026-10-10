import { normalizeAnswer } from "./match";
import type { AcceptedAnswer } from "../types";

export type MemoryMatch = {
  translation?: string;
  match?: number | string;
};

export type MemoryPayload = {
  responseData?: { translatedText?: string };
  matches?: MemoryMatch[];
};

/** Keep short citation-like hits and drop quota warnings and full sentences. */
export function pickMemoryTranslations(payload: MemoryPayload, sourceWord: string): AcceptedAnswer[] {
  const rows: { text: string; score: number }[] = [];
  const top = payload.responseData?.translatedText?.trim();
  if (top) rows.push({ text: top, score: 1 });
  for (const match of payload.matches ?? []) {
    const text = match.translation?.trim();
    if (!text) continue;
    const score = typeof match.match === "number" ? match.match : Number(match.match) || 0;
    rows.push({ text, score });
  }
  rows.sort((a, b) => b.score - a.score);

  const source = normalizeAnswer(sourceWord);
  const seen = new Set<string>();
  const accepted: AcceptedAnswer[] = [];
  for (const row of rows) {
    const key = normalizeAnswer(row.text);
    if (!key || seen.has(key) || key === source) continue;
    if (/mymemory|query length|invalid api|example\.com/i.test(row.text)) continue;
    if (row.text.length > 48 || row.text.split(/\s+/).length > 5) continue;
    if (/[.!?]/.test(row.text)) continue;
    if (row.text.length > 1 && row.text === row.text.toUpperCase() && /[A-Z]/.test(row.text)) continue;
    if (row.score < 0.7 && accepted.length > 0) continue;
    seen.add(key);
    accepted.push({ text: row.text.replace(/\s+/g, " ") });
    if (accepted.length >= 4) break;
  }
  return accepted;
}
