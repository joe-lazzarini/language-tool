import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerReveal } from "./AnswerReveal";

describe("AnswerReveal", () => {
  it("lists each accepted form with its context", () => {
    const html = renderToStaticMarkup(
      <AnswerReveal
        answers={[
          { text: "ten", context: "masculine" },
          { text: "ta", context: "feminine" },
          { text: "to", context: "neuter" },
        ]}
      />,
    );
    expect(html).toContain("Accepted answers");
    expect(html).toContain("ten");
    expect(html).toContain("masculine");
    expect(html).toContain("ta");
    expect(html).toContain("feminine");
    expect(html).toContain("to");
    expect(html).toContain("neuter");
  });

  it("uses a single expected label when there is one answer", () => {
    const html = renderToStaticMarkup(<AnswerReveal answers={[{ text: "być" }]} />);
    expect(html).toContain("Expected");
    expect(html).toContain("być");
    expect(html).not.toContain("Accepted answers");
  });
});
