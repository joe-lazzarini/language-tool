export function SpecialKeys({
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
