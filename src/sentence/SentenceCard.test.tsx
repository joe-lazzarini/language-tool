import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentenceCard } from "./SentenceCard";

describe("SentenceCard", () => {
  it("shows the pair and a single pair-based known count while locked", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="pl"
        loading={false}
        error={null}
        known={2}
        ready={1}
        unlockHint="Know at least one more verb or adjective for this pair (3 more sentences needed)."
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Sentence quiz");
    expect(html).toContain("English–Polish");
    expect(html).toContain("2 known words for English → Polish");
    expect(html).toContain("more sentences needed");
    expect(html).toContain("Open");
  });

  it("says how many sentences are ready for the pair", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="de"
        to="fr"
        loading={false}
        error={null}
        known={8}
        ready={12}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("12 sentences ready");
    expect(html).toContain("this pair");
    expect(html).toContain("German–French");
  });

  it("shows a locked hint with the directed pair known count", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="pl"
        loading={false}
        error={null}
        known={3}
        ready={0}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("3 known words for English → Polish");
  });
});
