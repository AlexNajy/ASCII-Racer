import {
  DEFAULT_LOBBY_CHOICES,
  LOBBY_AVENUES,
  LOBBY_DOWNTOWNS,
  LOBBY_ROUTE_LENGTHS,
  LOBBY_SEED_MAX,
  LOBBY_SIZES,
  type LobbySettings,
} from '../game/lobbySettings.ts';
import type { SettingsKey } from './settingsMenu.ts';

// The create lobby screen's rows and what keys and clicks do on it. Pure: main.ts builds the city when told to
// create. The settings being edited are a LobbyDraft: a LobbySettings whose seed is null for random.

export const LOBBY_ROWS = ['seed', 'size', 'downtown', 'avenues', 'routeLength', 'create'] as const;
export type LobbyRow = (typeof LOBBY_ROWS)[number];
export type ChoiceRow = Exclude<LobbyRow, 'seed' | 'create'>;

export const LOBBY_ROW_LABELS: Record<LobbyRow, string> = {
  seed: 'seed',
  size: 'city size',
  downtown: 'downtown',
  avenues: 'avenues',
  routeLength: 'route length',
  create: 'create',
};

export type LobbyDraft = Omit<LobbySettings, 'seed'> & { seed: number | null };

export const DEFAULT_LOBBY_DRAFT: Readonly<LobbyDraft> = { seed: null, ...DEFAULT_LOBBY_CHOICES };

export const SEED_DIGITS = String(LOBBY_SEED_MAX).length; // at most this many digits are typed
export const RANDOM_SEED_TEXT = 'random';

// The seed being typed; `invalid` is set by an Enter that couldn't save it, until the next change.
export interface SeedEdit {
  text: string;
  invalid: boolean;
}

export interface CreateLobbyScreen {
  selected: number; // index into LOBBY_ROWS
  draft: LobbyDraft;
  editing: SeedEdit | null;
}

export interface CreateLobbyChange {
  screen: CreateLobbyScreen;
  leave: boolean; // back to the main menu
  create: boolean; // build the lobby's city
}

export const FIRST_LOBBY_ROW = 0;
export function createLobbyScreen(draft: LobbyDraft = DEFAULT_LOBBY_DRAFT, selected = FIRST_LOBBY_ROW): CreateLobbyScreen {
  return { selected, draft: { ...draft }, editing: null };
}

const CHOICES: Record<ChoiceRow, readonly string[]> = {
  size: LOBBY_SIZES,
  downtown: LOBBY_DOWNTOWNS,
  avenues: LOBBY_AVENUES,
  routeLength: LOBBY_ROUTE_LENGTHS,
};

// The widest name, so the arrows stay put while cycling.
export const LOBBY_CHOICE_WIDTH = Math.max(...Object.values(CHOICES).flat().map((name) => name.length));
// Where the arrows are in a choice's value, for clicks.
export const LOBBY_CHOICE_LESS = 0;
export const LOBBY_CHOICE_MORE = 3 + LOBBY_CHOICE_WIDTH;
export const LOBBY_VALUE_WIDTH = Math.max(LOBBY_CHOICE_WIDTH + 4, SEED_DIGITS + 1, RANDOM_SEED_TEXT.length);

export function isChoiceRow(row: LobbyRow): row is ChoiceRow {
  return row !== 'seed' && row !== 'create';
}

export function wrapLobbyRow(index: number): number {
  const count = LOBBY_ROWS.length;
  return ((index % count) + count) % count;
}

// The choice of a row moved by `step` (left is -1), wrapping round.
export function cycleLobbyChoice(draft: LobbyDraft, row: ChoiceRow, step: number): LobbyDraft {
  const choices = CHOICES[row];
  const index = Math.max(0, choices.indexOf(draft[row]));
  const next = choices[(((index + step) % choices.length) + choices.length) % choices.length];
  return { ...draft, [row]: next } as LobbyDraft;
}

// A row's value as the screen shows it; the create row has none.
export function lobbyValue(row: LobbyRow, draft: LobbyDraft, editing: SeedEdit | null): string {
  if (row === 'seed') return editing ? `${editing.text}_` : draft.seed === null ? RANDOM_SEED_TEXT : String(draft.seed);
  if (row === 'create') return '';
  return `< ${draft[row].padEnd(LOBBY_CHOICE_WIDTH, ' ')} >`;
}

function change(screen: CreateLobbyScreen, more: Partial<CreateLobbyChange> = {}): CreateLobbyChange {
  return { screen, leave: false, create: false, ...more };
}

function editKey(screen: CreateLobbyScreen, edit: SeedEdit, key: SettingsKey): CreateLobbyChange {
  const editing = (next: SeedEdit | null) => ({ ...screen, editing: next });
  if (typeof key === 'object') {
    if (!/^[0-9]$/.test(key.char) || edit.text.length >= SEED_DIGITS) return change(screen);
    return change(editing({ text: edit.text + key.char, invalid: false }));
  }
  switch (key) {
    case 'backspace':
      return change(editing({ text: edit.text.slice(0, -1), invalid: false }));
    case 'escape':
      return change(editing(null));
    case 'enter': {
      if (edit.text === '') return change({ ...editing(null), draft: { ...screen.draft, seed: null } });
      const seed = Number(edit.text);
      if (seed < 1 || seed > LOBBY_SEED_MAX) return change(editing({ ...edit, invalid: true }));
      return change({ ...editing(null), draft: { ...screen.draft, seed } });
    }
    default:
      return change(screen);
  }
}

export function createLobbyKey(screen: CreateLobbyScreen, key: SettingsKey): CreateLobbyChange {
  if (screen.editing) return editKey(screen, screen.editing, key);
  if (typeof key === 'object' || key === 'backspace') return change(screen);
  if (key === 'up' || key === 'down') return change({ ...screen, selected: wrapLobbyRow(screen.selected + (key === 'up' ? -1 : 1)) });
  if (key === 'escape') return change(screen, { leave: true });
  const row = LOBBY_ROWS[screen.selected];
  if (key === 'enter') {
    if (row === 'create') return change(screen, { create: true });
    if (row === 'seed') return change({ ...screen, editing: { text: screen.draft.seed === null ? '' : String(screen.draft.seed), invalid: false } });
    return change(screen);
  }
  return isChoiceRow(row) ? change({ ...screen, draft: cycleLobbyChoice(screen.draft, row, key === 'left' ? -1 : 1) }) : change(screen);
}

// The pointer over a row selects it; the same screen back when nothing changes. Not while a seed is typed.
export function selectLobbyRow(screen: CreateLobbyScreen, index: number): CreateLobbyScreen {
  if (screen.editing || index === screen.selected || !Number.isInteger(index) || index < 0 || index >= LOBBY_ROWS.length) return screen;
  return { ...screen, selected: index };
}

// A click on a row, `offset` columns into its value (negative on the label): selects it, then on the seed starts
// typing, on create creates, on a choice's arrows steps it. Ignored while a seed is typed.
export function createLobbyClick(screen: CreateLobbyScreen, index: number, offset: number): CreateLobbyChange {
  if (screen.editing) return change(screen);
  const selected = selectLobbyRow(screen, index);
  if (selected.selected !== index) return change(screen);
  const row = LOBBY_ROWS[index];
  if (row === 'seed' || row === 'create') return createLobbyKey(selected, 'enter');
  const step = offset === LOBBY_CHOICE_LESS ? -1 : offset === LOBBY_CHOICE_MORE ? 1 : 0;
  return change(step === 0 ? selected : { ...selected, draft: cycleLobbyChoice(selected.draft, row, step) });
}

// The settings of a lobby from the draft once its seed is known (a random one is picked when creating).
export function lobbySettingsOf(draft: LobbyDraft, seed: number): LobbySettings {
  return { ...draft, seed };
}
