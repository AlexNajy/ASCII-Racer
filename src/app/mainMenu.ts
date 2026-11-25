import type { RaceMode } from './gameState.ts';

// The main menu's entries in the spec's order. `mode` is the race an entry opens; null means not built yet, shown
// dimmed, and Enter on it does nothing. Enabling an entry is changing its row.
export interface MenuEntry {
  label: string;
  mode: RaceMode | null;
}

export const MENU_ENTRIES: readonly MenuEntry[] = [
  { label: 'daily', mode: null },
  { label: 'unlimited', mode: 'unlimited' },
  { label: 'join lobby', mode: null },
  { label: 'create lobby', mode: null },
  { label: 'garage', mode: null },
  { label: 'settings', mode: null },
];

export function entryEnabled(index: number): boolean {
  return MENU_ENTRIES[index]?.mode != null;
}

// The selection starts on the first entry that does something.
export const FIRST_ENTRY = Math.max(0, MENU_ENTRIES.findIndex((entry) => entry.mode !== null));

// Up and down wrap round the list; dimmed entries can be selected, they just do nothing.
export function wrapEntry(index: number): number {
  const count = MENU_ENTRIES.length;
  return ((index % count) + count) % count;
}
