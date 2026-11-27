import { CELL_WIDTH_MAX, CELL_WIDTH_MIN, DEFAULT_CELL_WIDTH } from '../dev/menu.ts';

// The player's settings, kept in the browser. Parsing and checking are pure; loading and saving only touch the
// storage they are given and never throw, so the game runs without storage (private mode).

export const VOLUME_STEPS = 10; // volume is a whole number of steps, 0 (silent) to this (full)
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 12;
export const SETTINGS_KEY = 'ascii-racer-settings';
export const SETTINGS_VERSION = 1;

export interface PlayerSettings {
  nickname: string;
  volume: number; // steps, 0 to VOLUME_STEPS
  muted: boolean;
  cellWidth: number; // CSS px, as the dev menu's cell width
}

export const DEFAULT_PLAYER_SETTINGS: Readonly<PlayerSettings> = {
  nickname: 'anon',
  volume: 8,
  muted: false,
  cellWidth: DEFAULT_CELL_WIDTH,
};

const NICKNAME_CHARACTER = /^[A-Za-z0-9 ]$/;

export function nicknameCharacter(char: string): boolean {
  return NICKNAME_CHARACTER.test(char);
}

// Spaces at the ends dropped, runs of spaces made one.
export function normaliseNickname(text: string): string {
  return text.trim().replace(/ +/g, ' ');
}

// Letters, digits and single spaces inside, 3 to 12 characters, as normaliseNickname leaves it.
export function validNickname(text: string): boolean {
  return (
    text === normaliseNickname(text) &&
    text.length >= NICKNAME_MIN &&
    text.length <= NICKNAME_MAX &&
    [...text].every(nicknameCharacter)
  );
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

// One check per field: the stored value when it is right, else null for the default. A new setting is a new row.
const FIELDS: { [K in keyof PlayerSettings]: (value: unknown) => PlayerSettings[K] | null } = {
  nickname: (value) => (typeof value === 'string' && validNickname(value) ? value : null),
  volume: (value) => wholeNumber(value, 0, VOLUME_STEPS),
  muted: (value) => (typeof value === 'boolean' ? value : null),
  cellWidth: (value) => wholeNumber(value, CELL_WIDTH_MIN, CELL_WIDTH_MAX),
};

function readField<K extends keyof PlayerSettings>(settings: PlayerSettings, stored: Record<string, unknown>, key: K): void {
  settings[key] = FIELDS[key](stored[key]) ?? DEFAULT_PLAYER_SETTINGS[key];
}

// Anything wrong falls back to the default field by field; unknown fields are ignored.
export function parseSettings(text: string | null): PlayerSettings {
  let stored: unknown = null;
  try {
    stored = text === null ? null : JSON.parse(text);
  } catch {
    stored = null;
  }
  const record = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const settings = { ...DEFAULT_PLAYER_SETTINGS };
  for (const key of Object.keys(FIELDS) as (keyof PlayerSettings)[]) readField(settings, record, key);
  return settings;
}

export function serialiseSettings(settings: PlayerSettings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, ...settings });
}

export function withVolume(settings: PlayerSettings, volume: number): PlayerSettings {
  return { ...settings, volume: Math.max(0, Math.min(VOLUME_STEPS, Math.round(volume))) };
}

export function withCellWidth(settings: PlayerSettings, cellWidth: number): PlayerSettings {
  return { ...settings, cellWidth: Math.max(CELL_WIDTH_MIN, Math.min(CELL_WIDTH_MAX, Math.round(cellWidth))) };
}

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

// `storage` is a getter because even reaching window.localStorage can throw.
export function loadSettings(storage: () => SettingsStorage): PlayerSettings {
  try {
    return parseSettings(storage().getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
}

export function saveSettings(storage: () => SettingsStorage, settings: PlayerSettings): void {
  try {
    storage().setItem(SETTINGS_KEY, serialiseSettings(settings));
  } catch {
    // Not saved: the settings still apply until the page is closed.
  }
}
