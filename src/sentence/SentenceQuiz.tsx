import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnswerReveal } from "../components/AnswerReveal";
import { SpecialKeys } from "../components/SpecialKeys";
import type { WordStat } from "../accuracy/stats";
import { applyAdvanceKey, keyTargetKind, releaseAdvanceKey, type AdvanceKeyHold } from "../lib/advanceKey";
import { isComposingKeyEvent, shouldBlockGradeOrAdvance } from "../lib/ime";
import {
  answerPlaceholder,
  languageByCode,
  languageName,
  pairLabel,
  SPECIAL_LETTERS,
  type LangCode,
} from "../lib/languages";
import {
  uniqueMissedSentences,
  uniqueMissedSentenceWords,
} from "../lib/sessionResults";
import type { Entry } from "../types";
import { gradeSentence, type GradePart } from "./check";
import {
  generateSentences,
  MIN_READY_SENTENCES,
  progressFromStats,
  sampleSentences,
  SENTENCE_ROUND,
  unlockHint,
} from "./generate";
import { loadGrammar, loadSentencePack } from "./load";
import { sentenceRows, type SentenceWordRow } from "./rows";
import type { GrammarFile, PracticeSentence, SentencePack } from "./types";
import { buildVocabIndex } from "./vocab";

type Phase = "lobby" | "round";

function WordGroups({
  from,
  to,
  rows,
  onToggle,
}: {
  from: LangCode;
  to: LangCode;
  rows: SentenceWordRow[];
  onToggle: (id: string, manual: boolean) => void;
}) {
  const groups = [
    ["noun", "Nouns"],
    ["verb", "Verbs"],
    ["adjective", "Adjectives"],
  ] as const;
  if (rows.length === 0) {
    return (
      <p className="hint">No study nouns, verbs, or adjectives have enough grammar metadata for sentences yet.</p>
    );
  }
  return (
    <div className="sentence-groups">
      {groups.map(([pos, label]) => {
        const group = rows.filter((row) => row.pos === pos);
        if (group.length === 0) return null;
        return (
          <section key={pos} className="sentence-group">
            <h3>{label}</h3>
            <ul className="sentence-words">
              {group.map((row) => (
                <li key={row.id}>
                  <p className="sentence-forms">
                    <span lang={languageByCode(from).locale}>{row.prompt}</span>
                    <span aria-hidden="true">→</span>
                    <span lang={languageByCode(to).locale}>{row.answer}</span>
                    <span className="pos">{row.pairKnown ? "Known" : "Learning"}</span>
                    {row.eligible ? <span className="pos"> in sentences</span> : null}
                  </p>
                  <div className="tool-row">
                    <KnownButton
                      known={row.pairKnown}
                      manual={row.pairManual}
                      onToggle={(manual) => onToggle(row.id, manual)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function KnownButton({
  known,
  manual,
  onToggle,
}: {
  known: boolean;
  manual: boolean;
  onToggle: (manual: boolean) => void;
}) {
  // Practice-earned known is shown only as the Known badge; only manual marks toggle.
  if (known && !manual) return null;
  return (
    <button
      type="button"
      className={manual ? "sentence-known on" : "sentence-known"}
      aria-pressed={manual}
      onClick={() => onToggle(!manual)}
    >
      {manual ? "Unmark" : "Mark known"}
    </button>
  );
}

export function SentenceQuiz({
  from,
  to,
  studyEntries,
  revision,
  read,
  onToggleManual,
  onExit,
}: {
  from: LangCode;
  to: LangCode;
  studyEntries: readonly Entry[];
  revision: number;
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>;
  onToggleManual: (from: LangCode, to: LangCode, wordId: string, manual: boolean) => void;
  onExit: () => void;
}) {
  const [grammar, setGrammar] = useState<GrammarFile | null>(null);
  const [promptPack, setPromptPack] = useState<SentencePack | null>(null);
  const [answerPack, setAnswerPack] = useState<SentencePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [round, setRound] = useState<PracticeSentence[]>([]);
  const [previousIds, setPreviousIds] = useState<Set<string>>(new Set());
  const [previousStructures, setPreviousStructures] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [gradeParts, setGradeParts] = useState<GradePart[] | null>(null);
  const [results, setResults] = useState<
    { sentence: PracticeSentence; correct: boolean; given: string; wrongTokens?: string[] }[]
  >([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const heldKeys = useRef(new Map<string, AdvanceKeyHold>());
  const nextRef = useRef<() => void>(() => {});
  const composingRef = useRef(false);
  const resultsRef = useRef<typeof results>([]);
  const indexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([loadGrammar(), loadSentencePack(from), loadSentencePack(to)])
      .then(([nextGrammar, nextPrompt, nextAnswer]) => {
        if (cancelled) return;
        setGrammar(nextGrammar);
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

  const vocab = useMemo(() => {
    if (!grammar) return null;
    return buildVocabIndex(studyEntries, grammar, from, to, promptStats, answerStats);
  }, [grammar, studyEntries, from, to, promptStats, answerStats]);

  const sentences = useMemo(() => {
    if (!vocab || !promptPack || !answerPack) return [];
    const progress = progressFromStats(vocab, promptStats, answerStats);
    return generateSentences(vocab, from, promptPack, to, answerPack, progress);
  }, [vocab, promptPack, answerPack, from, to, promptStats, answerStats]);

  const rows = useMemo(() => {
    if (!grammar) return [];
    return sentenceRows(studyEntries, grammar, from, to, promptStats, answerStats);
  }, [grammar, studyEntries, from, to, promptStats, answerStats]);

  const entriesById = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const entry of studyEntries) map.set(entry.id, entry);
    return map;
  }, [studyEntries]);

  useEffect(() => {
    if (phase === "round") inputRef.current?.focus();
  }, [phase, index, done]);

  useEffect(() => {
    if (revealed) inputRef.current?.blur();
  }, [revealed]);

  function toggle(id: string, manual: boolean) {
    // toggleManual writes the flag to both direction docs for the pair.
    onToggleManual(from, to, id, manual);
  }

  function start() {
    if (sentences.length < MIN_READY_SENTENCES) return;
    const next = sampleSentences(sentences, SENTENCE_ROUND, Math.random, previousIds, previousStructures);
    setPreviousIds(new Set(next.map((item) => item.id)));
    setPreviousStructures(new Set(next.map((item) => item.structure)));
    setRound(next);
    indexRef.current = 0;
    setIndex(0);
    setInput("");
    setRevealed(false);
    setCorrect(null);
    setGradeParts(null);
    resultsRef.current = [];
    setResults([]);
    setDone(false);
    setPhase("round");
  }

  const sentence = round[index];
  const specials = SPECIAL_LETTERS[to] ?? [];

  function commitSentenceResult(
    item: PracticeSentence,
    ok: boolean,
    given: string,
    wrongTokens?: string[],
  ) {
    const row = { sentence: item, correct: ok, given, wrongTokens };
    resultsRef.current = [...resultsRef.current, row];
    setResults(resultsRef.current);
  }

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
    if (!sentence || revealed || shouldBlockGradeOrAdvance(composingRef.current)) return;
    const grade = gradeSentence(given, sentence.accepted, to, from);
    setCorrect(grade.correct);
    setGradeParts(grade.correct ? null : grade.parts);
    setRevealed(true);
    const wrongTokens = grade.correct ? undefined : grade.parts.filter((part) => !part.ok).map((part) => part.text);
    commitSentenceResult(sentence, grade.correct, given.trim(), wrongTokens);
  }

  function skip() {
    if (!sentence || revealed) return;
    setCorrect(false);
    // Skip with no typed answer: show the reference without a full-token mismatch highlight.
    setGradeParts(null);
    setRevealed(true);
    commitSentenceResult(sentence, false, input.trim());
  }

  function finish() {
    setResults(resultsRef.current);
    setDone(true);
  }

  function next() {
    if (indexRef.current + 1 >= round.length) {
      finish();
      return;
    }
    indexRef.current += 1;
    setIndex(indexRef.current);
    setInput("");
    setRevealed(false);
    setCorrect(null);
    setGradeParts(null);
  }

  function requestExit() {
    if (resultsRef.current.length > 0) {
      finish();
      return;
    }
    setPhase("lobby");
  }

  nextRef.current = next;

  useEffect(() => {
    if (phase !== "round" || done) return;

    function onKeyDown(event: KeyboardEvent) {
      const composing = isComposingKeyEvent(event) || composingRef.current;
      const kind = keyTargetKind(event.target);
      const result = applyAdvanceKey(heldKeys.current, {
        key: event.key,
        repeat: event.repeat,
        revealed,
        composing,
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
    if (shouldBlockGradeOrAdvance(composingRef.current)) return;
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

  if (!grammar || !promptPack || !answerPack || !vocab) {
    return <p className="lede">Loading sentence patterns…</p>;
  }

  if (phase === "round" && done) {
    const scored = resultsRef.current.length > 0 ? resultsRef.current : results;
    const right = scored.filter((item) => item.correct).length;
    const missed = uniqueMissedSentences(scored);
    const missedWords = uniqueMissedSentenceWords(scored, entriesById, from, to);
    return (
      <div className="stack">
        <header className="hero compact">
          <p className="eyebrow">Sentence quiz</p>
          <h1>
            {right} / {scored.length}
          </h1>
          <p className="lede">
            {right === scored.length
              ? "Every sentence matched."
              : "Review the misses, then try another set."}
          </p>
        </header>
        {missed.length > 0 && (
          <section className="panel">
            <h2>Missed ({missed.length})</h2>
            <ul className="misses">
              {missed.map((item, missIndex) => (
                <li key={`${item.sentence.id}-${missIndex}`}>
                  <strong>{item.sentence.accepted[0]}</strong>
                  <span>{item.sentence.prompt}</span>
                  {item.given ? <em>you: {item.given}</em> : <em>skipped</em>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {missedWords.length > 0 && (
          <section className="panel">
            <h2>Words to review ({missedWords.length})</h2>
            <ul className="misses">
              {missedWords.map((item, missIndex) => (
                <li key={`${item.id}-${missIndex}`}>
                  <strong>{item.answer}</strong>
                  <span>{item.prompt}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" className="primary" onClick={start}>
          Another round
        </button>
        <button type="button" className="secondary" onClick={() => setPhase("lobby")}>
          Study words
        </button>
      </div>
    );
  }

  if (phase === "round" && sentence) {
    return (
      <div className="stack session">
        <div className="topbar">
          <button type="button" className="ghost" onClick={requestExit}>
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
              {gradeParts && !correct ? (
                <div className="expected">
                  <span>Expected</span>
                  <p className="sentence-diff" lang={languageByCode(to).locale}>
                    {gradeParts.map((part, i) => (
                      <span key={`${part.text}-${i}`} className={part.ok ? "diff-ok" : "diff-bad"}>
                        {part.text}
                        {i < gradeParts.length - 1 && to !== "zh" && to !== "ja" ? " " : ""}
                      </span>
                    ))}
                    {to === "zh" || to === "ja" ? "。" : "."}
                  </p>
                  {sentence.accepted.length > 1 ? (
                    <AnswerReveal answers={sentence.accepted.slice(1).map((text) => ({ text }))} />
                  ) : null}
                </div>
              ) : (
                <AnswerReveal answers={sentence.accepted.map((text) => ({ text }))} />
              )}
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
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              requestAnimationFrame(() => {
                composingRef.current = false;
              });
            }}
            onKeyDown={(event) => {
              if (isComposingKeyEvent(event)) composingRef.current = true;
            }}
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
  const hint = unlocked
    ? `${sentences.length} sentences ready. A round asks for ${Math.min(SENTENCE_ROUND, sentences.length)}.`
    : unlockHint(sentences.length, vocab) ||
      `${sentences.length} of ${MIN_READY_SENTENCES} sentences ready. Mark words you already know, or keep quizzing them.`;

  return (
    <div className="stack">
      <header className="hero compact">
        <p className="eyebrow">Sentence quiz</p>
        <h1>{pairLabel(from, to)}</h1>
        <p className="lede">
          Sentences use study words you know for this language pair and that are not weak — structure
          varies with your vocabulary size and accuracy. Practice in either direction counts toward
          one combined score for the pair (attempts and recent streak are merged at read time). Weak
          words stay out until they improve.
        </p>
      </header>
      <section className="panel">
        <p className="hint">{hint}</p>
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
