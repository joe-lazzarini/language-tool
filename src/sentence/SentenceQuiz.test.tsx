/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markPairManual, recordAttempt, type WordStat } from "../accuracy/stats";
import type { Entry } from "../types";
import type { GrammarFile, SentencePack } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const grammar: GrammarFile = {
  version: 1,
  words: {
    "pl-alfabet": {
      pos: "noun",
      concept: "alphabet",
      sem: ["thing"],
      langs: {
        pl: { lemma: "alfabet", gender: "m" },
        en: { lemma: "alphabet", gender: "n" },
      },
    },
  },
};

const emptyPack: SentencePack = {
  frames: { vi: "{n} {v}.", vt: "{n} {v} {n}.", adj: "{n} {a}." },
};

vi.mock("./load", () => ({
  loadGrammar: async () => grammar,
  loadSentencePack: async () => emptyPack,
}));

import { SentenceQuiz } from "./SentenceQuiz";

function solid(now = 1): WordStat {
  return recordAttempt(recordAttempt(undefined, true, now), true, now + 1);
}

function entry(id: string, pl: string, en: string): Entry {
  return {
    id,
    pos: "noun",
    ranks: {},
    forms: {
      pl: { text: pl, accepted: [{ text: pl }] },
      en: { text: en, accepted: [{ text: en }] },
    },
    concept: id,
  };
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SentenceQuiz lobby pair-known UI", () => {
  it("shows one Known/Learning status and a single Mark known / Unmark control", async () => {
    const toggles: { from: string; to: string; id: string; manual: boolean }[] = [];
    const practiced = new Map<string, WordStat>([["pl-alfabet", solid()]]);
    const empty = new Map<string, WordStat>();
    const { container } = mount(
      <SentenceQuiz
        from="pl"
        to="en"
        studyEntries={[entry("pl-alfabet", "alfabet", "alphabet")]}
        revision={1}
        read={(from, to) => (from === "pl" && to === "en" ? practiced : empty)}
        onToggleManual={(from, to, id, manual) => {
          toggles.push({ from, to, id, manual });
        }}
        onExit={() => undefined}
      />,
    );

    await flush();

    const html = container.textContent ?? "";
    expect(html).toContain("Known");
    expect(html).not.toContain("this direction");
    expect(html).not.toContain("Mark known in");
    // Practice-known rows show status only — no redundant Mark known control.
    expect(container.querySelectorAll("button.sentence-known")).toHaveLength(0);
  });

  it("offers Unmark when the pair was marked manually", async () => {
    const marked = markPairManual(new Map(), new Map(), "pl-alfabet", true, 5);
    const { container } = mount(
      <SentenceQuiz
        from="en"
        to="pl"
        studyEntries={[entry("pl-alfabet", "alfabet", "alphabet")]}
        revision={1}
        read={(from, to) => (from === "en" && to === "pl" ? marked.forward : marked.reverse)}
        onToggleManual={() => undefined}
        onExit={() => undefined}
      />,
    );

    await flush();

    expect(container.textContent).toContain("Known");
    expect(container.querySelector("button.sentence-known")?.textContent).toBe("Unmark");
  });

  it("offers Mark known for a Learning custom word", async () => {
    const custom: Entry = {
      ...entry("custom-cat", "kot", "cat"),
      id: "custom-cat",
      custom: true,
      concept: "cat",
    };
    const { container } = mount(
      <SentenceQuiz
        from="en"
        to="pl"
        studyEntries={[custom]}
        revision={1}
        read={() => new Map()}
        onToggleManual={() => undefined}
        onExit={() => undefined}
      />,
    );

    await flush();

    // Custom words appear while Learning even with no practice history.
    expect(container.textContent).toContain("Learning");
    expect(container.querySelector("button.sentence-known")?.textContent).toBe("Mark known");
  });
});
