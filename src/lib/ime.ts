/** True while an IME (e.g. Chinese Pinyin) is composing, including keyCode 229. */
export function isComposingKeyEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}): boolean {
  const native = event.nativeEvent;
  if (event.isComposing || event.keyCode === 229) return true;
  if (native && (native.isComposing || native.keyCode === 229)) return true;
  return false;
}

/** Enter/Space must not grade or advance while composition is active. */
export function shouldBlockGradeOrAdvance(composing: boolean): boolean {
  return composing;
}
