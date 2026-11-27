import { NICKNAME_MAX, nicknameCharacter, normaliseNickname, validNickname, VOLUME_STEPS, withCellWidth, withVolume, type PlayerSettings } from './settings.ts';

// The settings screen's rows and what keys and clicks do on it. Pure: main.ts saves the settings, applies the cell
// width and toggles fullscreen when told to.

export const SETTINGS_ROWS = ['nickname', 'volume', 'mute', 'glyphSize', 'fullscreen'] as const;
export type SettingsRow = (typeof SETTINGS_ROWS)[number];

export const ROW_LABELS: Record<SettingsRow, string> = {
  nickname: 'nickname',
  volume: 'volume',
  mute: 'mute',
  glyphSize: 'glyph size',
  fullscreen: 'fullscreen',
};

// The nickname being typed. `tooShort` is set by an Enter that couldn't save it, until the next change.
export interface NicknameEdit {
  text: string;
  tooShort: boolean;
}

export interface SettingsScreen {
  selected: number; // index into SETTINGS_ROWS
  editing: NicknameEdit | null;
}

export type SettingsKey = 'up' | 'down' | 'left' | 'right' | 'enter' | 'escape' | 'backspace' | { char: string };

export interface SettingsChange {
  screen: SettingsScreen;
  settings: PlayerSettings;
  toggleFullscreen: boolean;
  leave: boolean; // back to the main menu
}

const MOVE_CODES: Record<string, SettingsKey> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'escape',
};

const EDIT_KEYS: Record<string, SettingsKey> = { Enter: 'enter', Escape: 'escape', Backspace: 'backspace' };

// A keydown as the screen reads it: while editing by the character typed (event.key), else by the key's place
// (event.code), as the other keys of the game. Null for keys it doesn't use.
export function settingsKeyFromEvent(code: string, key: string, editing: boolean): SettingsKey | null {
  if (!editing) return MOVE_CODES[code] ?? null;
  return EDIT_KEYS[key] ?? ([...key].length === 1 ? { char: key } : null);
}

// What the settings screen does with a keydown's modifiers: Ctrl and Cmd combinations are the browser's (reload, copy,
// paste), Alt combinations too, except while the nickname is typed, when no other key may act.
export function modifiedKeyOutcome(editing: boolean, mods: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): 'browser' | 'swallow' | 'read' {
  if (mods.ctrlKey || mods.metaKey) return 'browser';
  if (mods.altKey) return editing ? 'swallow' : 'browser';
  return 'read';
}

export function wrapSettingsRow(index: number): number {
  const count = SETTINGS_ROWS.length;
  return ((index % count) + count) % count;
}

function change(screen: SettingsScreen, settings: PlayerSettings, more: Partial<SettingsChange> = {}): SettingsChange {
  return { screen, settings, toggleFullscreen: false, leave: false, ...more };
}

function editKey(screen: SettingsScreen, edit: NicknameEdit, settings: PlayerSettings, key: SettingsKey): SettingsChange {
  const editing = (next: NicknameEdit | null) => ({ ...screen, editing: next });
  if (typeof key === 'object') {
    if (!nicknameCharacter(key.char) || edit.text.length >= NICKNAME_MAX) return change(screen, settings);
    return change(editing({ text: edit.text + key.char, tooShort: false }), settings);
  }
  switch (key) {
    case 'backspace':
      return change(editing({ text: edit.text.slice(0, -1), tooShort: false }), settings);
    case 'escape':
      return change(editing(null), settings);
    case 'enter': {
      const nickname = normaliseNickname(edit.text);
      if (!validNickname(nickname)) return change(editing({ ...edit, tooShort: true }), settings);
      return change(editing(null), { ...settings, nickname });
    }
    default:
      return change(screen, settings);
  }
}

export function settingsKey(screen: SettingsScreen, settings: PlayerSettings, key: SettingsKey): SettingsChange {
  if (screen.editing) return editKey(screen, screen.editing, settings, key);
  if (typeof key === 'object' || key === 'backspace') return change(screen, settings);
  if (key === 'up' || key === 'down') return change({ ...screen, selected: wrapSettingsRow(screen.selected + (key === 'up' ? -1 : 1)) }, settings);
  if (key === 'escape') return change(screen, settings, { leave: true });
  const step = key === 'left' ? -1 : key === 'right' ? 1 : 0;
  switch (SETTINGS_ROWS[screen.selected]) {
    case 'nickname':
      return key === 'enter' ? change({ ...screen, editing: { text: settings.nickname, tooShort: false } }, settings) : change(screen, settings);
    case 'volume':
      return change(screen, withVolume(settings, settings.volume + step));
    case 'mute':
      return change(screen, { ...settings, muted: !settings.muted });
    case 'glyphSize':
      return change(screen, withCellWidth(settings, settings.cellWidth + step));
    case 'fullscreen':
      return change(screen, settings, { toggleFullscreen: true });
  }
}

const GLYPH_SIZE_DIGITS = 2;
// Where the glyph size's arrows are in its value, for clicks.
export const GLYPH_SIZE_LESS = 0;
export const GLYPH_SIZE_MORE = 3 + GLYPH_SIZE_DIGITS;

// A row's value as the screen shows it.
export function settingsValue(row: SettingsRow, settings: PlayerSettings, fullscreen: boolean, editing: NicknameEdit | null): string {
  const onOff = (on: boolean) => (on ? 'on' : 'off');
  switch (row) {
    case 'nickname':
      return editing ? `${editing.text}_` : settings.nickname;
    case 'volume':
      return `[${'#'.repeat(settings.volume)}${'-'.repeat(VOLUME_STEPS - settings.volume)}]`;
    case 'mute':
      return onOff(settings.muted);
    case 'glyphSize':
      return `< ${String(settings.cellWidth).padStart(GLYPH_SIZE_DIGITS)} >`;
    case 'fullscreen':
      return onOff(fullscreen);
  }
}

// The pointer over a row selects it; the same screen back when nothing changes. Not while editing.
export function selectSettingsRow(screen: SettingsScreen, index: number): SettingsScreen {
  if (screen.editing || index === screen.selected || !Number.isInteger(index) || index < 0 || index >= SETTINGS_ROWS.length) return screen;
  return { ...screen, selected: index };
}

// A click on a row, `offset` columns into its value (negative on the label): selects it and does what Enter does,
// or on the volume bar sets that level, on the glyph size's arrows steps it. Ignored while editing.
export function settingsClick(screen: SettingsScreen, settings: PlayerSettings, index: number, offset: number): SettingsChange {
  if (screen.editing) return change(screen, settings);
  const selected = selectSettingsRow(screen, index);
  if (selected.selected !== index) return change(screen, settings);
  switch (SETTINGS_ROWS[index]) {
    case 'volume':
      return change(selected, offset >= 0 && offset <= VOLUME_STEPS + 1 ? withVolume(settings, Math.min(offset, VOLUME_STEPS)) : settings);
    case 'glyphSize': {
      const step = offset === GLYPH_SIZE_LESS ? -1 : offset === GLYPH_SIZE_MORE ? 1 : 0;
      return change(selected, withCellWidth(settings, settings.cellWidth + step));
    }
    default:
      return settingsKey(selected, settings, 'enter');
  }
}
