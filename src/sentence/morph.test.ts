import { describe, expect, it } from "vitest";
import {
  dePerfect,
  enPast,
  enPlural,
  finiteVerb,
  germanArticle,
  germanAttrAdj,
  plAttrAdj,
  plFuture,
  plGenitive,
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

  it("forms Polish past, future, locative, genitive, plural, attributive", () => {
    expect(plPast("spać", "m")).toBe("spał");
    expect(plPast("spać", "f")).toBe("spała");
    expect(plPast("spać", "n")).toBe("spało");
    expect(plPast("widzieć", "m")).toBe("widział");
    expect(plFuture("spać")).toBe("będzie spać");
    expect(plFuture("powiedzieć")).toBe("powie");
    expect(dePerfect("erreichen", "erreicht")).toBe("hat erreicht");
    expect(plLocative("dom", "m")).toBe("domu");
    expect(plGenitive("dom", "m")).toBe("domu");
    expect(plGenitive("książka", "f")).toBe("książki");
    expect(plGenitive("dziecko", "n")).toBe("dziecka");
    expect(plGenitive("kot", "m", true)).toBe("kota");
    expect(plPlural("pies", "m")).toBe("psy");
    expect(plAttrAdj({ lemma: "duży", m: "duży", f: "duża", n: "duże" }, "m", "nom")).toBe("duży");
    expect(plAttrAdj({ lemma: "duży", m: "duży", f: "duża", n: "duże" }, "f", "acc")).toBe("dużą");
  });

  it("forms Mandarin past from fin when lemma diverges", () => {
    expect(finiteVerb("zh", { lemma: "见", fin: "看" }, "past", "n")?.form).toBe("看了");
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
