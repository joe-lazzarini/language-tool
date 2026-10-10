import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddWord } from "./AddWord";

describe("AddWord", () => {
  it("asks for one language and a lookup before saving", () => {
    const html = renderToStaticMarkup(
      <AddWord deck={[]} onSave={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain("Add a word");
    expect(html).toContain("Look up");
    expect(html).toContain("English");
    expect(html).toContain("Polish");
    expect(html).toContain("German");
    expect(html).not.toContain("Save card");
  });
});
