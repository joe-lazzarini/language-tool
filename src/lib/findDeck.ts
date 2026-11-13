import { normalizeAnswer } from "./match";
import type { Entry, Form, LangCode } from "../types";

function scoreForm(form: Form, needle: string): number | null {
  if (normalizeAnswer(form.text) === needle) return 0;
  const parts = form.text
    .split(/[/|,]/)
    .map((part) => normalizeAnswer(part))
    .filter(Boolean);
  if (parts.includes(needle)) return 1;
  const accepted = form.accepted.map((item) => normalizeAnswer(item.text));
  if (accepted[0] === needle) return 2;
  if (accepted.includes(needle)) return 3;
  return null;
}

/** Best bundled card for a word typed in one language. Headwords beat gloss-only hits. */
export function findDeckEntry(entries: Entry[], lang: LangCode, query: string): Entry | null {
  const needle = normalizeAnswer(query);
  if (!needle) return null;
  let best: { entry: Entry; score: number; rank: number } | null = null;
  for (const entry of entries) {
    if (entry.custom) continue;
    const form = entry.forms[lang];
    if (!form) continue;
    const score = scoreForm(form, needle);
    if (score == null) continue;
    const rank = entry.ranks[lang] ?? entry.ranks.pl ?? entry.ranks.de ?? entry.ranks.en ?? Number.MAX_SAFE_INTEGER;
    if (!best || score < best.score || (score === best.score && rank < best.rank)) {
      best = { entry, score, rank };
    }
  }
  return best?.entry ?? null;
}
