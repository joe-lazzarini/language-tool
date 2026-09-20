import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptedFor,
  buildSession,
  entriesForPair,
  expectedFor,
  formText,
  promptFor,
  RANGES,
  sessionKicker,
  wordsForRange,
} from "./lib/deck";
import {
  answerPlaceholder,
  isLangCode,
  LANG_CODES,
  languageName,
  LANGUAGES,
  pairHint,
  pairLabel,
  SPECIAL_LETTERS,
} from "./lib/languages";
import { isCorrectAnswer } from "./lib/match";
import type { CardResult, Dataset, Entry, LangCode, Mode, Settings } from "./types";

const STORAGE_KEY = "slowka-settings-v2";
const LEGACY_STORAGE_KEY = "slowka-settings-v1";

const defaultSettings: Settings = {
  mode: "quiz",
  from: "en",
  to: "pl",
  range: "top100",
  size: 10,
};

function migrateLegacy(raw: string): Partial<Settings> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Settings> & { direction?: string };
    if (parsed.from && parsed.to) return parsed;
    if (parsed.direction === "pl-en") return { ...parsed, from: "pl", to: "en" };
    if (parsed.direction === "en-pl") return { ...parsed, from: "en", to: "pl" };
    return parsed;
  } catch {
    return null;
  }
}

function loadSettings(): Settings {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = current ? migrateLegacy(current) : legacy ? migrateLegacy(legacy) : null;
    if (!parsed) return defaultSettings;
    const from = parsed.from && isLangCode(parsed.from) ? parsed.from : defaultSettings.from;
    const to = parsed.to && isLangCode(parsed.to) ? parsed.to : defaultSettings.to;
    return {
      ...defaultSettings,
      ...parsed,
      from,
      to: to === from ? (from === "pl" ? "en" : "pl") : to,
    };
  } catch {
    return defaultSettings;
  }
}

function SpecialKeys({
  letters,
  label,
  onInsert,
}: {
  letters: readonly string[];
  label: string;
  onInsert: (letter: string) => void;
}) {
  if (letters.length === 0) return null;
  return (
    <div className="keys" aria-label={label}>
      {letters.map((letter) => (
        <button key={letter} type="button" className="key" onClick={() => onInsert(letter)}>
          {letter}
        </button>
      ))}
    </div>
  );
}

function LanguagePicker({
  label,
  value,
  locked,
  onChange,
}: {
  label: string;
  value: LangCode;
  locked?: LangCode;
  onChange: (code: LangCode) => void;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="segment">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            className={value === lang.code ? "on" : ""}
            onClick={() => onChange(lang.code)}
          >
            {lang.name}
          </button>
        ))}
      </div>
      {locked && value === locked ? (
        <p className="hint">Pick a different language from the other side.</p>
      ) : null}
    </div>
  );
}

function Home({
  settings,
  setSettings,
  pairCount,
  onStart,
}: {
  settings: Settings;
  setSettings: (next: Settings) => void;
  pairCount: number;
  onStart: () => void;
}) {
  const pool = useMemo(() => {
    const spec = RANGES.find((item) => item.id === settings.range);
    if (!spec) return 0;
    return Math.max(0, Math.min(pairCount, spec.end) - spec.start);
  }, [settings.range, pairCount]);

  const sameLanguage = settings.from === settings.to;

  function setFrom(from: LangCode) {
    const to = from === settings.to ? (LANG_CODES.find((code) => code !== from) ?? "pl") : settings.to;
    setSettings({ ...settings, from, to });
  }

  function setTo(to: LangCode) {
    const from = to === settings.from ? (LANG_CODES.find((code) => code !== to) ?? "en") : settings.from;
    setSettings({ ...settings, from, to });
  }

  function swap() {
    setSettings({ ...settings, from: settings.to, to: settings.from });
  }

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">English · Polish · German</p>
        <h1>Słówka</h1>
        <p className="lede">
          Practice common lemmas in their dictionary form. Choose any prompt and answer language,
          type the translation, and see the expected word.
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

        <div className="pair-grid">
          <LanguagePicker label="Prompt" value={settings.from} onChange={setFrom} />
          <div className="pair-swap">
            <button type="button" className="swap" onClick={swap} aria-label="Swap languages">
              ⇄
            </button>
          </div>
          <LanguagePicker label="Answer" value={settings.to} onChange={setTo} />
        </div>
        <p className="hint pair-hint">
          Default is English → Polish. Now {pairLabel(settings.from, settings.to)} —{" "}
          {pairHint(settings.from, settings.to)}
        </p>

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
          <p className="hint">
            {pairCount} usable {pairLabel(settings.from, settings.to)} cards; {pool} in this band,
            shuffled each round.
          </p>
        </div>

        <button type="button" className="primary" onClick={onStart} disabled={pool === 0 || sameLanguage}>
          Start {settings.mode === "quiz" ? "quiz" : "study"}
        </button>
      </section>
    </div>
  );
}

function Session({
  words,
  mode,
  from,
  to,
  onExit,
}: {
  words: Entry[];
  mode: Mode;
  from: LangCode;
  to: LangCode;
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
  const prompt = word ? promptFor(word, from) : "";
  const expected = word ? expectedFor(word, to) : "";
  const specials = SPECIAL_LETTERS[to] ?? [];

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
    const ok = isCorrectAnswer(given, expected, acceptedFor(word, to));
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
                  <strong>{formText(item.word, to)}</strong>
                  <span>{formText(item.word, from)}</span>
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
          {sessionKicker(from, to)}
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
            <p className="also">{formText(word, from)}</p>
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
          placeholder={answerPlaceholder(to)}
          disabled={revealed}
        />
        <SpecialKeys
          letters={!revealed ? specials : []}
          label={`${languageName(to)} letters`}
          onInsert={insertLetter}
        />
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
  const [session, setSession] = useState<Entry[] | null>(null);

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

  const pairEntries = useMemo(() => {
    if (!dataset) return [];
    return entriesForPair(dataset.entries, settings.from, settings.to);
  }, [dataset, settings.from, settings.to]);

  function start() {
    const pool = wordsForRange(pairEntries, settings.range);
    setSession(buildSession(pool, settings.size));
  }

  return (
    <div className="page">
      <div className="shell">
        {error && <p className="banner">{error}</p>}
        {!dataset && !error && <p className="lede">Loading the decks…</p>}
        {dataset && !session && (
          <Home
            settings={settings}
            setSettings={setSettings}
            pairCount={pairEntries.length}
            onStart={start}
          />
        )}
        {dataset && session && (
          <Session
            words={session}
            mode={settings.mode}
            from={settings.from}
            to={settings.to}
            onExit={() => setSession(null)}
          />
        )}
        <footer className="foot">
          <p>
            Polish frequency:{" "}
            <a href="https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Polish/KWJP">
              KWJP via Wiktionary
            </a>
            . German frequency:{" "}
            <a href="https://universaldependencies.org/treebanks/de_gsd/index.html">
              Universal Dependencies German-GSD
            </a>
            . Glosses: English Wiktionary (CC BY-SA).
          </p>
        </footer>
      </div>
    </div>
  );
}
