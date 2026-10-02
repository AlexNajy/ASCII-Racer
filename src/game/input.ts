const heldKeys = new Set<string>();

export function trackKeyboard(): void {
  window.addEventListener('keydown', (event) => heldKeys.add(event.code));
  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  // The browser sends no keyup for keys released while the tab is unfocused.
  window.addEventListener('blur', () => heldKeys.clear());
}

export function isKeyDown(code: string): boolean {
  return heldKeys.has(code);
}
