import { describe, expect, it } from 'vitest';
import { CELL_WIDTH_MAX, CELL_WIDTH_MIN } from '../dev/menu.ts';
import { DEFAULT_PLAYER_SETTINGS, VOLUME_STEPS, type PlayerSettings } from './settings.ts';
import {
  GLYPH_SIZE_LESS,
  GLYPH_SIZE_MORE,
  selectSettingsRow,
  settingsClick,
  settingsKey,
  modifiedKeyOutcome,
  settingsKeyFromEvent,
  settingsValue,
  SETTINGS_ROWS,
  type SettingsKey,
  type SettingsScreen,
} from './settingsMenu.ts';

const SETTINGS: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS };
const row = (name: (typeof SETTINGS_ROWS)[number]) => SETTINGS_ROWS.indexOf(name);
const on = (name: (typeof SETTINGS_ROWS)[number]): SettingsScreen => ({ selected: row(name), editing: null });

// Keys pressed in order from a screen, as main.ts reads them from keydown events.
function press(screen: SettingsScreen, settings: PlayerSettings, keys: SettingsKey[]) {
  let current = { screen, settings, toggleFullscreen: false, leave: false };
  for (const key of keys) current = settingsKey(current.screen, current.settings, key);
  return current;
}

function type(text: string): SettingsKey[] {
  return [...text].map((char) => ({ char }));
}

describe('settings keys', () => {
  it('lists nickname, volume, mute, glyph size and fullscreen', () => {
    expect(SETTINGS_ROWS).toEqual(['nickname', 'volume', 'mute', 'glyphSize', 'fullscreen']);
  });

  it('moves up and down, wrapping round', () => {
    expect(settingsKey(on('nickname'), SETTINGS, 'down').screen.selected).toBe(1);
    expect(settingsKey(on('nickname'), SETTINGS, 'up').screen.selected).toBe(SETTINGS_ROWS.length - 1);
    expect(settingsKey(on('fullscreen'), SETTINGS, 'down').screen.selected).toBe(0);
  });

  it('changes volume and glyph size in steps within their ranges', () => {
    expect(settingsKey(on('volume'), SETTINGS, 'left').settings.volume).toBe(7);
    expect(settingsKey(on('volume'), SETTINGS, 'right').settings.volume).toBe(9);
    expect(press(on('volume'), SETTINGS, ['right', 'right', 'right', 'right']).settings.volume).toBe(VOLUME_STEPS);
    expect(settingsKey(on('volume'), { ...SETTINGS, volume: 0 }, 'left').settings.volume).toBe(0);
    expect(settingsKey(on('glyphSize'), SETTINGS, 'right').settings.cellWidth).toBe(7);
    expect(settingsKey(on('glyphSize'), { ...SETTINGS, cellWidth: CELL_WIDTH_MIN }, 'left').settings.cellWidth).toBe(CELL_WIDTH_MIN);
    expect(settingsKey(on('glyphSize'), { ...SETTINGS, cellWidth: CELL_WIDTH_MAX }, 'right').settings.cellWidth).toBe(CELL_WIDTH_MAX);
  });

  it('toggles mute with Enter, Left and Right, and asks for fullscreen the same way', () => {
    for (const key of ['enter', 'left', 'right'] as const) {
      expect(settingsKey(on('mute'), SETTINGS, key).settings.muted).toBe(true);
      const fullscreen = settingsKey(on('fullscreen'), SETTINGS, key);
      expect(fullscreen.toggleFullscreen).toBe(true);
      expect(fullscreen.settings).toEqual(SETTINGS);
    }
    expect(settingsKey(on('mute'), SETTINGS, 'up').settings.muted).toBe(false);
    expect(settingsKey(on('volume'), SETTINGS, 'enter').toggleFullscreen).toBe(false);
  });

  it('leaves on Escape when not typing', () => {
    const result = settingsKey(on('volume'), SETTINGS, 'escape');
    expect(result.leave).toBe(true);
    expect(result.settings).toEqual(SETTINGS);
  });

  it('types a nickname from the current one: Enter starts, Backspace deletes, Enter saves it', () => {
    const started = settingsKey(on('nickname'), SETTINGS, 'enter');
    expect(started.screen.editing).toEqual({ text: 'anon', tooShort: false });
    const typed = press(started.screen, SETTINGS, [...Array(4).fill('backspace'), ...type('Speedy 7')]);
    expect(typed.screen.editing?.text).toBe('Speedy 7');
    const saved = settingsKey(typed.screen, typed.settings, 'enter');
    expect(saved.settings.nickname).toBe('Speedy 7');
    expect(saved.screen).toEqual(on('nickname'));
  });

  it('types w, s, a, d and other movement letters instead of acting on them', () => {
    const editing: SettingsScreen = { selected: row('nickname'), editing: { text: '', tooShort: false } };
    const result = press(editing, SETTINGS, type('wasd WASD'));
    expect(result.screen).toEqual({ selected: row('nickname'), editing: { text: 'wasd WASD', tooShort: false } });
    expect(result.leave || result.toggleFullscreen).toBe(false);
    for (const key of ['up', 'down', 'left', 'right'] as const) expect(settingsKey(editing, SETTINGS, key).screen).toEqual(editing);
  });

  it('takes only letters, digits and spaces, up to 12', () => {
    const editing: SettingsScreen = { selected: 0, editing: { text: '', tooShort: false } };
    expect(press(editing, SETTINGS, type('a-b_c!é.')).screen.editing?.text).toBe('abc');
    expect(press(editing, SETTINGS, type('abcdefghijklmnop')).screen.editing?.text).toBe('abcdefghijkl');
  });

  it('refuses a name too short after trimming, with the hint until the next change', () => {
    const editing: SettingsScreen = { selected: 0, editing: { text: '', tooShort: false } };
    const short = press(editing, SETTINGS, [...type(' ab  '), 'enter']);
    expect(short.screen.editing).toEqual({ text: ' ab  ', tooShort: true });
    expect(short.settings.nickname).toBe('anon');
    expect(settingsKey(short.screen, short.settings, 'backspace').screen.editing?.tooShort).toBe(false);
    expect(settingsKey(short.screen, short.settings, { char: 'c' }).screen.editing?.tooShort).toBe(false);
  });

  it('saves the name trimmed with single spaces', () => {
    const editing: SettingsScreen = { selected: 0, editing: { text: '', tooShort: false } };
    expect(press(editing, SETTINGS, [...type(' Fast   Lane '), 'enter']).settings.nickname).toBe('Fast Lane');
  });

  it('cancels typing on Escape, keeping the old name and the screen', () => {
    const editing: SettingsScreen = { selected: 0, editing: { text: 'new', tooShort: false } };
    const result = settingsKey(editing, SETTINGS, 'escape');
    expect(result.leave).toBe(false);
    expect(result.screen).toEqual(on('nickname'));
    expect(result.settings.nickname).toBe('anon');
  });

  it('reads keys by place when not typing and by character when typing', () => {
    expect(settingsKeyFromEvent('KeyW', 'w', false)).toBe('up');
    expect(settingsKeyFromEvent('KeyS', 's', false)).toBe('down');
    expect(settingsKeyFromEvent('ArrowLeft', 'ArrowLeft', false)).toBe('left');
    expect(settingsKeyFromEvent('KeyD', 'd', false)).toBe('right');
    expect(settingsKeyFromEvent('Enter', 'Enter', false)).toBe('enter');
    expect(settingsKeyFromEvent('Escape', 'Escape', false)).toBe('escape');
    expect(settingsKeyFromEvent('KeyF', 'f', false)).toBeNull();
    expect(settingsKeyFromEvent('KeyW', 'w', true)).toEqual({ char: 'w' });
    expect(settingsKeyFromEvent('KeyZ', 'y', true)).toEqual({ char: 'y' });
    expect(settingsKeyFromEvent('Space', ' ', true)).toEqual({ char: ' ' });
    expect(settingsKeyFromEvent('Backspace', 'Backspace', true)).toBe('backspace');
    expect(settingsKeyFromEvent('Escape', 'Escape', true)).toBe('escape');
    expect(settingsKeyFromEvent('Enter', 'Enter', true)).toBe('enter');
    expect(settingsKeyFromEvent('ArrowUp', 'ArrowUp', true)).toBeNull();
    expect(settingsKeyFromEvent('ShiftLeft', 'Shift', true)).toBeNull();
  });
});

describe('modifier keys', () => {
  const mods = (more: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => ({ ctrlKey: false, metaKey: false, altKey: false, ...more });

  it('leaves Ctrl and Cmd combinations to the browser, also while typing', () => {
    for (const editing of [false, true]) {
      expect(modifiedKeyOutcome(editing, mods({ ctrlKey: true }))).toBe('browser');
      expect(modifiedKeyOutcome(editing, mods({ metaKey: true }))).toBe('browser');
      expect(modifiedKeyOutcome(editing, mods({ metaKey: true, altKey: true }))).toBe('browser');
      expect(modifiedKeyOutcome(editing, mods({}))).toBe('read');
    }
  });

  it('swallows Alt combinations while typing, so no other key acts, and lets them through otherwise', () => {
    expect(modifiedKeyOutcome(true, mods({ altKey: true }))).toBe('swallow');
    expect(modifiedKeyOutcome(false, mods({ altKey: true }))).toBe('browser');
  });
});

describe('settings values and clicks', () => {
  it('shows each value', () => {
    expect(settingsValue('nickname', SETTINGS, false, null)).toBe('anon');
    expect(settingsValue('nickname', SETTINGS, false, { text: 'Spe', tooShort: false })).toBe('Spe_');
    expect(settingsValue('volume', SETTINGS, false, null)).toBe('[########--]');
    expect(settingsValue('mute', { ...SETTINGS, muted: true }, false, null)).toBe('on');
    expect(settingsValue('glyphSize', SETTINGS, false, null)).toBe('<  6 >');
    expect(settingsValue('glyphSize', { ...SETTINGS, cellWidth: 16 }, false, null)).toBe('< 16 >');
    expect(settingsValue('fullscreen', SETTINGS, true, null)).toBe('on');
    const glyph = settingsValue('glyphSize', SETTINGS, false, null);
    expect(glyph[GLYPH_SIZE_LESS]).toBe('<');
    expect(glyph[GLYPH_SIZE_MORE]).toBe('>');
  });

  it('selects rows under the pointer, not while typing', () => {
    expect(selectSettingsRow(on('nickname'), 3)).toEqual(on('glyphSize'));
    const same = on('mute');
    expect(selectSettingsRow(same, row('mute'))).toBe(same);
    for (const bad of [-1, SETTINGS_ROWS.length, 1.5]) expect(selectSettingsRow(same, bad)).toBe(same);
    const editing: SettingsScreen = { selected: 0, editing: { text: 'x', tooShort: false } };
    expect(selectSettingsRow(editing, 2)).toBe(editing);
  });

  it('sets the volume where the bar is clicked', () => {
    expect(settingsClick(on('nickname'), SETTINGS, row('volume'), 0).settings.volume).toBe(0);
    expect(settingsClick(on('nickname'), SETTINGS, row('volume'), 3).settings.volume).toBe(3);
    expect(settingsClick(on('nickname'), SETTINGS, row('volume'), VOLUME_STEPS).settings.volume).toBe(VOLUME_STEPS);
    expect(settingsClick(on('nickname'), SETTINGS, row('volume'), VOLUME_STEPS + 1).settings.volume).toBe(VOLUME_STEPS);
    const label = settingsClick(on('nickname'), SETTINGS, row('volume'), -4);
    expect(label.settings.volume).toBe(8);
    expect(label.screen).toEqual(on('volume'));
  });

  it('steps the glyph size on its arrows, toggles mute and fullscreen, starts typing on the nickname', () => {
    expect(settingsClick(on('nickname'), SETTINGS, row('glyphSize'), GLYPH_SIZE_LESS).settings.cellWidth).toBe(5);
    expect(settingsClick(on('nickname'), SETTINGS, row('glyphSize'), GLYPH_SIZE_MORE).settings.cellWidth).toBe(7);
    expect(settingsClick(on('nickname'), SETTINGS, row('glyphSize'), 2).settings.cellWidth).toBe(6);
    expect(settingsClick(on('nickname'), SETTINGS, row('mute'), -3).settings.muted).toBe(true);
    expect(settingsClick(on('nickname'), SETTINGS, row('fullscreen'), 0).toggleFullscreen).toBe(true);
    expect(settingsClick(on('volume'), SETTINGS, row('nickname'), 1).screen.editing).toEqual({ text: 'anon', tooShort: false });
  });

  it('ignores clicks while typing', () => {
    const editing: SettingsScreen = { selected: 0, editing: { text: 'abc', tooShort: false } };
    const result = settingsClick(editing, SETTINGS, row('mute'), 0);
    expect(result.screen).toBe(editing);
    expect(result.settings).toBe(SETTINGS);
  });
});
