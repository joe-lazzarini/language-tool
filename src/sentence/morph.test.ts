import { describe, expect, it } from "vitest";
import {
  dePerfect,
  enPast,
  enPlural,
  germanArticle,
  germanAttrAdj,
  plAttrAdj,
  plFuture,
  plLocative,
  plPast,
  plPlural,
} from "./morph";

describe("morphology helpers", () => {
  it("forms English plurals and past tense", () => {
    expect(enPlural("cat")).toBe("cats");
    expect(enPlural("child")).toBe("children");
    expect(enPast("sleep")).toBe("slept");
    expect(enPast("work")).toBe("worked");
  });

  it("forms Polish past, future, locative, plural, attributive", () => {
    expect(plPast("spać", "m")).toBe("spał");
    expect(plPast("spać", "f")).toBe("spała");
    expect(plFuture("spać")).toBe("będzie spać");
    expect(plLocative("dom", "m")).toBe("domu");
    expect(plPlural("pies", "m")).toBe("psy");
    expect(plAttrAdj({ lemma: "duży", m: "duży", f: "duża", n: "duże" }, "m", "nom")).toBe("duży");
    expect(plAttrAdj({ lemma: "duży", m: "duży", f: "duża", n: "duże" }, "f", "acc")).toBe("dużą");
  });

  it("forms German articles, attributive endings, and perfect", () => {
    expect(germanArticle("m", "acc")).toBe("den");
    expect(germanArticle("f", "nom")).toBe("die");
    expect(germanAttrAdj("groß", "m", "nom")).toBe("große");
    expect(germanAttrAdj("groß", "m", "acc")).toBe("großen");
    expect(dePerfect("sehen", "sieht")).toBe("hat gesehen");
    expect(dePerfect("gehen", "geht")).toBe("ist gegangen");
  });
});
