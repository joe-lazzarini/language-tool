import { useState } from "react";
import { LANG_CODES, languageName } from "../lib/languages";
import type { CustomWord } from "../types";

export function WordList({
  words,
  onEdit,
  onDelete,
  onAdd,
  onBack,
}: {
  words: CustomWord[];
  onEdit: (word: CustomWord) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onBack: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ordered = [...words].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));

  return (
    <div className="stack">
      <header className="hero compact">
        <p className="eyebrow">Your deck{words.length ? ` · ${words.length} saved` : ""}</p>
        <h1>Your words</h1>
        <p className="lede">
          These cards join the full deck and My words, in every language direction you filled in.
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
          <p className="hint">No saved words yet. Add one and it will show up in study and quiz.</p>
        ) : (
          <ul className="word-list">
            {ordered.map((word) => (
              <li key={word.id} className="word-row">
                <div className="word-main">
                  <strong>{word.forms.en?.text || "—"}</strong>
                  <span className="pos">{word.pos}</span>
                </div>
                <p className="hint word-gloss">
                  {LANG_CODES.filter((code) => code !== "en" && word.forms[code]?.text)
                    .map((code) => `${languageName(code)}: ${word.forms[code]?.text}`)
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
