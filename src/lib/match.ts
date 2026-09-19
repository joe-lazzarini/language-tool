/** Case-insensitive, Unicode-normalized comparison with trimmed whitespace. */
export function normalizeAnswer(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pl-PL");
}

export function isCorrectAnswer(given: string, expected: string, accepted: string[] = []): boolean {
  const user = normalizeAnswer(given);
  if (!user) return false;

  const targets = new Set<string>();
  for (const raw of [expected, ...accepted]) {
    const n = normalizeAnswer(raw);
    if (!n) continue;
    targets.add(n);
    if (n.startsWith("to ") && n.length > 3) targets.add(n.slice(3));
  }

  return targets.has(user);
}
