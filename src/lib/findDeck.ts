import { normalizeAnswer } from "./match";
import type { Entry, Form, LangCode } from "../types";

function scoreForm(form: Form, needle: string, lang: LangCode): number | null {
  if (normalizeAnswer(form.text, lang) === needle) return 0;
  const parts = form.text
    .split(/[/|,]/)
    .map((part) => normalizeAnswer(part, lang))
    .filter(Boolean);
  if (parts.includes(needle)) return 1;
  const accepted = form.accepted.map((item) => normalizeAnswer(item.text, lang));
  if (accepted[0] === needle) return 2;
  if (accepted.includes(needle)) return 3;
  return null;
}

function rankOf(entry: Entry, lang: LangCode): number {
  const direct = entry.ranks[lang];
  if (direct != null) return direct;
  let best = Number.MAX_SAFE_INTEGER;
  for (const value of Object.values(entry.ranks)) {
    if (typeof value === "number" && value < best) best = value;
  }
  return best;
}

/** Best bundled card for a word typed in one language. Headwords beat gloss-only hits. */
export function findDeckEntry(entries: Entry[], lang: LangCode, query: string): Entry | null {
  const needle = normalizeAnswer(query, lang);
  if (!needle) return null;
  let best: { entry: Entry; score: number; rank: number } | null = null;
  for (const entry of entries) {
    if (entry.custom) continue;
    const form = entry.forms[lang];
    if (!form) continue;
    const score = scoreForm(form, needle, lang);
    if (score == null) continue;
    const rank = rankOf(entry, lang);
    if (!best || score < best.score || (score === best.score && rank < best.rank)) {
      best = { entry, score, rank };
    }
  }
  return best?.entry ?? null;
}
