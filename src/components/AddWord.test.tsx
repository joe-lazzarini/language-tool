/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AddWord, duplicateBannerText, lemmaReviewLabel } from "./AddWord";
import type { LookupDraft } from "../lib/translate";
import type { CustomWord } from "../lib/customWords";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

function setValue(input: HTMLInputElement, value: string) {
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

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

  it("shows the lemma review copy and a keep-original control after lookup", async () => {
    const draft: LookupDraft = {
      pos: "verb",
      notes: ['Saved as “iść” (from “idzie”)', "Found in the built-in deck."],
      lemma: { canonical: "iść", original: "idzie", source: "static" },
      forms: {
        pl: { text: "iść", accepted: [{ text: "iść" }] },
        en: { text: "go", accepted: [{ text: "go" }] },
      },
    };
    const { container } = mount(
      <AddWord
        deck={[]}
        from="pl"
        to="en"
        onSave={() => undefined}
        onCancel={() => undefined}
        lookup={async () => draft}
      />,
    );
    const input = container.querySelector("#lookup-word") as HTMLInputElement;
    const form = container.querySelector("form");
    await act(async () => {
      setValue(input, "idzie");
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain(lemmaReviewLabel(draft.lemma!));
    expect(container.textContent).toContain('Keep “idzie” instead');
    const keep = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Keep “idzie”"),
    );
    await act(async () => {
      keep?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain('Keeping “idzie” instead of “iść”');
    expect(container.textContent).not.toContain('Keep “idzie” instead');
  });

  it("blocks saving when the canonical form is already in My words", async () => {
    const existing: CustomWord = {
      id: "custom-1",
      pos: "noun",
      pair: ["en", "pl"],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      forms: {
        en: { text: "house", accepted: [{ text: "house" }] },
        pl: { text: "dom", accepted: [{ text: "dom" }] },
      },
    };
    const draft: LookupDraft = {
      pos: "noun",
      notes: ['Saved as “dom” (from “domu”)'],
      lemma: { canonical: "dom", original: "domu", source: "static" },
      forms: {
        pl: { text: "dom", accepted: [{ text: "dom" }] },
        en: { text: "house", accepted: [{ text: "house" }] },
      },
    };
    let saved = false;
    const { container } = mount(
      <AddWord
        deck={[]}
        from="pl"
        to="en"
        customWords={[existing]}
        onSave={() => {
          saved = true;
        }}
        onCancel={() => undefined}
        lookup={async () => draft}
      />,
    );
    const input = container.querySelector("#lookup-word") as HTMLInputElement;
    const form = container.querySelector("form");
    await act(async () => {
      setValue(input, "domu");
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      duplicateBannerText({ kind: "custom", id: "custom-1", display: "dom", lang: "pl", word: existing }),
    );
    const save = [...container.querySelectorAll("button")].find((item) => item.textContent === "Save card");
    expect(save?.disabled).toBe(true);
    await act(async () => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(saved).toBe(false);
  });
});
