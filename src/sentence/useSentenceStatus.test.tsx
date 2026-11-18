/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordStat } from "../accuracy/stats";
import type { Entry, LangCode } from "../types";
import {
  resetSentenceStatusCacheForTests,
  useSentenceStatus,
  type SentenceStatus,
} from "./useSentenceStatus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./load", () => ({
  loadGrammar: vi.fn(async () => ({ version: 1, words: {} })),
  loadSentencePack: vi.fn(async () => ({
    frames: { vi: "{np} {v}", vt: "{np} {v} {np}", adj: "{np} {adj}" },
  })),
}));

vi.mock("./vocab", () => ({
  listGrammarCandidates: vi.fn(() => []),
  buildVocabIndex: vi.fn(() => ({
    nouns: [],
    verbs: [],
    adjectives: [],
    byId: new Map(),
    byPos: { noun: [], verb: [], adjective: [] },
  })),
}));

vi.mock("./generate", () => ({
  generateSentences: vi.fn(() => []),
  progressFromStats: vi.fn(() => ({ knownCount: 0, avgAccuracy: 0 })),
  unlockHint: vi.fn(() => "Learn more words first."),
}));

let active: { unmount: () => void } | null = null;

beforeEach(() => {
  vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
    const id = window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
    return id;
  });
  vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  active?.unmount();
  active = null;
  document.body.replaceChildren();
  resetSentenceStatusCacheForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function HookProbe({
  from,
  to,
  revision,
  read,
  entries,
  onStatus,
}: {
  from: LangCode;
  to: LangCode;
  revision: number;
  read: (from: LangCode, to: LangCode) => Map<string, WordStat>;
  entries: readonly Entry[];
  onStatus: (status: SentenceStatus) => void;
}) {
  const status = useSentenceStatus(from, to, revision, read, entries);
  onStatus(status);
  return null;
}

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  const mounted = {
    container,
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
  active = mounted;
  return mounted;
}

describe("useSentenceStatus cache", () => {
  it("does not recompute when swapping back to a cached direction", async () => {
    const { generateSentences } = await import("./generate");
    const { loadGrammar, loadSentencePack } = await import("./load");
    const read = (_from: LangCode, _to: LangCode) => new Map<string, WordStat>();
    const entries: Entry[] = [];
    let latest: SentenceStatus | undefined;

    const view = mount(
      <HookProbe
        from="en"
        to="pl"
        revision={0}
        read={read}
        entries={entries}
        onStatus={(status) => {
          latest = status;
        }}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(latest?.loading).toBe(false);
    expect(generateSentences).toHaveBeenCalledTimes(1);
    expect(loadGrammar).toHaveBeenCalled();
    expect(loadSentencePack).toHaveBeenCalled();

    await act(async () => {
      view.root.render(
        <HookProbe
          from="pl"
          to="en"
          revision={0}
          read={read}
          entries={entries}
          onStatus={(status) => {
            latest = status;
          }}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(generateSentences).toHaveBeenCalledTimes(2);

    await act(async () => {
      view.root.render(
        <HookProbe
          from="en"
          to="pl"
          revision={0}
          read={read}
          entries={entries}
          onStatus={(status) => {
            latest = status;
          }}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    // Swap back hits the in-memory status cache — no third generate.
    expect(generateSentences).toHaveBeenCalledTimes(2);
    expect(latest?.loading).toBe(false);
  });
});
