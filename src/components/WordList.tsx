import { useState } from "react";
import { LANG_CODES, languageName, pairNames, type LangCode } from "../lib/languages";
import type { CustomWord } from "../types";

export function WordList({
  words,
  from,
  to,
  onEdit,
  onDelete,
  onAdd,
  onBack,
}: {
  words: CustomWord[];
  from: LangCode;
  to: LangCode;
  onEdit: (word: CustomWord) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onBack: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ordered = [...words].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const label = pairNames(from, to);

  function codesFor(word: CustomWord): LangCode[] {
    if (word.pair) return [word.pair[0], word.pair[1]];
    return LANG_CODES.filter((code) => word.forms[code]?.text.trim());
  }

  function primaryCode(word: CustomWord): LangCode | null {
    if (word.forms[from]?.text.trim()) return from;
    return codesFor(word).find((code) => word.forms[code]?.text.trim()) ?? null;
  }

  return (
    <div className="stack">
      <header className="hero compact">
        <p className="eyebrow">
          {label}
          {words.length ? ` · ${words.length} saved` : ""}
        </p>
        <h1>Your words</h1>
        <p className="lede">
          These cards join the full deck and My words for {label}. Swapping the direction keeps this list.
        </p>
      </header>
      <section className="panel">
        <div className="actions">
          <button type="button" className="mine-add" onClick={onAdd}>
            Add a word
          </button>
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
        </div>
        {ordered.length === 0 ? (
          <p className="hint">No saved words for {label} yet. Add one and it will show up in study and quiz.</p>
        ) : (
          <ul className="word-list">
            {ordered.map((word) => {
              const primary = primaryCode(word);
              const title = primary ? word.forms[primary]?.text || "—" : "—";
              return (
              <li key={word.id} className="word-row">
                <div className="word-main">
                  <strong>{title}</strong>
                  <span className="pos">{word.pos}</span>
                </div>
                <p className="hint word-gloss">
                  {codesFor(word)
                    .filter((code) => code !== primary)
                    .map((code) => `${languageName(code)}: ${word.forms[code]?.text || "—"}`)
                    .join(" · ")}
                </p>
                <div className="row-actions">
                  <button type="button" className="secondary" onClick={() => onEdit(word)}>
                    Edit
                  </button>
                  {confirmId === word.id ? (
                    <>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          onDelete(word.id);
                          setConfirmId(null);
                        }}
                      >
                        Delete
                      </button>
                      <button type="button" className="ghost" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ghost" onClick={() => setConfirmId(word.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
