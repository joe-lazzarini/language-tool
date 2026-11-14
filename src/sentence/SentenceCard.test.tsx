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
        unlockHint="Know at least one more verb or adjective on both sides (3 more sentences needed)."
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Sentence quiz");
    expect(html).toContain("English–Polish");
    expect(html).toContain("more sentences needed");
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
