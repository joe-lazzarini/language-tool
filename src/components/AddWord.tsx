import { FormEvent, useRef, useState } from "react";
import { SpecialKeys } from "./SpecialKeys";
import { finalizeLanguage } from "../lib/forms";
import {
  canonicalPair,
  LANG_CODES,
  sameLanguagePair,
  languageByCode,
  languageName,
  languageOptionLabel,
  pairNames,
  SPECIAL_LETTERS,
} from "../lib/languages";
import { createCustomWord } from "../lib/customWords";
import { lookupWord, type LookupDraft } from "../lib/translate";
import type { AcceptedAnswer, CustomWord, Entry, LangCode } from "../types";

const POS_OPTIONS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "phrase",
  "word",
];

type DraftForms = Record<LangCode, { text: string; accepted: AcceptedAnswer[] }>;

function emptyForms(): DraftForms {
  return Object.fromEntries(
    LANG_CODES.map((code) => [code, { text: "", accepted: [{ text: "" }] }]),
  ) as DraftForms;
}

function fromWord(word: CustomWord): DraftForms {
  const forms = emptyForms();
  for (const code of LANG_CODES) {
    const form = word.forms[code];
    if (!form) continue;
    forms[code] = {
      text: form.text,
      accepted: form.accepted.length > 0 ? form.accepted.map((item) => ({ ...item })) : [{ text: "" }],
    };
  }
  return forms;
}

function fromLookup(draft: LookupDraft): DraftForms {
  const forms = emptyForms();
  for (const code of LANG_CODES) {
    const form = draft.forms[code];
    if (!form) continue;
    forms[code] = {
      text: form.text,
      accepted: form.accepted.map((item) => ({ ...item })),
    };
  }
  return forms;
}

export function AddWord({
  deck,
  from,
  to,
  initial,
  onSave,
  onCancel,
  lookup = lookupWord,
}: {
  deck: Entry[];
  from: LangCode;
  to: LangCode;
  initial?: CustomWord | null;
  onSave: (word: CustomWord) => Promise<void> | void;
  onCancel: () => void;
  lookup?: typeof lookupWord;
}) {
  const editing = Boolean(initial);
  const pair = initial?.pair ?? canonicalPair(from, to);
  const fieldOrder: LangCode[] = !pair
    ? [from]
    : sameLanguagePair(pair, from, to) && from !== to
      ? [from, to]
      : [pair[0], pair[1]];
  const [source, setSource] = useState<LangCode>(fieldOrder.includes(from) ? from : fieldOrder[0]);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(initial?.pos || "noun");
  const [forms, setForms] = useState<DraftForms>(() => (initial ? fromWord(initial) : emptyForms()));
  const [notes, setNotes] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(editing);
  const queryRef = useRef<HTMLInputElement>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);

  const posOptions = POS_OPTIONS.includes(pos) ? POS_OPTIONS : [pos, ...POS_OPTIONS];

  function insertAt(field: HTMLInputElement | null, letter: string, apply: (next: string) => void) {
    if (!field) {
      apply(letter);
      return;
    }
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const next = field.value.slice(0, start) + letter + field.value.slice(end);
    apply(next);
    requestAnimationFrame(() => {
      field.focus();
      const posIndex = start + letter.length;
      field.setSelectionRange(posIndex, posIndex);
    });
  }

  async function runLookup(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || looking) return;
    setLooking(true);
    setError(null);
    try {
      const draft = await lookup(trimmed, source, deck, fetch, fieldOrder);
      setForms(fromLookup(draft));
      setPos(draft.pos || "word");
      setNotes(draft.notes);
      setRevealed(true);
    } catch {
      setError("The lookup failed. Fill in the translations yourself.");
      setRevealed(true);
      setForms((current) => ({
        ...current,
        [source]: { text: trimmed, accepted: [{ text: trimmed }] },
      }));
    } finally {
      setLooking(false);
    }
  }

  function updateText(code: LangCode, text: string) {
    setForms((current) => ({ ...current, [code]: { ...current[code], text } }));
  }

  function updateRow(code: LangCode, index: number, patch: Partial<AcceptedAnswer>) {
    setForms((current) => {
      const accepted = current[code].accepted.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      );
      return { ...current, [code]: { ...current[code], accepted } };
    });
  }

  function addRow(code: LangCode) {
    setForms((current) => ({
      ...current,
      [code]: { ...current[code], accepted: [...current[code].accepted, { text: "" }] },
    }));
  }

  function removeRow(code: LangCode, index: number) {
    setForms((current) => {
      const accepted = current[code].accepted.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        [code]: { ...current[code], accepted: accepted.length > 0 ? accepted : [{ text: "" }] },
      };
    });
  }

  async function save() {
    setError(null);
    if (!pair) {
      setError("Choose two different languages before saving.");
      return;
    }
    const nextForms: CustomWord["forms"] = {};
    for (const code of pair) {
      const form = finalizeLanguage(forms[code].text, forms[code].accepted);
      if (form) nextForms[code] = form;
    }
    if (!nextForms[pair[0]] || !nextForms[pair[1]]) {
      setError(`Add both ${languageName(pair[0])} and ${languageName(pair[1])} before saving.`);
      return;
    }
    setSaving(true);
    try {
      const word = createCustomWord({
        id: initial?.id,
        pos,
        forms: nextForms,
        pair,
        createdAt: initial?.createdAt,
      });
      await onSave(word);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that word.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <header className="hero compact">
        <p className="eyebrow">{editing ? "Edit card" : "New card"}</p>
        <h1>{editing ? "Edit word" : "Add a word"}</h1>
        <p className="lede">
          Saved for {pairNames(from, to)} only. The other direction uses the same words. Type a word in
          one of these languages. The other is filled from the built-in deck, then Wiktionary, then
          MyMemory. Check it, then save.
        </p>
      </header>

      {!editing && (
        <form className="panel" onSubmit={runLookup}>
          <div className="field">
            <label className="label" htmlFor="lookup-source">
              I know it in
            </label>
            <select
              id="lookup-source"
              className="textin"
              value={source}
              onChange={(event) => {
                const next = event.target.value;
                if (fieldOrder.some((code) => code === next)) setSource(next as LangCode);
              }}
            >
              {fieldOrder.map((code) => (
                <option key={code} value={code}>
                  {languageOptionLabel(languageByCode(code))}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="lookup-word">
              Word
            </label>
            <input
              id="lookup-word"
              ref={queryRef}
              className="textin"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              lang={languageByCode(source).locale}
              placeholder={`Type the ${languageName(source)} word`}
            />
            {languageByCode(source).answerHint ? <p className="hint">{languageByCode(source).answerHint}</p> : null}
            <SpecialKeys
              letters={SPECIAL_LETTERS[source] ?? []}
              label={`${languageName(source)} letters`}
              onInsert={(letter) =>
                insertAt(queryRef.current, letter, (next) => {
                  setQuery(next);
                })
              }
            />
          </div>
          <button type="submit" className="primary" disabled={!query.trim() || looking}>
            {looking ? "Looking up…" : "Look up"}
          </button>
        </form>
      )}

      {revealed && (
        <section className="panel">
          {notes.map((note) => (
            <p key={note} className="hint">
              {note}
            </p>
          ))}
          <div className="field">
            <label className="label" htmlFor="word-pos">
              Part of speech
            </label>
            <select id="word-pos" className="textin" value={pos} onChange={(event) => setPos(event.target.value)}>
              {posOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          {fieldOrder.map((code) => (
            <fieldset key={code} className="lang-block">
              <legend>{languageName(code)}</legend>
              <label className="field">
                <span className="label">Shown on the card</span>
                <input
                  className="textin"
                  value={forms[code].text}
                  onChange={(event) => updateText(code, event.target.value)}
                  onFocus={(event) => {
                    focusRef.current = event.currentTarget;
                  }}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <span className="label">Accepted answers</span>
              {forms[code].accepted.map((row, index) => (
                <div key={`${code}-${index}`} className="accepted-edit">
                  <input
                    className="textin"
                    aria-label={`${languageName(code)} answer ${index + 1}`}
                    value={row.text}
                    placeholder="dictionary form"
                    onChange={(event) => updateRow(code, index, { text: event.target.value })}
                    onFocus={(event) => {
                      focusRef.current = event.currentTarget;
                    }}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <input
                    className="textin"
                    aria-label={`${languageName(code)} context ${index + 1}`}
                    value={row.context ?? ""}
                    placeholder="context, optional"
                    onChange={(event) => updateRow(code, index, { context: event.target.value })}
                    onFocus={(event) => {
                      focusRef.current = event.currentTarget;
                    }}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button type="button" className="ghost" onClick={() => removeRow(code, index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="secondary slim" onClick={() => addRow(code)}>
                Add answer
              </button>
              <SpecialKeys
                letters={SPECIAL_LETTERS[code] ?? []}
                label={`${languageName(code)} letters`}
                onInsert={(letter) => {
                  const field = focusRef.current;
                  const inBlock = field?.closest("fieldset")?.querySelector("legend")?.textContent === languageName(code);
                  if (!inBlock || !field) {
                    updateText(code, forms[code].text + letter);
                    return;
                  }
                  insertAt(field, letter, (next) => {
                    if (field.getAttribute("aria-label")?.includes("context")) {
                      const index = Number(field.getAttribute("aria-label")?.match(/(\d+)/)?.[1] ?? 1) - 1;
                      updateRow(code, index, { context: next });
                      return;
                    }
                    if (field.getAttribute("aria-label")?.includes("answer")) {
                      const index = Number(field.getAttribute("aria-label")?.match(/(\d+)/)?.[1] ?? 1) - 1;
                      updateRow(code, index, { text: next });
                      return;
                    }
                    updateText(code, next);
                  });
                }}
              />
            </fieldset>
          ))}
          {error && <p className="banner">{error}</p>}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save card"}
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {!revealed && (
        <button type="button" className="ghost" onClick={onCancel}>
          Back
        </button>
      )}
    </div>
  );
}
