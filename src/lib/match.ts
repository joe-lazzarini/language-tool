import type { AcceptedAnswer } from "../types";

export type AnswerLike = string | AcceptedAnswer;

export function answerText(item: AnswerLike): string {
  return typeof item === "string" ? item : item.text;
}

/** Case-insensitive, Unicode-normalized comparison with trimmed whitespace.
 *  pl-PL lowercasing also folds German ä ö ü ß correctly.
 */
export function normalizeAnswer(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pl-PL");
}

function addTarget(targets: Set<string>, raw: string): void {
  const n = normalizeAnswer(raw);
  if (!n) return;
  targets.add(n);
  if (n.startsWith("to ") && n.length > 3) targets.add(n.slice(3));
  for (const prefix of ["a ", "an ", "the "] as const) {
    if (n.startsWith(prefix) && n.length > prefix.length) {
      targets.add(n.slice(prefix.length));
    }
  }
}

/** Every string that should count as a correct typed answer. */
export function matchingTargets(expected: string, accepted: AnswerLike[] = []): Set<string> {
  const targets = new Set<string>();
  addTarget(targets, expected);
  for (const item of accepted) addTarget(targets, answerText(item));
  return targets;
}

export function isCorrectAnswer(given: string, expected: string, accepted: AnswerLike[] = []): boolean {
  const user = normalizeAnswer(given);
  if (!user) return false;
  return matchingTargets(expected, accepted).has(user);
}
