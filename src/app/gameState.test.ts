import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { createRace, goTick } from '../game/race.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import {
  afterTick,
  FIRST_OPTION,
  GARAGE,
  loaded,
  loading,
  MENU,
  moveSelection,
  preRace,
  pressEnter,
  pressEscape,
  race,
  RESULTS_AFTER_TICKS,
  SETTINGS,
  RESULTS_OPTIONS,
  selectEntry,
  type GameState,
} from './gameState.ts';
import { entryEnabled, FIRST_ENTRY, MENU_ENTRIES, screenEntry } from './mainMenu.ts';
import { SETTINGS_ROWS } from './settingsMenu.ts';

const route = generateRoute(roadGraph(generateCity({ ...DEFAULT_CITY_SETTINGS })), 1);
const other = generateRoute(roadGraph(generateCity({ ...DEFAULT_CITY_SETTINGS, seed: 2 })), 2);
const PRE_RACE = preRace('unlimited', route);
const RACE = race('unlimited', route);
const results = (selected: number): GameState => ({ kind: 'results', mode: 'unlimited', route, ticks: 100, selected });
const RESULTS = results(FIRST_OPTION);
const option = (name: (typeof RESULTS_OPTIONS)[number]) => RESULTS_OPTIONS.indexOf(name);
const LOADING = loading('unlimited');

describe('game state', () => {
  it('goes from unlimited on the menu through loading to the race on the new route', () => {
    const next = pressEnter(MENU);
    expect(next).toEqual({ kind: 'loading', mode: 'unlimited' });
    expect(next).toEqual(loading('unlimited'));
    expect(loaded(next, route)).toEqual({ kind: 'race', mode: 'unlimited', route });
  });

  it('goes from the pre-race screen to its race', () => {
    expect(pressEnter(PRE_RACE)).toEqual(RACE);
  });

  it('goes to the menu when no new route could be made', () => {
    expect(loaded(LOADING, null)).toEqual(MENU);
  });

  it('ignores Enter while racing', () => {
    expect(pressEnter(RACE)).toBe(RACE);
  });

  it("loads a new city only for the menu's unlimited and for next", () => {
    for (const state of [PRE_RACE, RACE, results(option('again')), results(option('menu'))]) {
      expect(pressEnter(state).kind).not.toBe('loading');
    }
    expect(pressEnter(results(option('next')))).toEqual(LOADING);
  });

  it('ignores Enter, Escape, the selection and the ticks while loading, however often', () => {
    let state = LOADING;
    for (let i = 0; i < 5; i++) {
      state = pressEscape(pressEnter(state));
      state = selectEntry(moveSelection(state, 1), 0);
    }
    expect(state).toBe(LOADING);
    const current = createRace(route, 0);
    current.phase = 'finished';
    expect(afterTick(LOADING, current, current.finishTick + RESULTS_AFTER_TICKS)).toBe(LOADING);
  });

  it('starts a race only from the loading state', () => {
    for (const state of [MENU, PRE_RACE, RACE, RESULTS, SETTINGS, GARAGE]) expect(loaded(state, other)).toBe(state);
  });

  it('offers again, next and menu after the finish, again first', () => {
    expect(RESULTS_OPTIONS).toEqual(['again', 'next', 'menu']);
    expect(RESULTS_OPTIONS[FIRST_OPTION]).toBe('again');
  });

  it('races the same route again on again', () => {
    const next = pressEnter(results(option('again')));
    expect(next).toEqual(RACE);
    if (next.kind === 'race') expect(next.route).toBe(route);
  });

  it('races a new route on next, or goes to the menu when none could be made', () => {
    const next = pressEnter(results(option('next')));
    expect(loaded(next, other)).toEqual(race('unlimited', other));
    expect(loaded(next, null)).toEqual(MENU);
  });

  it('goes to the menu on menu', () => {
    expect(pressEnter(results(option('menu')))).toEqual(MENU);
  });

  it('moves and points at the finish screen options, wrapping round', () => {
    expect(moveSelection(results(0), 1)).toEqual(results(1));
    expect(moveSelection(results(0), -1)).toEqual(results(2));
    expect(moveSelection(results(2), 1)).toEqual(results(0));
    expect(selectEntry(results(0), 2)).toEqual(results(2));
    expect(selectEntry(RESULTS, FIRST_OPTION)).toBe(RESULTS);
    for (const index of [-1, 3, 0.5]) expect(selectEntry(RESULTS, index)).toBe(RESULTS);
  });

  it('goes back to the menu on Escape from every other state', () => {
    for (const state of [PRE_RACE, RACE, RESULTS]) expect(pressEscape(state)).toEqual(MENU);
    expect(pressEscape(MENU)).toBe(MENU);
    expect(pressEscape(LOADING)).toBe(LOADING);
  });

  it('shows the results RESULTS_AFTER_TICKS after the finish, with the race time', () => {
    const current = createRace(route, 50);
    expect(afterTick(RACE, current, goTick(current) + 10)).toBe(RACE);
    current.phase = 'finished';
    current.finishTick = goTick(current) + 1234;
    expect(afterTick(RACE, current, current.finishTick)).toBe(RACE);
    expect(afterTick(RACE, current, current.finishTick + RESULTS_AFTER_TICKS - 1)).toBe(RACE);
    expect(afterTick(RACE, current, current.finishTick + RESULTS_AFTER_TICKS)).toEqual({ kind: 'results', mode: 'unlimited', route, ticks: 1234, selected: FIRST_OPTION });
  });

  it('moves on by itself only from a finished race', () => {
    const current = createRace(route, 0);
    current.phase = 'finished';
    current.finishTick = goTick(current);
    const late = current.finishTick + RESULTS_AFTER_TICKS;
    for (const state of [MENU, PRE_RACE, RESULTS]) expect(afterTick(state, current, late)).toBe(state);
    expect(afterTick(RACE, null, late)).toBe(RACE);
  });

  it('starts the menu on unlimited, the first entry built so far', () => {
    expect(MENU_ENTRIES.map((entry) => entry.label)).toEqual(['daily', 'unlimited', 'join lobby', 'create lobby', 'garage', 'settings']);
    expect(FIRST_ENTRY).toBe(1);
    expect(MENU).toEqual({ kind: 'menu', selected: 1 });
    expect(MENU_ENTRIES.map((_, i) => entryEnabled(i))).toEqual([false, true, false, false, true, true]);
  });

  it('moves the selection up and down, wrapping round at both ends', () => {
    const at = (selected: number): GameState => ({ kind: 'menu', selected });
    expect(moveSelection(at(1), 1)).toEqual(at(2));
    expect(moveSelection(at(1), -1)).toEqual(at(0));
    expect(moveSelection(at(0), -1)).toEqual(at(5));
    expect(moveSelection(at(5), 1)).toEqual(at(0));
    for (const state of [PRE_RACE, RACE]) expect(moveSelection(state, 1)).toBe(state);
  });

  it('selects an entry under the pointer, the same state when nothing changes', () => {
    expect(selectEntry(MENU, 4)).toEqual({ kind: 'menu', selected: 4 });
    expect(selectEntry(MENU, FIRST_ENTRY)).toBe(MENU);
    for (const index of [-1, 6, 1.5]) expect(selectEntry(MENU, index)).toBe(MENU);
    expect(selectEntry(RACE, 0)).toBe(RACE);
  });

  it('does nothing on Enter over an entry not built yet', () => {
    for (let i = 0; i < MENU_ENTRIES.length; i++) {
      if (entryEnabled(i)) continue;
      const state: GameState = { kind: 'menu', selected: i };
      expect(pressEnter(state)).toBe(state);
    }
  });

  it('goes back to the menu with the first entry selected', () => {
    expect(pressEscape(RACE)).toEqual({ kind: 'menu', selected: FIRST_ENTRY });
    const elsewhere: GameState = { kind: 'menu', selected: 4 };
    expect(pressEscape(elsewhere)).toBe(elsewhere);
  });

  it('opens the settings from their entry without loading, and goes back to it on Escape', () => {
    const entry = MENU_ENTRIES.findIndex((e) => e.label === 'settings');
    expect(screenEntry('settings')).toBe(entry);
    const opened = pressEnter({ kind: 'menu', selected: entry });
    expect(opened).toEqual({ kind: 'settings', selected: 0, editing: null });
    expect(opened).toBe(SETTINGS);
    expect(pressEscape(opened)).toEqual({ kind: 'menu', selected: entry });
    expect(pressEnter(opened)).toBe(opened);
    expect(afterTick(opened, null, 1000)).toBe(opened);
  });

  it('drops a nickname being typed on Escape before leaving the settings', () => {
    const typing: GameState = { kind: 'settings', selected: 0, editing: { text: 'abc', tooShort: false } };
    expect(pressEscape(typing)).toEqual({ kind: 'settings', selected: 0, editing: null });
  });

  it('moves and points at the settings rows, wrapping round, but not while typing', () => {
    const at = (selected: number): GameState => ({ kind: 'settings', selected, editing: null });
    const last = SETTINGS_ROWS.length - 1;
    expect(moveSelection(at(0), 1)).toEqual(at(1));
    expect(moveSelection(at(0), -1)).toEqual(at(last));
    expect(moveSelection(at(last), 1)).toEqual(at(0));
    expect(selectEntry(at(0), 3)).toEqual(at(3));
    const same = at(2);
    expect(selectEntry(same, 2)).toBe(same);
    expect(selectEntry(same, SETTINGS_ROWS.length)).toBe(same);
    const typing: GameState = { kind: 'settings', selected: 0, editing: { text: 'w', tooShort: false } };
    expect(moveSelection(typing, 1)).toBe(typing);
    expect(selectEntry(typing, 2)).toBe(typing);
  });

  it('opens the garage from its entry without loading, and goes back to it on Escape', () => {
    const entry = MENU_ENTRIES.findIndex((e) => e.label === 'garage');
    expect(screenEntry('garage')).toBe(entry);
    const opened = pressEnter({ kind: 'menu', selected: entry });
    expect(opened).toEqual({ kind: 'garage', selected: 0 });
    expect(opened).toBe(GARAGE);
    expect(pressEscape(opened)).toEqual({ kind: 'menu', selected: entry });
    expect(pressEnter(opened)).toBe(opened);
    expect(afterTick(opened, null, 1000)).toBe(opened);
  });

  it('moves and points at the garage rows, wrapping round', () => {
    const at = (selected: number): GameState => ({ kind: 'garage', selected });
    expect(moveSelection(at(0), 1)).toEqual(at(1));
    expect(moveSelection(at(1), 1)).toEqual(at(0));
    expect(moveSelection(at(0), -1)).toEqual(at(1));
    expect(selectEntry(at(0), 1)).toEqual(at(1));
    const same = at(1);
    expect(selectEntry(same, 1)).toBe(same);
    expect(selectEntry(same, 2)).toBe(same);
    expect(selectEntry(same, -1)).toBe(same);
  });
});
