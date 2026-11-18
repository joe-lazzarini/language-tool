import { languageName, pairNames, type LangCode } from "../lib/languages";
import { MIN_READY_SENTENCES } from "./generate";

function pairKnownHint(
  from: LangCode,
  to: LangCode,
  knownBoth: number,
  knownOneWay: number,
  knownForwardOnly: number,
  knownReverseOnly: number,
): string {
  const knownNoun = knownBoth === 1 ? "word" : "words";
  let hint = `${knownBoth} known ${knownNoun} for this pair`;
  if (knownOneWay > 0) {
    const oneWayNoun = knownOneWay === 1 ? "word is" : "words are";
    const parts: string[] = [];
    if (knownForwardOnly > 0) {
      parts.push(`${knownForwardOnly} ${languageName(from)}→${languageName(to)} only`);
    }
    if (knownReverseOnly > 0) {
      parts.push(`${knownReverseOnly} ${languageName(to)}→${languageName(from)} only`);
    }
    hint += `; ${knownOneWay} ${oneWayNoun} known one way (${parts.join(", ")}) — practice the other direction`;
  }
  return `${hint}. ${MIN_READY_SENTENCES} sentences unlock the quiz.`;
}

export function SentenceCard({
  from,
  to,
  loading,
  error,
  knownBoth,
  knownOneWay,
  knownForwardOnly,
  knownReverseOnly,
  ready,
  unlockHint = "",
  onOpen,
}: {
  from: LangCode;
  to: LangCode;
  loading: boolean;
  error: string | null;
  knownBoth: number;
  knownOneWay: number;
  knownForwardOnly: number;
  knownReverseOnly: number;
  ready: number;
  unlockHint?: string;
  onOpen: () => void;
}) {
  const unlocked = ready >= MIN_READY_SENTENCES;
  const counts = pairKnownHint(from, to, knownBoth, knownOneWay, knownForwardOnly, knownReverseOnly);
  let hint = counts;
  if (error) hint = error;
  else if (loading) hint = "Loading sentence patterns…";
  else if (unlocked) hint = `${ready} sentences ready from study words you know both ways for this pair.`;
  else if (unlockHint) hint = `${counts} ${unlockHint}`;

  return (
    <section className="sentence-card" aria-label="Sentence quiz">
      <div className="sentence-card-copy">
        <h2 className="sentence-card-title">Sentence quiz</h2>
        <p className="sentence-card-pair">{pairNames(from, to)}</p>
        <p className="sentence-card-hint">{hint}</p>
      </div>
      <button type="button" className="sentence-open" onClick={onOpen}>
        Open
      </button>
    </section>
  );
}
