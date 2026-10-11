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

let mouseX = 0;
let mouseY = 0;

export function trackMouse(element: HTMLElement): void {
  element.addEventListener('click', () => {
    // Chrome refuses a new lock for about a second after Escape releases it; the next click retries.
    element.requestPointerLock().catch(() => {});
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== element) return;
    mouseX += event.movementX;
    mouseY += event.movementY;
  });
}

export function trackFullscreenKey(element: HTMLElement): void {
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyF') return;
    if (document.fullscreenElement) document.exitFullscreen();
    else element.requestFullscreen().catch(() => {});
  });
}

// Returns the mouse movement in pixels since the last call, then resets it.
export function takeMouseMovement(): [number, number] {
  const movement: [number, number] = [mouseX, mouseY];
  mouseX = 0;
  mouseY = 0;
  return movement;
}
