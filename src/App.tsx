import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { acceptedFor, buildSession, expectedFor, promptFor, RANGES, wordsForRange } from "./lib/deck";
import { isCorrectAnswer } from "./lib/match";
import type { CardResult, Dataset, Direction, Mode, Settings, Word } from "./types";

const POLISH_LETTERS = ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"] as const;
const STORAGE_KEY = "slowka-settings-v1";

const defaultSettings: Settings = {
  mode: "quiz",
  direction: "en-pl",
  range: "top100",
  size: 10,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function SpecialKeys({
  visible,
  onInsert,
}: {
  visible: boolean;
  onInsert: (letter: string) => void;
}) {
  if (!visible) return null;
  return (
    <div className="keys" aria-label="Polish letters">
      {POLISH_LETTERS.map((letter) => (
        <button key={letter} type="button" className="key" onClick={() => onInsert(letter)}>
          {letter}
        </button>
      ))}
    </div>
  );
}

function Home({
  settings,
  setSettings,
  wordCount,
  onStart,
}: {
  settings: Settings;
  setSettings: (next: Settings) => void;
  wordCount: number;
  onStart: () => void;
}) {
  const pool = useMemo(() => {
    const spec = RANGES.find((item) => item.id === settings.range);
    if (!spec) return 0;
    return Math.max(0, Math.min(wordCount, spec.end) - spec.start);
  }, [settings.range, wordCount]);

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">Polish · 1000 lemmas</p>
        <h1>Słówka</h1>
        <p className="lede">
          Practice the most common Polish words in their dictionary form. Type the translation,
          check it, and see the expected lemma.
        </p>
      </header>

      <section className="panel">
        <div className="field">
          <span className="label">Mode</span>
          <div className="segment">
            {(
              [
                ["study", "Study"],
                ["quiz", "Quiz"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.mode === value ? "on" : ""}
                onClick={() => setSettings({ ...settings, mode: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">
            {settings.mode === "study"
              ? "Flip or type to check. No score — just practice."
              : "Type every answer. Your score is counted at the end."}
          </p>
        </div>

        <div className="field">
          <span className="label">Direction</span>
          <div className="segment">
            <button
              type="button"
              className={settings.direction === "en-pl" ? "on" : ""}
              onClick={() => setSettings({ ...settings, direction: "en-pl" })}
            >
              English → Polish
            </button>
            <button
              type="button"
              className={settings.direction === "pl-en" ? "on" : ""}
              onClick={() => setSettings({ ...settings, direction: "pl-en" })}
            >
              Polish → English
            </button>
          </div>
          <p className="hint">
            {settings.direction === "en-pl"
              ? "Default: see the English gloss and type the Polish lemma."
              : "See the Polish word and type an English meaning."}
          </p>
        </div>

        <div className="field">
          <span className="label">Which words</span>
          <div className="chips">
            {RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                className={settings.range === range.id ? "chip on" : "chip"}
                onClick={() => setSettings({ ...settings, range: range.id })}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Cards this round</span>
          <div className="segment">
            {([10, 20, 50, "all"] as const).map((size) => (
              <button
                key={String(size)}
                type="button"
                className={settings.size === size ? "on" : ""}
                onClick={() => setSettings({ ...settings, size })}
              >
                {size === "all" ? "All" : size}
              </button>
            ))}
          </div>
          <p className="hint">{pool} lemmas in this band, shuffled each round.</p>
        </div>

        <button type="button" className="primary" onClick={onStart} disabled={pool === 0}>
          Start {settings.mode === "quiz" ? "quiz" : "study"}
        </button>
      </section>
    </div>
  );
}

function Session({
  words,
  mode,
  direction,
  onExit,
}: {
  words: Word[];
  mode: Mode;
  direction: Direction;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<CardResult[]>([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const word = words[index];
  const total = words.length;
  const prompt = word ? promptFor(word, direction) : "";
  const expected = word ? expectedFor(word, direction) : "";
  const typingPolish = direction === "en-pl";

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, done]);

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
    if (!word || revealed) return;
    const ok = isCorrectAnswer(given, expected, acceptedFor(word, direction));
    setCorrect(ok);
    setRevealed(true);
    setResults((prev) => [...prev, { word, correct: ok, given: given.trim() }]);
  }

  function reveal() {
    if (!word || revealed) return;
    setCorrect(null);
    setRevealed(true);
    if (mode === "quiz") {
      setResults((prev) => [...prev, { word, correct: false, given: input.trim() }]);
    }
  }

  function next() {
    if (index + 1 >= total) {
      setDone(true);
      return;
    }
    setIndex((value) => value + 1);
    setInput("");
    setRevealed(false);
    setCorrect(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!revealed) {
      if (!input.trim()) return;
      check();
      return;
    }
    next();
  }

  if (done) {
    const scored = results;
    const right = scored.filter((item) => item.correct).length;
    const missed = scored.filter((item) => !item.correct);
    return (
      <div className="stack">
        <header className="hero compact">
          <p className="eyebrow">{mode === "quiz" ? "Quiz complete" : "Study complete"}</p>
          <h1>{mode === "quiz" ? `${right} / ${scored.length}` : "Round finished"}</h1>
          <p className="lede">
            {mode === "quiz"
              ? right === scored.length
                ? "Every lemma matched. Nice work."
                : "Review the misses, then run another round."
              : "You walked through the cards. Start another set whenever you like."}
          </p>
        </header>
        {missed.length > 0 && (
          <section className="panel">
            <h2>Missed</h2>
            <ul className="misses">
              {missed.map((item) => (
                <li key={item.word.id}>
                  <strong>{item.word.pl}</strong>
                  <span>{item.word.en}</span>
                  {item.given ? <em>you: {item.given}</em> : <em>skipped</em>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" className="primary" onClick={onExit}>
          Back to setup
        </button>
      </div>
    );
  }

  if (!word) return null;

  return (
    <div className="stack session">
      <div className="topbar">
        <button type="button" className="ghost" onClick={onExit}>
          Exit
        </button>
        <p className="progress-label">
          {index + 1} / {total}
          {mode === "quiz" && (
            <span>
              {" "}
              · {results.filter((item) => item.correct).length} correct
            </span>
          )}
        </p>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${((index + (revealed ? 1 : 0)) / total) * 100}%` }} />
      </div>

      <article className={`card ${revealed ? (correct === true ? "ok" : correct === false ? "bad" : "open") : ""}`}>
        <p className="card-kicker">
          {direction === "en-pl" ? "English → type Polish" : "Polish → type English"}
          <span className="pos">{word.pos}</span>
        </p>
        <p className="prompt">{prompt}</p>
        {revealed && (
          <div className="feedback" role="status">
            {correct === true && <p className="ok-text">Correct</p>}
            {correct === false && <p className="bad-text">Incorrect</p>}
            {correct === null && <p className="open-text">Answer</p>}
            <p className="expected">
              <span>Expected</span> {expected}
            </p>
            {direction === "en-pl" && <p className="also">{word.en}</p>}
            {direction === "pl-en" && <p className="also">{word.pl}</p>}
          </div>
        )}
      </article>

      <form className="answer" onSubmit={onSubmit}>
        <label className="sr" htmlFor="answer">
          Your translation
        </label>
        <input
          id="answer"
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint={revealed ? "go" : "done"}
          placeholder={typingPolish ? "Type the Polish word" : "Type an English meaning"}
          disabled={revealed}
        />
        <SpecialKeys visible={typingPolish && !revealed} onInsert={insertLetter} />
        <div className="actions">
          {!revealed ? (
            <>
              <button type="submit" className="primary" disabled={!input.trim()}>
                Check
              </button>
              <button type="button" className="secondary" onClick={reveal}>
                {mode === "quiz" ? "Skip" : "Reveal"}
              </button>
            </>
          ) : (
            <button type="submit" className="primary">
              {index + 1 >= total ? "Finish" : "Next"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Word[] | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/words.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the word list.");
        return response.json() as Promise<Dataset>;
      })
      .then(setDataset)
      .catch((err: Error) => setError(err.message));
  }, []);

  function setSettings(next: Settings) {
    setSettingsState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function start() {
    if (!dataset) return;
    const pool = wordsForRange(dataset.words, settings.range);
    setSession(buildSession(pool, settings.size));
  }

  return (
    <div className="page">
      <div className="shell">
        {error && <p className="banner">{error}</p>}
        {!dataset && !error && <p className="lede">Loading the 1000-word deck…</p>}
        {dataset && !session && (
          <Home
            settings={settings}
            setSettings={setSettings}
            wordCount={dataset.words.length}
            onStart={start}
          />
        )}
        {dataset && session && (
          <Session
            words={session}
            mode={settings.mode}
            direction={settings.direction}
            onExit={() => setSession(null)}
          />
        )}
        <footer className="foot">
          <p>
            Frequency:{" "}
            <a href="https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP">
              KWJP via Wiktionary
            </a>
            . Glosses: English Wiktionary (CC BY-SA).
          </p>
        </footer>
      </div>
    </div>
  );
}
