import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddWord } from "./AddWord";

describe("AddWord", () => {
  it("asks for one language and a lookup before saving", () => {
    const html = renderToStaticMarkup(
      <AddWord deck={[]} from="en" to="pl" onSave={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain("Add a word");
    expect(html).toContain("Look up");
    expect(html).toContain("English–Polish");
    expect(html).toContain("English");
    expect(html).toContain("Polish");
    expect(html).not.toContain("German");
    expect(html).not.toContain("Save card");
  });

  it("edits only the two languages stored on the card", () => {
    const html = renderToStaticMarkup(
      <AddWord
        deck={[]}
        from="pl"
        to="en"
        initial={{
          id: "custom-1",
          pos: "noun",
          pair: ["en", "pl"] as const,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          forms: {
            en: { text: "cat", accepted: [{ text: "cat" }] },
            pl: { text: "kot", accepted: [{ text: "kot", context: "masculine" }] },
            de: { text: "Katze", accepted: [{ text: "Katze" }] },
          },
        }}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("Edit word");
    expect(html).toContain("Polish");
    expect(html).toContain("English");
    expect(html).toContain("value=\"kot\"");
    expect(html).not.toContain("German");
    expect(html).not.toContain("Katze");
    expect(html).toContain("Save card");
  });
});
