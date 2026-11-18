/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AddWord } from "./AddWord";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let active: { unmount: () => void } | null = null;

afterEach(() => {
  active?.unmount();
  active = null;
  document.body.replaceChildren();
});

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  const mounted = {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
  active = mounted;
  return mounted;
}

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

  it("offers Quiz my words right after saving", async () => {
    let quizId: string | null = null;
    const { container } = mount(
      <AddWord
        deck={[]}
        from="en"
        to="pl"
        initial={{
          id: "custom-1",
          pos: "noun",
          pair: ["en", "pl"],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          forms: {
            en: { text: "cat", accepted: [{ text: "cat" }] },
            pl: { text: "kot", accepted: [{ text: "kot" }] },
          },
        }}
        onSave={() => undefined}
        onCancel={() => undefined}
        onQuizMyWords={(word) => {
          quizId = word.id;
        }}
      />,
    );
    const save = [...container.querySelectorAll("button")].find((item) => item.textContent === "Save card");
    expect(save).toBeTruthy();
    await act(async () => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Word saved");
    const quiz = [...container.querySelectorAll("button")].find((item) => item.textContent === "Quiz my words");
    expect(quiz).toBeTruthy();
    act(() => {
      quiz?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(quizId).toBe("custom-1");
  });
});
