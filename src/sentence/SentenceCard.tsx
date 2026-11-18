import { pairNames, type LangCode } from "../lib/languages";
import { MIN_READY_SENTENCES } from "./generate";

function pairKnownHint(known: number): string {
  const knownNoun = known === 1 ? "word" : "words";
  return `${known} known ${knownNoun} for this pair. ${MIN_READY_SENTENCES} sentences unlock the quiz.`;
}

export function SentenceCard({
  from,
  to,
  loading,
  error,
  known,
  ready,
  unlockHint = "",
  onOpen,
}: {
  from: LangCode;
  to: LangCode;
  loading: boolean;
  error: string | null;
  known: number;
  ready: number;
  unlockHint?: string;
  onOpen: () => void;
}) {
  const unlocked = ready >= MIN_READY_SENTENCES;
  const counts = pairKnownHint(known);
  let hint = counts;
  if (error) hint = error;
  else if (loading) hint = "Loading sentence patterns…";
  else if (unlocked) hint = `${ready} sentences ready from study words you know for this pair.`;
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
