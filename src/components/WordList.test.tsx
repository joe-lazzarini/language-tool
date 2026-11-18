import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WordList } from "./WordList";

describe("WordList", () => {
  it("offers Quiz my words when the list has saved cards", () => {
    const html = renderToStaticMarkup(
      <WordList
        words={[
          {
            id: "custom-1",
            pos: "noun",
            pair: ["en", "pl"],
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            forms: {
              en: { text: "cat", accepted: [{ text: "cat" }] },
              pl: { text: "kot", accepted: [{ text: "kot" }] },
            },
          },
        ]}
        from="en"
        to="pl"
        onEdit={() => undefined}
        onDelete={() => undefined}
        onAdd={() => undefined}
        onQuizMyWords={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(html).toContain("Quiz my words");
  });

  it("hides Quiz my words when the list is empty", () => {
    const html = renderToStaticMarkup(
      <WordList
        words={[]}
        from="en"
        to="pl"
        onEdit={() => undefined}
        onDelete={() => undefined}
        onAdd={() => undefined}
        onQuizMyWords={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(html).not.toContain("Quiz my words");
  });
});
