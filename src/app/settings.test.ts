import { describe, expect, it } from 'vitest';
import { CELL_WIDTH_MAX, CELL_WIDTH_MIN } from '../dev/menu.ts';
import {
  DEFAULT_PLAYER_SETTINGS,
  loadSettings,
  normaliseNickname,
  parseSettings,
  saveSettings,
  serialiseSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  validNickname,
  VOLUME_STEPS,
  withCellWidth,
  withVolume,
  type PlayerSettings,
  type SettingsStorage,
} from './settings.ts';

const CUSTOM: PlayerSettings = { nickname: 'Speedy 7', volume: 3, muted: true, cellWidth: 9, carShape: 'van', carColor: 'teal' };

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => void (items[key] = value),
  };
}

describe('player settings', () => {
  it('defaults to anon, a fairly loud volume, not muted, the default cell width, the red coupe', () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({ nickname: 'anon', volume: 8, muted: false, cellWidth: 6, carShape: 'coupe', carColor: 'ember' });
    expect(validNickname(DEFAULT_PLAYER_SETTINGS.nickname)).toBe(true);
  });

  it('reads back what it writes, with a version', () => {
    const text = serialiseSettings(CUSTOM);
    expect(JSON.parse(text).version).toBe(SETTINGS_VERSION);
    expect(parseSettings(text)).toEqual(CUSTOM);
  });

  it('falls back to the defaults on nothing stored or corrupt JSON', () => {
    for (const text of [null, '', '{', 'null', '42', '"anon"', '[1,2]', 'true']) expect(parseSettings(text)).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it('falls back field by field on wrong types and values out of range, ignoring unknown fields', () => {
    const parse = (fields: Record<string, unknown>) => parseSettings(JSON.stringify({ ...CUSTOM, ...fields }));
    expect(parse({ nickname: 7 }).nickname).toBe('anon');
    expect(parse({ nickname: 'ab' }).nickname).toBe('anon');
    expect(parse({ nickname: 'a_b_c' }).nickname).toBe('anon');
    expect(parse({ nickname: ' padded ' }).nickname).toBe('anon');
    expect(parse({ nickname: 'abcdefghijklm' }).nickname).toBe('anon');
    expect(parse({ volume: '3' }).volume).toBe(8);
    expect(parse({ volume: -1 }).volume).toBe(8);
    expect(parse({ volume: VOLUME_STEPS + 1 }).volume).toBe(8);
    expect(parse({ volume: 2.5 }).volume).toBe(8);
    expect(parse({ muted: 'yes' }).muted).toBe(false);
    expect(parse({ cellWidth: CELL_WIDTH_MIN - 1 }).cellWidth).toBe(6);
    expect(parse({ cellWidth: CELL_WIDTH_MAX + 1 }).cellWidth).toBe(6);
    expect(parse({ cellWidth: null }).cellWidth).toBe(6);
    for (const carShape of ['Van', 'truck', '', 3, null, ['van']]) expect(parse({ carShape }).carShape).toBe('coupe');
    for (const carColor of ['Teal', 'red', '', 0, false]) expect(parse({ carColor }).carColor).toBe('ember');
    expect(parse({ carShape: 'wedge', carColor: 'silver' })).toEqual({ ...CUSTOM, carShape: 'wedge', carColor: 'silver' });
    const mixed = parse({ volume: 'loud', extra: { deep: true } });
    expect(mixed).toEqual({ ...CUSTOM, volume: 8 });
    expect(mixed).not.toHaveProperty('extra');
    const { nickname, ...rest } = CUSTOM;
    expect(parseSettings(JSON.stringify(rest))).toEqual({ ...CUSTOM, nickname: 'anon' });
    expect(nickname).toBe('Speedy 7');
  });

  it('clamps volume and cell width changes to their ranges', () => {
    expect(withVolume(CUSTOM, -2).volume).toBe(0);
    expect(withVolume(CUSTOM, VOLUME_STEPS + 3).volume).toBe(VOLUME_STEPS);
    expect(withCellWidth(CUSTOM, 1).cellWidth).toBe(CELL_WIDTH_MIN);
    expect(withCellWidth(CUSTOM, 99).cellWidth).toBe(CELL_WIDTH_MAX);
  });
});

describe('nickname rule', () => {
  it('takes letters, digits and single spaces inside, 3 to 12 characters', () => {
    for (const ok of ['anon', 'abc', 'Speedy 7', 'ABCDEFGHIJKL', 'a b c', '123']) expect(validNickname(ok)).toBe(true);
    for (const bad of ['', 'ab', 'abcdefghijklm', ' abc', 'abc ', 'a  b', 'ab-c', 'émile', 'a\tb']) expect(validNickname(bad)).toBe(false);
  });

  it('drops spaces at the ends and makes runs of spaces one', () => {
    expect(normaliseNickname('  Speedy   7  ')).toBe('Speedy 7');
    expect(normaliseNickname('   ')).toBe('');
  });
});

describe('settings storage', () => {
  it('saves under one key and loads it back', () => {
    const storage = memoryStorage();
    saveSettings(() => storage, CUSTOM);
    expect(Object.keys(storage.items)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(() => storage)).toEqual(CUSTOM);
  });

  it('loads the defaults from empty or corrupt storage', () => {
    expect(loadSettings(() => memoryStorage())).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(loadSettings(() => memoryStorage({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it('survives storage that is missing or throws', () => {
    const throwing: SettingsStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const missing = () => {
      throw new Error('SecurityError');
    };
    expect(loadSettings(() => throwing)).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(loadSettings(missing)).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(() => saveSettings(() => throwing, CUSTOM)).not.toThrow();
    expect(() => saveSettings(missing, CUSTOM)).not.toThrow();
  });
});
