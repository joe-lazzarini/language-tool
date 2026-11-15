import { languageName, pairNames, type LangCode } from "../lib/languages";
import { MIN_READY_SENTENCES } from "./generate";

export function SentenceCard({
  from,
  to,
  loading,
  error,
  knownPrompt,
  knownAnswer,
  ready,
  unlockHint = "",
  onOpen,
}: {
  from: LangCode;
  to: LangCode;
  loading: boolean;
  error: string | null;
  knownPrompt: number;
  knownAnswer: number;
  ready: number;
  unlockHint?: string;
  onOpen: () => void;
}) {
  const unlocked = ready >= MIN_READY_SENTENCES;
  let hint = `${knownAnswer} ready in ${languageName(to)}, ${knownPrompt} ready in ${languageName(from)}. ${MIN_READY_SENTENCES} sentences unlock the quiz.`;
  if (error) hint = error;
  else if (loading) hint = "Loading sentence patterns…";
  else if (unlocked) hint = `${ready} sentences ready from study words you know in both languages.`;
  else if (unlockHint) hint = unlockHint;

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
