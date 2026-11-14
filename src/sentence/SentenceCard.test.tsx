import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentenceCard } from "./SentenceCard";

describe("SentenceCard", () => {
  it("shows the pair and that the quiz is still locked", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="pl"
        loading={false}
        error={null}
        knownPrompt={2}
        knownAnswer={1}
        ready={1}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Sentence quiz");
    expect(html).toContain("English–Polish");
    expect(html).toContain("1 known in Polish");
    expect(html).toContain("2 known in English");
    expect(html).toContain("Open");
  });

  it("says how many sentences are ready", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="de"
        to="fr"
        loading={false}
        error={null}
        knownPrompt={8}
        knownAnswer={8}
        ready={12}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("12 sentences ready");
    expect(html).toContain("German–French");
  });
});
