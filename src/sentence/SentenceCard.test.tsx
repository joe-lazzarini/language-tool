import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentenceCard } from "./SentenceCard";

describe("SentenceCard", () => {
  it("shows pair-based known counts and one-way practice hint while locked", () => {
    const html = renderToStaticMarkup(
      <SentenceCard
        from="en"
        to="pl"
        loading={false}
        error={null}
        knownBoth={1}
        knownOneWay={2}
        knownForwardOnly={1}
        knownReverseOnly={1}
        ready={1}
        unlockHint="Know at least one more verb or adjective both ways for this pair (3 more sentences needed)."
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Sentence quiz");
    expect(html).toContain("English–Polish");
    expect(html).toContain("1 known word for this pair");
    expect(html).toContain("2 words are known one way");
    expect(html).toContain("English→Polish only");
    expect(html).toContain("Polish→English only");
    expect(html).toContain("practice the other direction");
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
        knownBoth={8}
        knownOneWay={0}
        knownForwardOnly={0}
        knownReverseOnly={0}
        ready={12}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("12 sentences ready");
    expect(html).toContain("know both ways for this pair");
    expect(html).toContain("German–French");
  });
});
