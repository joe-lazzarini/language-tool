import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AccountBar } from "./components/AccountBar";
import { AddWord } from "./components/AddWord";
import { AnswerReveal } from "./components/AnswerReveal";
import { SpecialKeys } from "./components/SpecialKeys";
import { WordList } from "./components/WordList";
import { customWordsForPair, withCustomEntries, toEntry, type CustomWord } from "./lib/customWords";
import {
  acceptedFor,
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
import {
  otherPairsWithWords,
  practiceRanges,
  rangeChoiceLabel,
  startActionLabel,
  type OtherPairWords,
} from "./lib/practiceSetup";
import { focusHint, selectCards, weakCount } from "./accuracy/stats";
import { useAccuracy } from "./accuracy/useAccuracy";
import { applyAdvanceKey, keyTargetKind, releaseAdvanceKey, type AdvanceKeyHold } from "./lib/advanceKey";
import { isComposingKeyEvent, shouldBlockGradeOrAdvance } from "./lib/ime";
import { isCorrectAnswer } from "./lib/match";
import { scoreSummary } from "./lib/sessionResults";
import { SentenceCard } from "./sentence/SentenceCard";
import { SentenceQuiz } from "./sentence/SentenceQuiz";
import { useSentenceStatus } from "./sentence/useSentenceStatus";
import type { CardResult, Catalog, Entry, Focus, LangCode, LangPack, Mode, Settings } from "./types";

const STORAGE_KEY = "slowka-settings-v2";
const LEGACY_STORAGE_KEY = "slowka-settings-v1";

const defaultSettings: Settings = {
  mode: "quiz",
  from: "en",
  to: "pl",
  range: "top100",
  size: 10,
  focus: "all",
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
    const focus: Focus = parsed.focus === "weak" ? "weak" : "all";
    return {
      ...defaultSettings,
      ...parsed,
      from,
      to: to === from ? otherLanguage(from) : to,
      range,
      focus,
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

export function Home({
  settings,
  setSettings,
  pairCount,
  pool,
  customCount,
  otherPairs,
  weakInBand,
  sentence,
  onStart,
  onAdd,
  onList,
  onSentence,
}: {
  settings: Settings;
  setSettings: (next: Settings) => void;
  pairCount: number;
  pool: number;
  customCount: number;
  otherPairs: OtherPairWords[];
  weakInBand: number;
  sentence: {
    loading: boolean;
    error: string | null;
    knownBoth: number;
    knownOneWay: number;
    knownForwardOnly: number;
    knownReverseOnly: number;
    ready: number;
    unlockHint: string;
  };
  onStart: () => void;
  onAdd: () => void;
  onList: () => void;
  onSentence: () => void;
}) {
  const sameLanguage = settings.from === settings.to;
  const mineEmpty = settings.range === "mine" && customCount === 0;
  const startLabel = startActionLabel(settings.mode, settings.range, customCount);

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

  function switchPair(pair: OtherPairWords["pair"]) {
    const [a, b] = pair;
    // Prefer keeping the current prompt language when it is on the target pair.
    if (settings.from === a || settings.from === b) {
      const to = settings.from === a ? b : a;
      setSettings({ ...settings, from: settings.from, to, range: "mine" });
      return;
    }
    if (settings.to === a || settings.to === b) {
      const from = settings.to === a ? b : a;
      setSettings({ ...settings, from, to: settings.to, range: "mine" });
      return;
    }
    setSettings({ ...settings, from: a, to: b, range: "mine" });
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
        <div className="tool-row words-tools">
          <button type="button" className="mine-add" onClick={onAdd}>
            Add a word
          </button>
          <button type="button" className="mine-list" onClick={onList}>
            Your words{customCount ? ` (${customCount})` : ""}
          </button>
        </div>

        <SentenceCard
          from={settings.from}
          to={settings.to}
          loading={sentence.loading}
          error={sentence.error}
          knownBoth={sentence.knownBoth}
          knownOneWay={sentence.knownOneWay}
          knownForwardOnly={sentence.knownForwardOnly}
          knownReverseOnly={sentence.knownReverseOnly}
          ready={sentence.ready}
          unlockHint={sentence.unlockHint}
          onOpen={onSentence}
        />

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
          <span className="label">Focus</span>
          <div className="segment">
            {(
              [
                ["all", "All"],
                ["weak", "Weak words"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.focus === value ? "on" : ""}
                onClick={() => setSettings({ ...settings, focus: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">{focusHint(settings.focus, weakInBand)}</p>
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
          <div className="chips" role="group" aria-label="Practice from">
            {practiceRanges().map((range) => (
              <button
                key={range.id}
                type="button"
                className={[
                  "chip",
                  range.id === "mine" ? "chip-mine" : "",
                  settings.range === range.id ? "on" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={settings.range === range.id}
                onClick={() => setSettings({ ...settings, range: range.id })}
              >
                {rangeChoiceLabel(range.id, customCount)}
              </button>
            ))}
          </div>
          <p className="hint">
            Practice from {rangeChoiceLabel(settings.range, customCount)}
            {settings.range === "mine" ? ` for ${pairNames(settings.from, settings.to)}` : ""}.
          </p>
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

        {mineEmpty ? (
          <div className="mine-empty" role="status">
            <p className="mine-empty-title">No words for {pairNames(settings.from, settings.to)} yet</p>
            <p className="hint">
              Words you add are kept per language pair. Add one for this prompt and answer pair, or switch to a
              pair that already has saved words.
            </p>
            {otherPairs.length > 0 ? (
              <div className="field">
                <span className="label">Saved on other pairs</span>
                <div className="chips">
                  {otherPairs.map((item) => (
                    <button
                      key={`${item.pair[0]}-${item.pair[1]}`}
                      type="button"
                      className="chip"
                      onClick={() => switchPair(item.pair)}
                    >
                      {item.label} ({item.count})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="button" className="mine-add" onClick={onAdd}>
              Add a word
            </button>
          </div>
        ) : (
          <button type="button" className="primary" onClick={onStart} disabled={pool === 0 || sameLanguage}>
            {startLabel}
          </button>
        )}
      </section>
    </div>
  );
}

export function Session({
  words,
  mode,
  from,
  to,
  onExit,
  onGraded,
}: {
  words: Entry[];
  mode: Mode;
  from: LangCode;
  to: LangCode;
  onExit: () => void;
  onGraded?: (wordId: string, correct: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<CardResult[]>([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const heldKeys = useRef(new Map<string, AdvanceKeyHold>());
  const nextRef = useRef<() => void>(() => {});
  const composingRef = useRef(false);
  /** Mirrors results so Finish / Exit never read a stale closure array. */
  const resultsRef = useRef<CardResult[]>([]);
  const indexRef = useRef(0);

  const word = words[index];
  const total = words.length;
  const prompt = word ? promptFor(word, from) : "";
  const expected = word ? expectedFor(word, to) : "";
  const specials = SPECIAL_LETTERS[to] ?? [];

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, done]);

  useEffect(() => {
    if (revealed) inputRef.current?.blur();
  }, [revealed]);

  function commitResult(entry: Entry, ok: boolean, given: string) {
    const row: CardResult = { word: entry, correct: ok, given };
    resultsRef.current = [...resultsRef.current, row];
    setResults(resultsRef.current);
    onGraded?.(entry.id, ok);
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
    if (!word || revealed || shouldBlockGradeOrAdvance(composingRef.current)) return;
    const ok = isCorrectAnswer(given, expected, acceptedFor(word, to), to);
    setCorrect(ok);
    setRevealed(true);
    commitResult(word, ok, given.trim());
  }

  function reveal() {
    if (!word || revealed) return;
    // Study reveal / quiz skip both mean "not known" — record as a miss.
    setCorrect(mode === "quiz" ? false : null);
    setRevealed(true);
    commitResult(word, false, input.trim());
  }

  function finish() {
    setResults(resultsRef.current);
    setDone(true);
  }

  function next() {
    if (indexRef.current + 1 >= total) {
      finish();
      return;
    }
    indexRef.current += 1;
    setIndex(indexRef.current);
    setInput("");
    setRevealed(false);
    setCorrect(null);
  }

  function requestExit() {
    if (resultsRef.current.length > 0) {
      finish();
      return;
    }
    onExit();
  }

  nextRef.current = next;

  useEffect(() => {
    if (done) return;

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
  }, [revealed, done]);

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

  if (done) {
    const scored = resultsRef.current.length > 0 ? resultsRef.current : results;
    const { right, total: graded, missed } = scoreSummary(scored);
    return (
      <div className="stack">
        <header className="hero compact">
          <p className="eyebrow">{mode === "quiz" ? "Quiz complete" : "Study complete"}</p>
          <h1>{mode === "quiz" ? `${right} / ${graded}` : "Round finished"}</h1>
          <p className="lede">
            {mode === "quiz"
              ? right === graded
                ? "Every lemma matched. Nice work."
                : "Review the misses, then run another round."
              : missed.length > 0
                ? "Review the cards you missed, then start another set whenever you like."
                : "You walked through the cards. Start another set whenever you like."}
          </p>
        </header>
        {missed.length > 0 && (
          <section className="panel">
            <h2>Missed ({missed.length})</h2>
            <ul className="misses">
              {missed.map((item, missIndex) => (
                <li key={`${item.word.id}-${missIndex}`}>
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
        <button type="button" className="ghost" onClick={requestExit}>
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
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            // CompositionEnd can fire before the Enter that committed the IME.
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
            <div className="next-row">
              <button type="submit" className="primary">
                {index + 1 >= total ? "Finish" : "Next"}
              </button>
              <p className="hint advance-hint">Press Enter or Space</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

type Screen = "home" | "add" | "list" | "sentence";

function sentenceHash(): boolean {
  return typeof location !== "undefined" && location.hash === "#sentence";
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [packs, setPacks] = useState<Partial<Record<LangCode, LangPack>>>({});
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Entry[] | null>(null);
  const [screen, setScreen] = useState<Screen>(sentenceHash() ? "sentence" : "home");
  const [editing, setEditing] = useState<CustomWord | null>(null);
  const wordsApi = useCustomWords();
  const accuracy = useAccuracy(wordsApi.account?.uid ?? null);

  useEffect(() => {
    function onHash() {
      if (sentenceHash()) {
        setScreen("sentence");
        return;
      }
      setScreen((current) => (current === "sentence" ? "home" : current));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
  const otherPairs = useMemo(
    () => otherPairsWithWords(wordsApi.words, settings.from, settings.to),
    [wordsApi.words, settings.from, settings.to],
  );
  const customEntries = useMemo(() => pairWords.map(toEntry), [pairWords]);
  const studyEntries = useMemo(
    () => (catalog ? withCustomEntries(entries, customEntries) : customEntries),
    [catalog, entries, customEntries],
  );
  /** All pair vocabulary for sentence quiz (deck + add-a-word), not the study band. */
  const sentenceEntries = useMemo(
    () => entriesForPair(studyEntries, settings.from, settings.to),
    [studyEntries, settings.from, settings.to],
  );
  const sentenceStatus = useSentenceStatus(
    settings.from,
    settings.to,
    accuracy.revision,
    accuracy.read,
    sentenceEntries,
  );
  const pairEntries = useMemo(() => {
    const source = settings.range === "mine" ? customEntries : studyEntries;
    return entriesForPair(source, settings.from, settings.to);
  }, [customEntries, studyEntries, settings.from, settings.to, settings.range]);
  const pool = wordsForRange(pairEntries, settings.range).length;

  function start() {
    const band = wordsForRange(pairEntries, settings.range);
    setSession(selectCards(band, accuracy.read(settings.from, settings.to), settings.focus, settings.size));
  }

  /** Quiz only the user's words for the current pair (Weak focus still applies). */
  function quizMyWords(extra?: CustomWord) {
    const next: Settings = { ...settings, range: "mine", mode: "quiz" };
    setSettings(next);
    const customs = customWordsForPair(wordsApi.words, settings.from, settings.to).map(toEntry);
    if (extra && !customs.some((entry) => entry.id === extra.id)) customs.push(toEntry(extra));
    const usable = entriesForPair(customs, settings.from, settings.to);
    const band = wordsForRange(usable, "mine");
    if (band.length === 0) {
      setSession(null);
      setScreen("home");
      return;
    }
    setSession(selectCards(band, accuracy.read(settings.from, settings.to), next.focus, next.size));
    setScreen("home");
  }

  function openSentence() {
    if (!sentenceHash()) location.hash = "sentence";
    setScreen("sentence");
  }

  function closeSentence() {
    if (sentenceHash()) history.pushState(null, "", `${location.pathname}${location.search}`);
    setScreen("home");
  }

  return (
    <div className="page">
      <div className="shell">
        {error && <p className="banner">{error}</p>}
        {accuracy.error && <p className="banner">{accuracy.error}</p>}
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
        {!pairReady && !error && (screen === "home" || screen === "add") && <p className="lede">Loading the decks…</p>}
        {pairReady && !session && screen === "home" && (
          <Home
            settings={settings}
            setSettings={setSettings}
            pairCount={pairEntries.length}
            pool={pool}
            customCount={pairWords.length}
            otherPairs={otherPairs}
            weakInBand={weakCount(wordsForRange(pairEntries, settings.range), accuracy.read(settings.from, settings.to))}
            sentence={sentenceStatus}
            onStart={start}
            onSentence={openSentence}
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
            }}
            onViewList={() => setScreen("list")}
            onQuizMyWords={(word) => quizMyWords(word)}
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
            onQuizMyWords={() => quizMyWords()}
            onBack={() => setScreen("home")}
          />
        )}
        {!session && screen === "sentence" && (
          <SentenceQuiz
            from={settings.from}
            to={settings.to}
            studyEntries={sentenceEntries}
            revision={accuracy.revision}
            read={accuracy.read}
            onToggleManual={accuracy.toggleManual}
            onExit={closeSentence}
          />
        )}
        {session && (
          <Session
            words={session}
            mode={settings.mode}
            from={settings.from}
            to={settings.to}
            onExit={() => setSession(null)}
            onGraded={(wordId, correct) => accuracy.record(settings.from, settings.to, wordId, correct)}
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
