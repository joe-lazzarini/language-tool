import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentenceCard } from "./SentenceCard";

describe("SentenceCard", () => {
  it("shows a single pair known count while locked", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="pl"
        loading={false}
        error={null}
        known={1}
        ready={1}
        unlockHint="Know at least one more verb or adjective for this pair (3 more sentences needed)."
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Sentence quiz");
    expect(html).toContain("English–Polish");
    expect(html).toContain("1 known word for this pair");
    expect(html).not.toContain("one way");
    expect(html).not.toContain("English→Polish only");
    expect(html).toContain("more sentences needed");
    expect(html).toContain("Open");
  });

  it("says how many sentences are ready once unlocked", () => {
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
    expect(html).toContain("know for this pair");
    expect(html).toContain("German–French");
  });

  it("labels Chinese and Japanese pairs without one-way breakdown", () => {
    const zh = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="zh"
        loading={false}
        error={null}
        known={2}
        ready={0}
        onOpen={() => undefined}
      />,
    );
    expect(zh).toContain("English–Chinese");
    expect(zh).toContain("2 known words for this pair");
    expect(zh).not.toContain("only");

    const ja = renderToStaticMarkup(
      <SentenceCard
        from="ja"
        to="en"
        loading={false}
        error={null}
        known={0}
        ready={0}
        onOpen={() => undefined}
      />,
    );
    expect(ja).toContain("Japanese–English");
    expect(ja).toContain("0 known words for this pair");
  });
});
