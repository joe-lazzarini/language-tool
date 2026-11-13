import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AccountBar } from "./components/AccountBar";
import { AddWord } from "./components/AddWord";
import { AnswerReveal } from "./components/AnswerReveal";
import { SpecialKeys } from "./components/SpecialKeys";
import { WordList } from "./components/WordList";
import { customWordsForPair, withCustomEntries, toEntry, type CustomWord } from "./lib/customWords";
import {
  acceptedFor,
  buildSession,
  entriesForPair,
  expectedFor,
  formText,
  promptFor,
  RANGES,
  revealAnswers,
  sessionKicker,
  wordsForRange,
} from "./lib/deck";
import { assembleEntries, loadCatalog, loadLangPack } from "./lib/loadDeck";
import { useCustomWords } from "./lib/useCustomWords";
import {
  answerPlaceholder,
  isLangCode,
  LANG_CODES,
  languageByCode,
  languageName,
  languageOptionLabel,
  LANGUAGES,
  otherLanguage,
  pairHint,
  pairLabel,
  pairNames,
  SPECIAL_LETTERS,
} from "./lib/languages";
import { isCorrectAnswer } from "./lib/match";
import type { CardResult, Catalog, Entry, LangCode, LangPack, Mode, Settings } from "./types";

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
    const range = parsed.range && RANGES.some((item) => item.id === parsed.range) ? parsed.range : defaultSettings.range;
    return {
      ...defaultSettings,
      ...parsed,
      from,
      to: to === from ? otherLanguage(from) : to,
      range,
    };
  } catch {
    return defaultSettings;
  }
}

function LanguagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LangCode;
  onChange: (code: LangCode) => void;
}) {
  const id = `lang-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="textin"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (isLangCode(next)) onChange(next);
        }}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {languageOptionLabel(lang)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Home({
  settings,
  setSettings,
  pairCount,
  pool,
  customCount,
  onStart,
  onAdd,
  onList,
}: {
  settings: Settings;
  setSettings: (next: Settings) => void;
  pairCount: number;
  pool: number;
  customCount: number;
  onStart: () => void;
  onAdd: () => void;
  onList: () => void;
}) {
  const sameLanguage = settings.from === settings.to;

  function setFrom(from: LangCode) {
    const to = from === settings.to ? otherLanguage(from) : settings.to;
    setSettings({ ...settings, from, to });
  }

  function setTo(to: LangCode) {
    const from = to === settings.from ? otherLanguage(to) : settings.from;
    setSettings({ ...settings, from, to });
  }

  function swap() {
    setSettings({ ...settings, from: settings.to, to: settings.from });
  }

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">Any two languages</p>
        <h1>Słówka</h1>
        <p className="lede">
          Practice common lemmas in their dictionary form. Choose any prompt and answer language,
          type any accepted translation, and see each valid form with a short gloss.
        </p>
      </header>

      <section className="panel">
        <div className={settings.range === "mine" ? "mine-card on" : "mine-card"}>
          <button
            type="button"
            className="mine-select"
            aria-pressed={settings.range === "mine"}
            onClick={() => setSettings({ ...settings, range: "mine" })}
          >
            <span className="mine-card-title">
              My words
              <span className="mine-pair"> · {pairNames(settings.from, settings.to)}</span>
              {settings.range === "mine" ? <span className="mine-selected">Selected</span> : null}
            </span>
            <span className="mine-card-hint">
              {customCount === 0
                ? "No saved words for this pair yet"
                : `${customCount} saved ${customCount === 1 ? "word" : "words"}`}
            </span>
            <span className="mine-count" aria-hidden="true">
              {customCount}
            </span>
          </button>
          <div className="tool-row">
            <button type="button" className="mine-add" onClick={onAdd}>
              Add a word
            </button>
            <button type="button" className="mine-list" onClick={onList}>
              Your words{customCount ? ` (${customCount})` : ""}
            </button>
          </div>
        </div>

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
          {pairLabel(settings.from, settings.to)} — {pairHint(settings.from, settings.to)} Saved in this browser.
          A new visit starts from English to Polish.
        </p>

        <div className="field">
          <span className="label">Which words</span>
          <div className="chips">
            {RANGES.filter((range) => range.id !== "mine").map((range) => (
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
            {settings.range === "mine"
              ? pool === 0
                ? "You haven't added words for this pair yet."
                : `${pool} saved ${pool === 1 ? "word" : "words"} for ${pairLabel(settings.from, settings.to)}.`
              : `${pairCount} usable ${pairLabel(settings.from, settings.to)} cards; ${pool} in this band, shuffled each round.`}
            {customCount > 0 && settings.range !== "mine" && settings.range !== "all"
              ? " Your words for this pair are in All and in My words."
              : ""}
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
    const ok = isCorrectAnswer(given, expected, acceptedFor(word, to), to);
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
          <span className="pos">{word.custom ? "your word · " : ""}{word.pos}</span>
        </p>
        <p className="prompt" lang={languageByCode(from).locale}>
          {prompt}
        </p>
        {revealed && (
          <div className="feedback" role="status">
            {correct === true && <p className="ok-text">Correct</p>}
            {correct === false && <p className="bad-text">Incorrect</p>}
            {correct === null && <p className="open-text">Answer</p>}
            <AnswerReveal answers={revealAnswers(word, to)} />
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
          lang={languageByCode(to).locale}
          placeholder={answerPlaceholder(to)}
          disabled={revealed}
        />
        {languageByCode(to).answerHint ? <p className="hint">{languageByCode(to).answerHint}</p> : null}
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

type Screen = "home" | "add" | "list";

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [packs, setPacks] = useState<Partial<Record<LangCode, LangPack>>>({});
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Entry[] | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [editing, setEditing] = useState<CustomWord | null>(null);
  const wordsApi = useCustomWords();

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pair = [settings.from, settings.to];
    const rest = LANG_CODES.filter((code) => code !== settings.from && code !== settings.to);
    async function load(codes: readonly LangCode[]) {
      const rows = await Promise.all(codes.map(async (code) => [code, await loadLangPack(code)] as const));
      if (cancelled) return;
      setPacks((prev) => {
        const next = { ...prev };
        for (const [code, pack] of rows) next[code] = pack;
        return next;
      });
    }
    load(pair)
      .then(() => load(rest))
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.from, settings.to]);

  function setSettings(next: Settings) {
    setSettingsState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const entries = useMemo(() => (catalog ? assembleEntries(catalog, packs) : []), [catalog, packs]);
  const pairReady = Boolean(catalog && packs[settings.from] && packs[settings.to]);
  const pairWords = useMemo(
    () => customWordsForPair(wordsApi.words, settings.from, settings.to),
    [wordsApi.words, settings.from, settings.to],
  );
  const customEntries = useMemo(() => pairWords.map(toEntry), [pairWords]);
  const studyEntries = useMemo(
    () => (catalog ? withCustomEntries(entries, customEntries) : customEntries),
    [catalog, entries, customEntries],
  );
  const pairEntries = useMemo(() => {
    const source = settings.range === "mine" ? customEntries : studyEntries;
    return entriesForPair(source, settings.from, settings.to);
  }, [customEntries, studyEntries, settings.from, settings.to, settings.range]);
  const pool = wordsForRange(pairEntries, settings.range).length;

  function start() {
    const pool = wordsForRange(pairEntries, settings.range);
    setSession(buildSession(pool, settings.size));
  }

  return (
    <div className="page">
      <div className="shell">
        {error && <p className="banner">{error}</p>}
        {!session && (
          <AccountBar
            configured={wordsApi.configured}
            account={wordsApi.account}
            ready={wordsApi.ready}
            status={wordsApi.status}
            error={wordsApi.error}
            signingIn={wordsApi.signingIn}
            onSignIn={() => void wordsApi.signIn()}
            onSignOut={() => void wordsApi.signOut()}
          />
        )}
        {!pairReady && !error && screen !== "list" && <p className="lede">Loading the decks…</p>}
        {pairReady && !session && screen === "home" && (
          <Home
            settings={settings}
            setSettings={setSettings}
            pairCount={pairEntries.length}
            pool={pool}
            customCount={pairWords.length}
            onStart={start}
            onAdd={() => {
              setEditing(null);
              setScreen("add");
            }}
            onList={() => setScreen("list")}
          />
        )}
        {!session && screen === "add" && !pairReady && !error && (
          <p className="lede">Loading dictionaries…</p>
        )}
        {!session && screen === "add" && pairReady && (
          <AddWord
            deck={entries}
            from={settings.from}
            to={settings.to}
            initial={editing}
            onCancel={() => {
              setEditing(null);
              setScreen(editing ? "list" : "home");
            }}
            onSave={async (word) => {
              await wordsApi.saveWord(word);
              setEditing(null);
              setScreen("list");
            }}
          />
        )}
        {!session && screen === "list" && (
          <WordList
            words={pairWords}
            from={settings.from}
            to={settings.to}
            onAdd={() => {
              setEditing(null);
              setScreen("add");
            }}
            onEdit={(word) => {
              setEditing(word);
              setScreen("add");
            }}
            onDelete={(id) => void wordsApi.deleteWord(id)}
            onBack={() => setScreen("home")}
          />
        )}
        {session && (
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
            {catalog
              ? Object.values(catalog.meta.sources).map((source, index) => (
                  <span key={source.name}>
                    {index > 0 ? " · " : "Sources: "}
                    <a href={source.url}>{source.name}</a>
                  </span>
                ))
              : "Sources load with the deck."}{" "}
            Words you add are looked up in that deck, then English Wiktionary and{" "}
            <a href="https://mymemory.translated.net/">MyMemory</a>.
          </p>
        </footer>
      </div>
    </div>
  );
}
