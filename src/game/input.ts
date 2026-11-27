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

// Every click goes to `onClick`, which returns whether it captures the mouse.
export function trackMouse(element: HTMLElement, onClick: (event: MouseEvent) => boolean = () => true): void {
  element.addEventListener('click', (event) => {
    // Chrome refuses a new lock for about a second after Escape releases it; the next click retries.
    if (onClick(event)) element.requestPointerLock().catch(() => {});
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== element) return;
    mouseX += event.movementX;
    mouseY += event.movementY;
  });
}

// Does nothing where the page can't go fullscreen.
export function toggleFullscreen(element: HTMLElement): void {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else if (document.fullscreenEnabled) element.requestFullscreen?.().catch(() => {});
}

export function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

export function trackFullscreenKey(element: HTMLElement): void {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF') toggleFullscreen(element);
  });
}

// Calls onPress once per press; holding the key down doesn't repeat it.
export function trackKeyPress(code: string, onPress: () => void): void {
  window.addEventListener('keydown', (event) => {
    if (event.code === code && !event.repeat) onPress();
  });
}

// Returns the mouse movement in pixels since the last call, then resets it.
export function takeMouseMovement(): [number, number] {
  const movement: [number, number] = [mouseX, mouseY];
  mouseX = 0;
  mouseY = 0;
  return movement;
}
