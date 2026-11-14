/**
 * Enter or Space moves to the next card only while the answer is on screen.
 *
 * The press that revealed the answer (Enter to check, or a Space still held
 * from typing) is remembered until keyup, so that press and its key-repeat
 * cannot skip the result. A press that does advance cancels its own repeats,
 * so they cannot type into or submit the next card.
 */

export type AdvanceKeyHold = {
  /** Repeats must not type or activate a control on the card just opened. */
  preventRepeat: boolean;
};

export type AdvanceKeyInput = {
  key: string;
  repeat: boolean;
  revealed: boolean;
  held: AdvanceKeyHold | undefined;
  composing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  typingTarget: boolean;
  activationTarget: boolean;
};

export type AdvanceKeyDecision =
  | { type: "ignore" }
  | { type: "remember"; preventRepeat: boolean; preventDefault: boolean }
  | { type: "advance" };

export function isAdvanceKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/** Space and the legacy "Spacebar" key value share one hold. */
export function advanceKeyId(key: string): string {
  return key === "Spacebar" ? " " : key;
}

export function decideAdvanceKey(input: AdvanceKeyInput): AdvanceKeyDecision {
  if (input.altKey || input.ctrlKey || input.metaKey) return { type: "ignore" };
  if (!isAdvanceKey(input.key)) return { type: "ignore" };

  if (input.held?.preventRepeat) {
    return { type: "remember", preventRepeat: true, preventDefault: true };
  }

  // Chinese / Japanese IME: Enter and Space select a candidate. Do not grade or
  // advance while composing (isComposing or keyCode 229).
  if (input.composing) {
    if (!input.repeat && !input.held) {
      return { type: "remember", preventRepeat: false, preventDefault: false };
    }
    return { type: "ignore" };
  }

  if (input.typingTarget) {
    if (!input.revealed && !input.repeat && !input.held) {
      return { type: "remember", preventRepeat: false, preventDefault: false };
    }
    return { type: "ignore" };
  }

  if (!input.revealed) {
    if (input.repeat || input.held) return { type: "ignore" };
    return { type: "remember", preventRepeat: false, preventDefault: false };
  }

  if (input.repeat || input.held) return { type: "ignore" };

  // Buttons and links already activate on Enter/Space. Don't advance twice.
  if (input.activationTarget) {
    return { type: "remember", preventRepeat: true, preventDefault: false };
  }

  return { type: "advance" };
}

export function applyAdvanceKey(
  heldKeys: Map<string, AdvanceKeyHold>,
  input: Omit<AdvanceKeyInput, "held">,
): { preventDefault: boolean; advance: boolean } {
  const decision = decideAdvanceKey({ ...input, held: heldKeys.get(advanceKeyId(input.key)) });
  if (decision.type === "remember") {
    heldKeys.set(advanceKeyId(input.key), { preventRepeat: decision.preventRepeat });
    return { preventDefault: decision.preventDefault, advance: false };
  }
  if (decision.type === "advance") {
    heldKeys.set(advanceKeyId(input.key), { preventRepeat: true });
    return { preventDefault: true, advance: true };
  }
  return { preventDefault: false, advance: false };
}

export function releaseAdvanceKey(heldKeys: Map<string, AdvanceKeyHold>, key: string) {
  heldKeys.delete(advanceKeyId(key));
}

const BUTTON_INPUTS = new Set(["button", "submit", "reset"]);

/** Where the key landed. Disabled fields cannot take the character, so they are free. */
function isEditableElement(node: HTMLElement): boolean {
  if (node.isContentEditable) return true;
  const attr = node.getAttribute("contenteditable");
  if (attr != null && attr.toLowerCase() !== "false") return true;
  return node.contentEditable === "true" || node.contentEditable === "plaintext-only";
}

function isEditable(target: Element): boolean {
  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLElement && isEditableElement(node)) return true;
    node = node.parentElement;
  }
  return false;
}

export function keyTargetKind(target: EventTarget | null): "typing" | "activation" | "none" {
  if (typeof Element === "undefined" || !(target instanceof Element)) return "none";
  if (isEditable(target)) return "typing";

  const field = target.closest("input, textarea, select, button, a");
  if (field instanceof HTMLButtonElement || field instanceof HTMLAnchorElement) {
    return field instanceof HTMLButtonElement && field.disabled ? "none" : "activation";
  }
  if (field instanceof HTMLInputElement && BUTTON_INPUTS.has(field.type)) {
    return field.disabled ? "none" : "activation";
  }
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    return field.disabled ? "none" : "typing";
  }
  return "none";
}
