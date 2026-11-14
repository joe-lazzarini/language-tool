import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnswerReveal } from "../components/AnswerReveal";
import { SpecialKeys } from "../components/SpecialKeys";
import type { WordStat } from "../accuracy/stats";
import { knownIdSet } from "../accuracy/stats";
import { applyAdvanceKey, keyTargetKind, releaseAdvanceKey, type AdvanceKeyHold } from "../lib/advanceKey";
import {
  answerPlaceholder,
  languageByCode,
  languageName,
  pairLabel,
  SPECIAL_LETTERS,
  type LangCode,
} from "../lib/languages";
import { isCorrectSentence } from "./check";
import { generateSentences, MIN_READY_SENTENCES, sampleSentences, SENTENCE_ROUND } from "./generate";
import { loadLexicon, loadSentencePack } from "./load";
import { sentenceRows, type SentenceWordRow } from "./rows";
import type { Lexicon, PracticeSentence, SentencePack } from "./types";

type Phase = "lobby" | "round";

function knownLabel(language: string, known: boolean, manual: boolean): string {
  if (known && manual) return `${language}: marked known`;
  if (known) return `${language}: known from quiz`;
  return `Mark known in ${language}`;
}

function WordGroups({
  from,
  to,
  rows,
  onToggle,
}: {
  from: LangCode;
  to: LangCode;
  rows: SentenceWordRow[];
  onToggle: (side: "prompt" | "answer", id: string, manual: boolean) => void;
}) {
  const groups = [
    ["noun", "Nouns"],
    ["verb", "Verbs"],
    ["adjective", "Adjectives"],
  ] as const;
  return (
    <div className="sentence-groups">
      {groups.map(([pos, label]) => (
        <section key={pos} className="sentence-group">
          <h3>{label}</h3>
          <ul className="sentence-words">
            {rows.filter((row) => row.pos === pos).map((row) => (
              <li key={row.id}>
                <p className="sentence-forms">
                  <span lang={languageByCode(from).locale}>{row.prompt}</span>
                  <span aria-hidden="true">→</span>
                  <span lang={languageByCode(to).locale}>{row.answer}</span>
                </p>
                <div className="tool-row">
                  <KnownButton
                    language={languageName(from)}
                    known={row.promptKnown}
                    manual={row.promptManual}
                    onToggle={(manual) => onToggle("prompt", row.id, manual)}
                  />
                  <KnownButton
                    language={languageName(to)}
                    known={row.answerKnown}
                    manual={row.answerManual}
                    onToggle={(manual) => onToggle("answer", row.id, manual)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function KnownButton({
  language,
  known,
  manual,
  onToggle,
}: {
  language: string;
  known: boolean;
  manual: boolean;
  onToggle: (manual: boolean) => void;
}) {
  const lockedIn = known && !manual;
  return (
    <button
      type="button"
      className={known ? "sentence-known on" : "sentence-known"}
      aria-pressed={known}
      disabled={lockedIn}
      onClick={() => onToggle(!manual)}
    >
      {knownLabel(language, known, manual)}
    </button>
  );
}

export function SentenceQuiz({
  from,
  to,
  revision,
  read,
  onToggleManual,
  onExit,
}: {
  from: LangCode;
  to: LangCode;
  revision: number;
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>;
  onToggleManual: (from: LangCode, to: LangCode, wordId: string, manual: boolean) => void;
  onExit: () => void;
}) {
  const [lexicon, setLexicon] = useState<Lexicon | null>(null);
  const [promptPack, setPromptPack] = useState<SentencePack | null>(null);
  const [answerPack, setAnswerPack] = useState<SentencePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [round, setRound] = useState<PracticeSentence[]>([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<{ sentence: PracticeSentence; correct: boolean; given: string }[]>([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const heldKeys = useRef(new Map<string, AdvanceKeyHold>());
  const nextRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([loadLexicon(), loadSentencePack(from), loadSentencePack(to)])
      .then(([nextLexicon, nextPrompt, nextAnswer]) => {
        if (cancelled) return;
        setLexicon(nextLexicon);
        setPromptPack(nextPrompt);
        setAnswerPack(nextAnswer);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load sentence patterns.");
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const promptStats = useMemo(() => read(to, from), [read, to, from, revision]);
  const answerStats = useMemo(() => read(from, to), [read, from, to, revision]);
  const promptKnown = useMemo(() => knownIdSet(promptStats), [promptStats]);
  const answerKnown = useMemo(() => knownIdSet(answerStats), [answerStats]);

  const sentences = useMemo(() => {
    if (!lexicon || !promptPack || !answerPack) return [];
    return generateSentences(lexicon, from, promptPack, to, answerPack, promptKnown, answerKnown);
  }, [lexicon, promptPack, answerPack, from, to, promptKnown, answerKnown]);

  const rows = useMemo(() => {
    if (!lexicon || !promptPack || !answerPack) return [];
    return sentenceRows(lexicon, promptPack, answerPack, promptStats, answerStats);
  }, [lexicon, promptPack, answerPack, promptStats, answerStats]);

  useEffect(() => {
    if (phase === "round") inputRef.current?.focus();
  }, [phase, index, done]);

  useEffect(() => {
    if (revealed) inputRef.current?.blur();
  }, [revealed]);

  function toggle(side: "prompt" | "answer", id: string, manual: boolean) {
    if (side === "answer") onToggleManual(from, to, id, manual);
    else onToggleManual(to, from, id, manual);
  }

  function start() {
    if (sentences.length < MIN_READY_SENTENCES) return;
    setRound(sampleSentences(sentences, SENTENCE_ROUND));
    setIndex(0);
    setInput("");
    setRevealed(false);
    setCorrect(null);
    setResults([]);
    setDone(false);
    setPhase("round");
  }

  const sentence = round[index];
  const specials = SPECIAL_LETTERS[to] ?? [];

  function insertLetter(letter: string) {
    const field = inputRef.current;
    if (!field) {
      setInput((value) => value + letter);
      return;
    }
    const start = field.selectionStart ?? input.length;
    const end = field.selectionEnd ?? input.length;
    const next = input.slice(0, start) + letter + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      field.focus();
      const pos = start + letter.length;
      field.setSelectionRange(pos, pos);
    });
  }

  function check(given = input) {
    if (!sentence || revealed) return;
    const ok = isCorrectSentence(given, sentence.accepted, to);
    setCorrect(ok);
    setRevealed(true);
    setResults((prev) => [...prev, { sentence, correct: ok, given: given.trim() }]);
  }

  function skip() {
    if (!sentence || revealed) return;
    setCorrect(false);
    setRevealed(true);
    setResults((prev) => [...prev, { sentence, correct: false, given: input.trim() }]);
  }

  function next() {
    if (index + 1 >= round.length) {
      setDone(true);
      return;
    }
    setIndex((value) => value + 1);
    setInput("");
    setRevealed(false);
    setCorrect(null);
  }

  nextRef.current = next;

  useEffect(() => {
    if (phase !== "round" || done) return;

    function onKeyDown(event: KeyboardEvent) {
      const kind = keyTargetKind(event.target);
      const result = applyAdvanceKey(heldKeys.current, {
        key: event.key,
        repeat: event.repeat,
        revealed,
        composing: event.isComposing || event.keyCode === 229,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        typingTarget: kind === "typing",
        activationTarget: kind === "activation",
      });
      if (result.preventDefault) event.preventDefault();
      if (result.advance) nextRef.current();
    }

    function onKeyUp(event: KeyboardEvent) {
      releaseAdvanceKey(heldKeys.current, event.key);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, revealed, done]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!revealed) {
      if (!input.trim()) return;
      check();
      return;
    }
    next();
  }

  if (error) {
    return (
      <div className="stack">
        <p className="banner">{error}</p>
        <button type="button" className="secondary" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  if (!lexicon || !promptPack || !answerPack) {
    return <p className="lede">Loading sentence patterns…</p>;
  }

  if (phase === "round" && done) {
    const right = results.filter((item) => item.correct).length;
    const missed = results.filter((item) => !item.correct);
    return (
      <div className="stack">
        <header className="hero compact">
          <p className="eyebrow">Sentence quiz</p>
          <h1>
            {right} / {results.length}
          </h1>
          <p className="lede">
            {right === results.length
              ? "Every sentence matched."
              : "Review the misses, then try another set."}
          </p>
        </header>
        {missed.length > 0 && (
          <section className="panel">
            <h2>Missed</h2>
            <ul className="misses">
              {missed.map((item) => (
                <li key={item.sentence.id}>
                  <strong>{item.sentence.accepted[0]}</strong>
                  <span>{item.sentence.prompt}</span>
                  {item.given ? <em>you: {item.given}</em> : <em>skipped</em>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" className="primary" onClick={start}>
          Another round
        </button>
        <button type="button" className="secondary" onClick={() => setPhase("lobby")}>
          Sentence words
        </button>
      </div>
    );
  }

  if (phase === "round" && sentence) {
    return (
      <div className="stack session">
        <div className="topbar">
          <button type="button" className="ghost" onClick={() => setPhase("lobby")}>
            Exit
          </button>
          <p className="progress-label">
            {index + 1} / {round.length}
            <span> · {results.filter((item) => item.correct).length} correct</span>
          </p>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${((index + (revealed ? 1 : 0)) / round.length) * 100}%` }} />
        </div>
        <article className={`card ${revealed ? (correct ? "ok" : "bad") : ""}`}>
          <p className="card-kicker">
            Translate into {languageName(to)}
            <span className="pos">sentence</span>
          </p>
          <p className="prompt" lang={languageByCode(from).locale}>
            {sentence.prompt}
          </p>
          {revealed && (
            <div className="feedback" role="status">
              {correct ? <p className="ok-text">Correct</p> : <p className="bad-text">Incorrect</p>}
              <AnswerReveal answers={sentence.accepted.map((text) => ({ text }))} />
            </div>
          )}
        </article>
        <form className="answer" onSubmit={onSubmit}>
          <label className="sr" htmlFor="sentence-answer">
            Your translation
          </label>
          <input
            id="sentence-answer"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint={revealed ? "go" : "done"}
            lang={languageByCode(to).locale}
            placeholder={answerPlaceholder(to).replace("word", "sentence")}
            disabled={revealed}
          />
          {languageByCode(to).answerHint ? <p className="hint">{languageByCode(to).answerHint}</p> : null}
          <SpecialKeys letters={!revealed ? specials : []} label={`${languageName(to)} letters`} onInsert={insertLetter} />
          <div className="actions">
            {!revealed ? (
              <>
                <button type="submit" className="primary" disabled={!input.trim()}>
                  Check
                </button>
                <button type="button" className="secondary" onClick={skip}>
                  Skip
                </button>
              </>
            ) : (
              <div className="next-row">
                <button type="submit" className="primary">
                  {index + 1 >= round.length ? "Finish" : "Next"}
                </button>
                <p className="hint advance-hint">Press Enter or Space</p>
              </div>
            )}
          </div>
        </form>
      </div>
    );
  }

  const unlocked = sentences.length >= MIN_READY_SENTENCES;
  return (
    <div className="stack">
      <header className="hero compact">
        <p className="eyebrow">Sentence quiz</p>
        <h1>{pairLabel(from, to)}</h1>
        <p className="lede">
          Sentences use words you know on both sides. Two correct answers in a row, or a mark here, counts
          as knowing the word. Grammar words such as articles stay in the template.
        </p>
      </header>
      <section className="panel">
        <p className="hint">
          {unlocked
            ? `${sentences.length} sentences ready. A round asks for ${Math.min(SENTENCE_ROUND, sentences.length)}.`
            : `${sentences.length} of ${MIN_READY_SENTENCES} sentences ready. Mark words you already know, or keep quizzing them.`}
        </p>
        <button type="button" className="primary" onClick={start} disabled={!unlocked}>
          Start sentence quiz
        </button>
        <WordGroups from={from} to={to} rows={rows} onToggle={toggle} />
        <button type="button" className="secondary" onClick={onExit}>
          Back to setup
        </button>
      </section>
    </div>
  );
}
