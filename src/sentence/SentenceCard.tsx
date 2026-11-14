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
  onOpen,
}: {
  from: LangCode;
  to: LangCode;
  loading: boolean;
  error: string | null;
  knownPrompt: number;
  knownAnswer: number;
  ready: number;
  onOpen: () => void;
}) {
  const unlocked = ready >= MIN_READY_SENTENCES;
  let hint = `${knownAnswer} known in ${languageName(to)}, ${knownPrompt} known in ${languageName(from)}. ${MIN_READY_SENTENCES} sentences unlock the quiz.`;
  if (error) hint = error;
  else if (loading) hint = "Loading sentence patterns…";
  else if (unlocked) hint = `${ready} sentences ready from words you know in both languages.`;

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
