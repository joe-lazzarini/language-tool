import { normalizeAnswer } from "./match";
import type { AcceptedAnswer, Form } from "../types";

const MAX_ANSWERS = 8;

export function buildForm(answers: AcceptedAnswer[], display?: string): Form | null {
  const accepted: AcceptedAnswer[] = [];
  const seen = new Set<string>();
  for (const item of answers) {
    const text = item.text.trim().replace(/\s+/g, " ");
    const key = normalizeAnswer(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const context = item.context?.trim();
    accepted.push(context ? { text, context } : { text });
    if (accepted.length >= MAX_ANSWERS) break;
  }
  if (accepted.length === 0) return null;
  const fallback = accepted.map((item) => item.text).join(" / ");
  const text = (display?.trim() || fallback).replace(/\s+/g, " ");
  return { text, accepted };
}

/** Prefer edited answer rows. If they are empty, split the card text on slashes. */
export function finalizeLanguage(display: string, rows: AcceptedAnswer[]): Form | null {
  const filled = rows
    .map((row) => ({
      text: row.text,
      context: row.context?.trim() || undefined,
    }))
    .filter((row) => row.text.trim());
  if (filled.length > 0) return buildForm(filled, display);
  return buildForm(
    display.split("/").map((text) => ({ text })),
    display,
  );
}

export function cloneForm(form: Form): Form {
  return {
    text: form.text,
    accepted: form.accepted.map((item) =>
      item.context ? { text: item.text, context: item.context } : { text: item.text },
    ),
  };
}
