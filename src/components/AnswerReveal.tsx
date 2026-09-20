import type { AcceptedAnswer } from "../types";

export function AnswerReveal({ answers }: { answers: AcceptedAnswer[] }) {
  if (answers.length === 0) return null;
  return (
    <div className="expected">
      <span>{answers.length === 1 ? "Expected" : "Accepted answers"}</span>
      <ul className="accepted-list">
        {answers.map((item) => (
          <li key={item.text}>
            <strong>{item.text}</strong>
            {item.context ? <span className="context">{item.context}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
