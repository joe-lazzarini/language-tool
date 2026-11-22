/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Session } from "../App";
import { keyTargetKind } from "../lib/advanceKey";
import type { Entry, Mode } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function entry(id: string, en: string, pl: string): Entry {
  return {
    id,
    pos: "noun",
    ranks: { en: 1 },
    forms: {
      en: { text: en, accepted: [{ text: en }] },
      pl: { text: pl, accepted: [{ text: pl }] },
    },
  };
}

const words = [entry("cat", "cat", "kot"), entry("dog", "dog", "pies"), entry("bird", "bird", "ptak")];

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

function session(mode: Mode, deck: Entry[] = words) {
  return mount(<Session words={deck} mode={mode} from="en" to="pl" onExit={() => undefined} />);
}

function prompt(container: HTMLElement) {
  return container.querySelector(".prompt")?.textContent;
}

function answerInput(container: HTMLElement) {
  const input = container.querySelector("#answer");
  if (!(input instanceof HTMLInputElement)) throw new Error("missing answer input");
  return input;
}

function buttonNamed(container: HTMLElement, name: string) {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing button ${name}`);
  return found;
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

function setValue(input: HTMLInputElement, value: string) {
  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.setSelectionRange(value.length, value.length);
  });
}

/**
 * jsdom does not insert characters or implicitly submit forms. This mirrors
 * those default actions when the keydown event is not cancelled.
 */
function pressKey(
  key: string,
  {
    repeat = false,
    target = document.activeElement,
    ctrlKey = false,
    altKey = false,
    metaKey = false,
  }: {
    repeat?: boolean;
    target?: EventTarget | null;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  } = {},
) {
  const node = target instanceof Element ? target : document.body;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    repeat,
    ctrlKey,
    altKey,
    metaKey,
  });
  act(() => {
    node.dispatchEvent(event);
    if (event.defaultPrevented || !(node instanceof HTMLInputElement) || node.disabled || node.readOnly) return;
    if (key === " " || key === "Spacebar") {
      const start = node.selectionStart ?? node.value.length;
      const end = node.selectionEnd ?? node.value.length;
      valueSetter?.call(node, node.value.slice(0, start) + " " + node.value.slice(end));
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (key === "Enter" && node.form) {
      node.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });
  return event;
}

function releaseKey(key: string, target: EventTarget | null = document.activeElement) {
  const node = target instanceof Element ? target : document.body;
  act(() => {
    node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  });
}

describe("keyTargetKind", () => {
  it("leaves text fields alone and treats buttons as activation", () => {
    const input = document.createElement("input");
    const disabled = document.createElement("input");
    disabled.disabled = true;
    const area = document.createElement("textarea");
    const button = document.createElement("button");
    const span = document.createElement("span");
    button.append(span);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(keyTargetKind(input)).toBe("typing");
    expect(keyTargetKind(disabled)).toBe("none");
    expect(keyTargetKind(area)).toBe("typing");
    expect(keyTargetKind(button)).toBe("activation");
    expect(keyTargetKind(span)).toBe("activation");
    expect(keyTargetKind(editable)).toBe("typing");
    expect(keyTargetKind(document.body)).toBe("none");
  });
});

describe("Session advance shortcut", () => {
  function confirmRetype(container: HTMLElement, answer: string) {
    releaseKey("Enter");
    releaseKey(" ");
    const input = answerInput(container);
    expect(input.disabled).toBe(false);
    expect(container.querySelector(".retype-hint")).toBeTruthy();
    setValue(input, answer);
    pressKey("Enter", { target: input });
    releaseKey("Enter");
    expect(container.querySelector(".advance-hint")?.textContent).toBe("Press Enter or Space");
    expect(answerInput(container).disabled).toBe(true);
  }

  it("types Space and submits with Enter until the answer is shown", () => {
    const { container } = session("quiz");
    const input = answerInput(container);
    expect(container.textContent).not.toContain("Press Enter or Space");

    setValue(input, "ko");
    const space = pressKey(" ");
    expect(space.defaultPrevented).toBe(false);
    expect(input.value).toBe("ko ");
    expect(prompt(container)).toBe("cat");
    expect(container.querySelector(".feedback")).toBeNull();

    setValue(input, "kot");
    const submit = pressKey("Enter");
    expect(submit.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("cat");
    expect(container.querySelector(".ok-text")?.textContent).toBe("Correct");
    expect(container.querySelector(".next-row")?.textContent).toContain("Next");
    expect(container.querySelector(".advance-hint")?.textContent).toBe("Press Enter or Space");

    const repeat = pressKey("Enter", { repeat: true });
    expect(repeat.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("cat");

    const samePress = pressKey("Enter");
    expect(samePress.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("cat");

    releaseKey("Enter");
    pressKey("Enter");
    expect(prompt(container)).toBe("dog");
    expect(container.querySelector(".feedback")).toBeNull();
    expect(container.textContent).not.toContain("Press Enter or Space");
  });

  it("moves one card on Space after a correct answer and ignores the repeating Space", () => {
    const { container } = session("quiz", words.slice(0, 2));
    setValue(answerInput(container), "kot");
    pressKey("Enter", { target: answerInput(container) });
    releaseKey("Enter");
    expect(container.querySelector(".ok-text")?.textContent).toBe("Correct");
    expect(answerInput(container).disabled).toBe(true);

    pressKey(" ");
    expect(prompt(container)).toBe("dog");
    const nextInput = answerInput(container);
    expect(nextInput.value).toBe("");
    expect(nextInput.disabled).toBe(false);

    const repeat = pressKey(" ", { repeat: true, target: nextInput });
    expect(repeat.defaultPrevented).toBe(true);
    expect(nextInput.value).toBe("");
    expect(prompt(container)).toBe("dog");

    releaseKey(" ");
    setValue(nextInput, "pie");
    const typed = pressKey(" ", { target: nextInput });
    expect(typed.defaultPrevented).toBe(false);
    expect(nextInput.value).toBe("pie ");
    expect(prompt(container)).toBe("dog");
  });

  it.each([
    ["study", "Reveal", "kot"],
    ["quiz", "Skip", "kot"],
  ] as const)("requires a matching retype in %s before advance shortcuts work", (mode, reveal, answer) => {
    const { container } = session(mode);
    act(() => {
      buttonNamed(container, reveal).click();
    });
    expect(container.querySelector(".retype-hint")).toBeTruthy();
    expect(container.querySelector(".advance-hint")).toBeNull();
    pressKey(" ");
    expect(prompt(container)).toBe("cat");
    releaseKey(" ");
    confirmRetype(container, answer);
    pressKey(" ");
    releaseKey(" ");
    expect(prompt(container)).toBe("dog");
    act(() => {
      buttonNamed(container, reveal).click();
    });
    confirmRetype(container, "pies");
    pressKey("Enter");
    releaseKey("Enter");
    expect(prompt(container)).toBe("bird");
  });

  it("does not take keys from another text field or double-activate buttons", () => {
    const { container } = session("quiz");
    setValue(answerInput(container), "kot");
    act(() => {
      buttonNamed(container, "Check").click();
    });
    expect(prompt(container)).toBe("cat");

    const other = document.createElement("input");
    other.setAttribute("aria-label", "Add a word");
    document.body.appendChild(other);
    other.focus();
    const space = pressKey(" ", { target: other });
    const enter = pressKey("Enter", { target: other });
    expect(space.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(false);
    expect(other.value).toBe(" ");
    expect(prompt(container)).toBe("cat");

    const area = document.createElement("textarea");
    document.body.appendChild(area);
    area.focus();
    pressKey("Enter", { target: area });
    pressKey(" ", { target: area });
    expect(prompt(container)).toBe("cat");

    const exit = buttonNamed(container, "Exit");
    exit.focus();
    const exitKey = pressKey("Enter", { target: exit });
    expect(exitKey.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("cat");
    releaseKey("Enter", exit);

    const next = buttonNamed(container, "Next");
    next.focus();
    const nextKey = pressKey("Enter", { target: next });
    expect(nextKey.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("cat");
    releaseKey("Enter", next);
    act(() => {
      if (!nextKey.defaultPrevented) next.click();
    });
    expect(prompt(container)).toBe("dog");

    act(() => {
      buttonNamed(container, "Skip").click();
    });
    confirmRetype(container, "pies");
    const finish = buttonNamed(container, "Next");
    finish.focus();
    const spaceOnButton = pressKey(" ", { target: finish });
    expect(spaceOnButton.defaultPrevented).toBe(false);
    expect(prompt(container)).toBe("dog");
    releaseKey(" ", finish);
    act(() => {
      if (!spaceOnButton.defaultPrevented) finish.click();
    });
    expect(prompt(container)).toBe("bird");
  });

  it("finishes the round from the keyboard and ignores modified Enter", () => {
    const { container } = session("study", [words[0]]);
    act(() => {
      buttonNamed(container, "Reveal").click();
    });
    confirmRetype(container, "kot");
    expect(buttonNamed(container, "Finish").parentElement?.textContent).toContain("Press Enter or Space");
    const modified = pressKey("Enter", { ctrlKey: true });
    expect(modified.defaultPrevented).toBe(false);
    expect(container.textContent).not.toContain("Study complete");
    pressKey("Enter");
    expect(container.textContent).toContain("Study complete");
    pressKey(" ");
    expect(container.textContent).toContain("Study complete");
  });

  it("does not let Space skip a miss before the retype is confirmed", () => {
    const { container } = session("study");
    const input = answerInput(container);
    setValue(input, "kot");
    pressKey(" ", { target: input });
    expect(input.value).toBe("kot ");
    act(() => {
      buttonNamed(container, "Reveal").click();
    });
    expect(prompt(container)).toBe("cat");
    expect(answerInput(container).disabled).toBe(false);
    pressKey(" ", { repeat: true });
    pressKey(" ");
    expect(prompt(container)).toBe("cat");
    releaseKey(" ");
    pressKey(" ");
    expect(prompt(container)).toBe("cat");
    releaseKey(" ");
    confirmRetype(container, "kot");
    pressKey(" ");
    releaseKey(" ");
    expect(prompt(container)).toBe("dog");
  });

  it("counts a wrong typed quiz answer once and advances only after a matching retype", () => {
    const graded: { id: string; correct: boolean }[] = [];
    const { container } = mount(
      <Session
        words={words.slice(0, 2)}
        mode="quiz"
        from="en"
        to="pl"
        onExit={() => undefined}
        onGraded={(id, correct) => graded.push({ id, correct })}
      />,
    );
    const input = answerInput(container);
    setValue(input, "nope");
    pressKey("Enter", { target: input });
    expect(container.querySelector(".bad-text")?.textContent).toBe("Incorrect");
    expect(container.textContent).toContain("0 correct");
    expect(graded).toEqual([{ id: "cat", correct: false }]);
    pressKey("Enter", { repeat: true });
    expect(prompt(container)).toBe("cat");
    releaseKey("Enter");
    pressKey(" ");
    expect(prompt(container)).toBe("cat");
    releaseKey(" ");
    setValue(answerInput(container), "wrong");
    pressKey("Enter", { target: answerInput(container) });
    expect(container.querySelector(".retype-feedback")?.textContent).toContain("Not quite");
    expect(graded).toEqual([{ id: "cat", correct: false }]);
    confirmRetype(container, "kot");
    pressKey(" ");
    releaseKey(" ");
    expect(prompt(container)).toBe("dog");
    expect(container.textContent).toContain("0 correct");
    expect(graded).toEqual([{ id: "cat", correct: false }]);
  });

  it("refocuses the answer field after a failed Confirm tap", async () => {
    const { container } = session("quiz", words.slice(0, 2));
    act(() => {
      buttonNamed(container, "Skip").click();
    });
    expect(document.activeElement).toBe(answerInput(container));
    setValue(answerInput(container), "wrong");
    act(() => {
      buttonNamed(container, "Confirm").click();
    });
    expect(container.querySelector(".retype-feedback")?.textContent).toContain("Not quite");
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    expect(document.activeElement).toBe(answerInput(container));
  });

  it("accepts any matching form when confirming a study reveal retype", () => {
    const multi: Entry = {
      id: "this",
      pos: "pronoun",
      ranks: { en: 1 },
      forms: {
        en: { text: "this", accepted: [{ text: "this" }] },
        pl: {
          text: "ten",
          accepted: [
            { text: "ten", context: "masculine" },
            { text: "ta", context: "feminine" },
            { text: "to", context: "neuter" },
          ],
        },
      },
    };
    const { container } = session("study", [multi, words[1]]);
    act(() => {
      buttonNamed(container, "Reveal").click();
    });
    expect(container.textContent).toContain("masculine");
    expect(container.textContent).toContain("feminine");
    confirmRetype(container, "ta");
    pressKey(" ");
    expect(prompt(container)).toBe("dog");
  });

  describe("missed words summary", () => {
    function missLabels(container: HTMLElement) {
      return [...container.querySelectorAll(".misses li")].map((item) => ({
        answer: item.querySelector("strong")?.textContent ?? "",
        prompt: item.querySelector("span")?.textContent ?? "",
        given: item.querySelector("em")?.textContent ?? "",
      }));
    }

    function revealRetypeAndAdvance(container: HTMLElement, mode: Mode, answer: string) {
      act(() => {
        buttonNamed(container, mode === "quiz" ? "Skip" : "Reveal").click();
      });
      releaseKey("Enter");
      releaseKey(" ");
      confirmRetype(container, answer);
      pressKey(" ");
      releaseKey(" ");
    }

    it("lists every study reveal as missed, including the last card via rapid Space", () => {
      const { container } = session("study");
      revealRetypeAndAdvance(container, "study", "kot");
      expect(prompt(container)).toBe("dog");
      revealRetypeAndAdvance(container, "study", "pies");
      expect(prompt(container)).toBe("bird");
      act(() => {
        buttonNamed(container, "Reveal").click();
      });
      confirmRetype(container, "ptak");
      releaseKey(" ");
      pressKey(" ");
      expect(container.textContent).toContain("Study complete");
      expect(container.textContent).toContain("Missed (3)");
      expect(missLabels(container)).toEqual([
        { answer: "kot", prompt: "cat", given: "skipped" },
        { answer: "pies", prompt: "dog", given: "skipped" },
        { answer: "ptak", prompt: "bird", given: "skipped" },
      ]);
    });

    it("keeps wrong typed answers and quiz skips on the summary after rapid Enter", () => {
      const graded: { id: string; correct: boolean }[] = [];
      const { container } = mount(
        <Session
          words={words}
          mode="quiz"
          from="en"
          to="pl"
          onExit={() => undefined}
          onGraded={(id, correct) => graded.push({ id, correct })}
        />,
      );

      setValue(answerInput(container), "nope");
      pressKey("Enter", { target: answerInput(container) });
      releaseKey("Enter");
      confirmRetype(container, "kot");
      pressKey("Enter");
      releaseKey("Enter");

      act(() => {
        buttonNamed(container, "Skip").click();
      });
      confirmRetype(container, "pies");
      pressKey("Enter");
      releaseKey("Enter");

      setValue(answerInput(container), "zzz");
      pressKey("Enter", { target: answerInput(container) });
      releaseKey("Enter");
      confirmRetype(container, "ptak");
      pressKey("Enter");
      releaseKey("Enter");

      expect(container.textContent).toContain("Quiz complete");
      expect(container.textContent).toContain("0 / 3");
      expect(container.textContent).toContain("Missed (3)");
      expect(missLabels(container).map((item) => item.answer)).toEqual(["kot", "pies", "ptak"]);
      expect(graded).toEqual([
        { id: "cat", correct: false },
        { id: "dog", correct: false },
        { id: "bird", correct: false },
      ]);
    });

    it("keeps an earlier miss when the same id is later answered correctly", () => {
      const dup = [entry("same", "one", "jeden"), entry("same", "two", "dwa")];
      const { container } = session("quiz", dup);
      setValue(answerInput(container), "nope");
      pressKey("Enter", { target: answerInput(container) });
      releaseKey("Enter");
      confirmRetype(container, "jeden");
      pressKey(" ");
      releaseKey(" ");
      setValue(answerInput(container), "dwa");
      pressKey("Enter", { target: answerInput(container) });
      releaseKey("Enter");
      pressKey(" ");
      expect(container.textContent).toContain("1 / 2");
      expect(container.textContent).toContain("Missed (1)");
      expect(missLabels(container)).toEqual([{ answer: "jeden", prompt: "one", given: "you: nope" }]);
    });

    it("shows the summary with graded misses when exiting early during retype", () => {
      const { container } = session("study", words);
      act(() => {
        buttonNamed(container, "Reveal").click();
      });
      expect(container.querySelector(".retype-hint")).toBeTruthy();
      act(() => {
        buttonNamed(container, "Exit").click();
      });
      expect(container.textContent).toContain("Study complete");
      expect(container.textContent).toContain("Missed (1)");
      expect(missLabels(container)[0]?.answer).toBe("kot");
    });
  });

  it("does not grade or advance while a Chinese IME is composing", async () => {
    const { container } = session("quiz");
    const input = answerInput(container);
    setValue(input, "ni");
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    const composingEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      // jsdom KeyboardEventInit typing omits keyCode; IMEs still set 229.
      ...({ keyCode: 229 } as object),
    });
    Object.defineProperty(composingEnter, "isComposing", { value: true });
    act(() => {
      input.dispatchEvent(composingEnter);
      if (!composingEnter.defaultPrevented && input.form) {
        input.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });
    expect(prompt(container)).toBe("cat");
    expect(container.querySelector(".feedback")).toBeNull();

    const composingSpace = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
      ...({ keyCode: 229 } as object),
    });
    Object.defineProperty(composingSpace, "isComposing", { value: true });
    act(() => {
      input.dispatchEvent(composingSpace);
    });
    expect(prompt(container)).toBe("cat");
    expect(container.querySelector(".feedback")).toBeNull();

    await act(async () => {
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你" }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    setValue(input, "kot");
    pressKey("Enter", { target: input });
    expect(container.querySelector(".ok-text")?.textContent).toBe("Correct");
  });
});
