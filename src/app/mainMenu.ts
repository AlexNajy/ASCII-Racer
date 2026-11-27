import type { RaceMode } from './gameState.ts';

// Screens an entry can open instead of a race.
export type MenuScreen = 'garage' | 'settings';
export const MENU_SCREENS: readonly MenuScreen[] = ['garage', 'settings'];

// The main menu's entries in the spec's order. `opens` is the race or screen an entry leads to; null means not
// built yet, shown dimmed, and Enter on it does nothing. Enabling an entry is changing its row.
export interface MenuEntry {
  label: string;
  opens: RaceMode | MenuScreen | null;
}

export const MENU_ENTRIES: readonly MenuEntry[] = [
  { label: 'daily', opens: null },
  { label: 'unlimited', opens: 'unlimited' },
  { label: 'join lobby', opens: null },
  { label: 'create lobby', opens: null },
  { label: 'garage', opens: 'garage' },
  { label: 'settings', opens: 'settings' },
];

export function isMenuScreen(opens: RaceMode | MenuScreen): opens is MenuScreen {
  return (MENU_SCREENS as readonly string[]).includes(opens);
}

export function entryEnabled(index: number): boolean {
  return MENU_ENTRIES[index]?.opens != null;
}

// The entry that opens a screen, selected again when that screen is left.
export function screenEntry(screen: MenuScreen): number {
  return MENU_ENTRIES.findIndex((entry) => entry.opens === screen);
}

// The selection starts on the first entry that does something.
export const FIRST_ENTRY = Math.max(0, MENU_ENTRIES.findIndex((entry) => entry.opens !== null));

// Up and down wrap round the list; dimmed entries can be selected, they just do nothing.
export function wrapEntry(index: number): number {
  const count = MENU_ENTRIES.length;
  return ((index % count) + count) % count;
}
