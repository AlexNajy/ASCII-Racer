// The player's controls as the settings screen lists them; README's Controls lists the same (the dev tools are extra there).
export interface KeyBinding {
  keys: string;
  action: string;
}

export const KEY_LIST: readonly KeyBinding[] = [
  { keys: 'W / Up', action: 'throttle' },
  { keys: 'S / Down', action: 'brake, reverse' },
  { keys: 'A D / Left Right', action: 'steer' },
  { keys: 'Space', action: 'drift' },
  { keys: 'H', action: 'headlights' },
  { keys: 'F', action: 'fullscreen' },
  { keys: 'Up Down / W S', action: 'choose in menus' },
  { keys: 'Left Right / A D', action: 'change a setting' },
  { keys: 'Enter', action: 'pick' },
  { keys: 'Click', action: 'capture the mouse' },
  { keys: 'Mouse', action: 'look around' },
  { keys: 'Esc', action: 'back to the menu' },
];
