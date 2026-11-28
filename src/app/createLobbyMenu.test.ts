import { describe, expect, it } from 'vitest';
import {
  createLobbyClick,
  createLobbyKey,
  createLobbyScreen,
  cycleLobbyChoice,
  DEFAULT_LOBBY_DRAFT,
  LOBBY_CHOICE_MORE,
  LOBBY_CHOICE_WIDTH,
  LOBBY_ROWS,
  lobbySettingsOf,
  lobbyValue,
  type CreateLobbyScreen,
} from './createLobbyMenu.ts';
import { LOBBY_SEED_MAX } from '../game/lobbySettings.ts';
import type { SettingsKey } from './settingsMenu.ts';

const row = (name: (typeof LOBBY_ROWS)[number]) => LOBBY_ROWS.indexOf(name);
const at = (name: (typeof LOBBY_ROWS)[number], more: Partial<CreateLobbyScreen> = {}): CreateLobbyScreen => ({ ...createLobbyScreen(), selected: row(name), ...more });

function type(screen: CreateLobbyScreen, text: string): CreateLobbyScreen {
  let current = screen;
  for (const char of text) current = createLobbyKey(current, { char }).screen;
  return current;
}

describe('create lobby screen', () => {
  it('starts on random, medium everything', () => {
    const screen = createLobbyScreen();
    expect(screen).toEqual({ selected: 0, draft: { seed: null, size: 'medium', downtown: 'medium', avenues: 'some', routeLength: 'medium' }, editing: null });
    expect(DEFAULT_LOBBY_DRAFT.seed).toBeNull();
  });

  it('moves between the rows with up and down, wrapping round', () => {
    const last = LOBBY_ROWS.length - 1;
    expect(createLobbyKey(at('seed'), 'up').screen.selected).toBe(last);
    expect(createLobbyKey(at('create'), 'down').screen.selected).toBe(0);
    expect(createLobbyKey(at('size'), 'down').screen.selected).toBe(row('size') + 1);
  });

  it('cycles a choice with left and right, wrapping round', () => {
    const next = (name: 'size' | 'downtown' | 'avenues' | 'routeLength', key: SettingsKey, start = at(name)) => createLobbyKey(start, key).screen.draft[name];
    expect(next('size', 'right')).toBe('large');
    expect(next('size', 'left')).toBe('small');
    expect(createLobbyKey(at('size', { draft: { ...DEFAULT_LOBBY_DRAFT, size: 'large' } }), 'right').screen.draft.size).toBe('small');
    expect(createLobbyKey(at('size', { draft: { ...DEFAULT_LOBBY_DRAFT, size: 'small' } }), 'left').screen.draft.size).toBe('large');
    expect(next('downtown', 'right')).toBe('large');
    expect(next('avenues', 'left')).toBe('few');
    expect(next('routeLength', 'right')).toBe('long');
    expect(cycleLobbyChoice(DEFAULT_LOBBY_DRAFT, 'routeLength', 3)).toEqual(DEFAULT_LOBBY_DRAFT);
  });

  it('does nothing on left and right off the choices, nor on Enter on a choice', () => {
    for (const name of ['seed', 'create'] as const) for (const key of ['left', 'right'] as const) expect(createLobbyKey(at(name), key)).toEqual({ screen: at(name), leave: false, create: false });
    expect(createLobbyKey(at('size'), 'enter')).toEqual({ screen: at('size'), leave: false, create: false });
  });

  it('creates on Enter on the create row only, and leaves on Escape', () => {
    expect(createLobbyKey(at('create'), 'enter').create).toBe(true);
    for (const name of LOBBY_ROWS) if (name !== 'create') expect(createLobbyKey(at(name), 'enter').create).toBe(false);
    expect(createLobbyKey(at('size'), 'escape')).toEqual({ screen: at('size'), leave: true, create: false });
  });

  it('types a seed from the seed row: digits only, at most seven', () => {
    const typing = createLobbyKey(at('seed'), 'enter').screen;
    expect(typing.editing).toEqual({ text: '', invalid: false });
    expect(type(typing, '4a2 b').editing!.text).toBe('42');
    expect(type(typing, 'x-+.').editing!.text).toBe('');
    expect(type(typing, '12345678').editing!.text).toBe('1234567');
    expect(lobbyValue('seed', typing.draft, type(typing, '42').editing)).toBe('42_');
  });

  it('saves a typed seed from 1 to 1 000 000 on Enter, and shows the rule for others', () => {
    const typing = createLobbyKey(at('seed'), 'enter').screen;
    const saved = createLobbyKey(type(typing, '48213'), 'enter').screen;
    expect(saved.editing).toBeNull();
    expect(saved.draft.seed).toBe(48213);
    expect(createLobbyKey(type(typing, String(LOBBY_SEED_MAX)), 'enter').screen.draft.seed).toBe(LOBBY_SEED_MAX);
    expect(createLobbyKey(type(typing, '1'), 'enter').screen.draft.seed).toBe(1);
    for (const text of ['0', '00', '1000001', '9999999']) {
      const refused = createLobbyKey(type(typing, text), 'enter').screen;
      expect(refused.editing).toEqual({ text, invalid: true });
      expect(refused.draft.seed).toBeNull();
      expect(createLobbyKey(refused, 'backspace').screen.editing!.invalid).toBe(false);
    }
  });

  it('goes back to random on an empty seed, and edits from the current one', () => {
    const typed = at('seed', { draft: { ...DEFAULT_LOBBY_DRAFT, seed: 777 } });
    const typing = createLobbyKey(typed, 'enter').screen;
    expect(typing.editing!.text).toBe('777');
    let empty = typing;
    for (let i = 0; i < 3; i++) empty = createLobbyKey(empty, 'backspace').screen;
    expect(empty.editing!.text).toBe('');
    expect(createLobbyKey(empty, 'backspace').screen.editing!.text).toBe('');
    const saved = createLobbyKey(empty, 'enter').screen;
    expect(saved.draft.seed).toBeNull();
    expect(lobbyValue('seed', saved.draft, null)).toBe('random');
    expect(lobbyValue('seed', typed.draft, null)).toBe('777');
  });

  it('cancels a typed seed on Escape without leaving or changing the seed, and ignores every other key while typing', () => {
    const typing = type(createLobbyKey(at('seed', { draft: { ...DEFAULT_LOBBY_DRAFT, seed: 9 } }), 'enter').screen, '5');
    const cancelled = createLobbyKey(typing, 'escape');
    expect(cancelled.leave).toBe(false);
    expect(cancelled.screen.editing).toBeNull();
    expect(cancelled.screen.draft.seed).toBe(9);
    for (const key of ['up', 'down', 'left', 'right'] as const) expect(createLobbyKey(typing, key)).toEqual({ screen: typing, leave: false, create: false });
  });

  it('selects, types, creates and steps with clicks', () => {
    const screen = createLobbyScreen();
    expect(createLobbyClick(screen, row('size'), -3).screen.selected).toBe(row('size'));
    expect(createLobbyClick(screen, row('size'), 2).screen.draft.size).toBe('medium');
    expect(createLobbyClick(screen, row('size'), 0).screen.draft.size).toBe('small'); // < of the row, now selected
    expect(createLobbyClick(screen, row('size'), LOBBY_CHOICE_MORE).screen.draft.size).toBe('large');
    expect(createLobbyClick(screen, row('size'), LOBBY_CHOICE_MORE + 1).screen.draft.size).toBe('medium');
    expect(LOBBY_CHOICE_MORE).toBe(3 + LOBBY_CHOICE_WIDTH);
    expect(createLobbyClick(screen, row('seed'), 4).screen.editing).toEqual({ text: '', invalid: false });
    expect(createLobbyClick(screen, row('create'), 0).create).toBe(true);
    expect(createLobbyClick(screen, 99, 0).screen).toBe(screen);
    const typing = createLobbyKey(screen, 'enter').screen;
    expect(createLobbyClick(typing, row('create'), 0).screen).toBe(typing);
    expect(createLobbyClick(typing, row('create'), 0).create).toBe(false);
  });

  it('shows the choices the same width whatever the choice', () => {
    const widths = new Set<number>();
    for (const name of ['size', 'downtown', 'avenues', 'routeLength'] as const) {
      let draft = DEFAULT_LOBBY_DRAFT as ReturnType<typeof cycleLobbyChoice>;
      for (let i = 0; i < 3; i++) {
        widths.add(lobbyValue(name, draft, null).length);
        draft = cycleLobbyChoice(draft, name, 1);
      }
    }
    expect([...widths]).toEqual([LOBBY_CHOICE_WIDTH + 4]);
  });

  it('turns a draft and a seed into lobby settings', () => {
    expect(lobbySettingsOf(DEFAULT_LOBBY_DRAFT, 12)).toEqual({ seed: 12, size: 'medium', downtown: 'medium', avenues: 'some', routeLength: 'medium' });
  });
});
