/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Home } from "../App";
import type { Settings } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseSettings: Settings = {
  mode: "quiz",
  from: "en",
  to: "pl",
  range: "top100",
  size: 10,
  focus: "all",
};

const sentence = {
  loading: false,
  error: null,
  knownBoth: 0,
  knownOneWay: 0,
  knownForwardOnly: 0,
  knownReverseOnly: 0,
  ready: 0,
  unlockHint: "Learn more words first.",
};

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

function renderHome(overrides: Partial<Parameters<typeof Home>[0]> = {}) {
  return mount(
    <Home
      settings={baseSettings}
      setSettings={() => undefined}
      pairCount={100}
      pool={100}
      customCount={0}
      otherPairs={[]}
      weakInBand={0}
      sentence={sentence}
      onStart={() => undefined}
      onAdd={() => undefined}
      onList={() => undefined}
      onSentence={() => undefined}
      {...overrides}
    />,
  );
}

describe("Home practice source", () => {
  it("puts My words in Which words and labels the start button", () => {
    const { container } = renderHome({ customCount: 12, pool: 100 });
    const chips = [...container.querySelectorAll(".chips .chip")].map((item) => item.textContent);
    expect(chips[0]).toBe("My words (12)");
    expect(chips).toContain("First 100");
    expect(container.querySelector(".chips .chip-mine")?.textContent).toBe("My words (12)");
    expect(container.querySelector(".mine-select")).toBeNull();
    expect(container.querySelector(".primary")?.textContent).toBe("Start quiz · First 100");
  });

  it("shows an empty state for My words with a pair note and Add a word", () => {
    const { container } = renderHome({
      settings: { ...baseSettings, range: "mine" },
      customCount: 0,
      pool: 0,
      otherPairs: [],
    });
    expect(container.querySelector(".mine-empty")?.textContent).toContain("No words for English–Polish yet");
    expect(container.querySelector(".mine-empty")?.textContent).toContain("per language pair");
    expect(container.querySelector(".primary")).toBeNull();
    const add = [...container.querySelectorAll("button")].find((item) => item.textContent === "Add a word");
    expect(add).toBeTruthy();
  });

  it("offers other pairs when My words is empty for the current pair", () => {
    const switches: string[] = [];
    const { container } = renderHome({
      settings: { ...baseSettings, range: "mine" },
      customCount: 0,
      pool: 0,
      otherPairs: [{ pair: ["de", "en"], count: 3, label: "German–English" }],
      setSettings: (next) => {
        switches.push(`${next.from}-${next.to}-${next.range}`);
      },
    });
    expect(container.textContent).toContain("Saved on other pairs");
    const chip = [...container.querySelectorAll(".mine-empty .chip")].find((item) =>
      item.textContent?.includes("German–English"),
    );
    expect(chip).toBeTruthy();
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(switches[0]).toBe("en-de-mine");
  });

  it("keeps Weak words focus while My words is selected", () => {
    const { container } = renderHome({
      settings: { ...baseSettings, range: "mine", focus: "weak", mode: "study" },
      customCount: 4,
      pool: 4,
      weakInBand: 2,
    });
    expect(container.querySelector(".primary")?.textContent).toBe("Start study · My words (4)");
    const focusOn = [...container.querySelectorAll(".segment button.on")].map((item) => item.textContent);
    expect(focusOn).toContain("Weak words");
  });
});
