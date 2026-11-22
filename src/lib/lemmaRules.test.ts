import { describe, expect, it } from "vitest";
import { lemmaCandidates } from "./lemmaRules";

describe("lemmaCandidates", () => {
  it("proposes Polish verb and noun candidates without accepting them", () => {
    expect(lemmaCandidates("pl", "powtarzam")).toContain("powtarzać");
    expect(lemmaCandidates("pl", "robię")).toContain("robić");
    expect(lemmaCandidates("pl", "czytasz")).toContain("czytać");
    expect(lemmaCandidates("pl", "humoru")).toContain("humor");
    expect(lemmaCandidates("pl", "kobiety")).toContain("kobieta");
  });

  it("proposes English / German / Romance / Russian candidates", () => {
    expect(lemmaCandidates("en", "went")).toContain("go");
    expect(lemmaCandidates("en", "children")).toContain("child");
    expect(lemmaCandidates("de", "ging")).toContain("gehen");
    expect(lemmaCandidates("de", "kleinen")).toContain("klein");
    expect(lemmaCandidates("es", "hablas")).toContain("hablar");
    expect(lemmaCandidates("fr", "parle")).toContain("parler");
    expect(lemmaCandidates("it", "parlo")).toContain("parlare");
    expect(lemmaCandidates("ru", "домами")).toContain("дом");
    expect(lemmaCandidates("ru", "говорит")).toContain("говорить");
  });

  it("keeps Chinese and Japanese as identity (no rule candidates)", () => {
    expect(lemmaCandidates("zh", "们")).toEqual([]);
    expect(lemmaCandidates("ja", "行った")).toEqual([]);
    expect(lemmaCandidates("zh", "重复")).toEqual([]);
  });
});
