import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { createRace, goTick } from '../game/race.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import {
  afterTick,
  DEFAULT_RACE_MODE,
  MENU,
  moveSelection,
  preRace,
  pressEnter,
  pressEscape,
  RESULTS_AFTER_TICKS,
  selectEntry,
  type GameState,
} from './gameState.ts';
import { entryEnabled, FIRST_ENTRY, MENU_ENTRIES } from './mainMenu.ts';

const route = generateRoute(roadGraph(generateCity({ ...DEFAULT_CITY_SETTINGS })), 1);
const PRE_RACE = preRace(DEFAULT_RACE_MODE, route);
const RACE: GameState = { kind: 'race', mode: DEFAULT_RACE_MODE };
const RESULTS: GameState = { kind: 'results', mode: DEFAULT_RACE_MODE, ticks: 100 };

describe('game state', () => {
  it('goes menu, pre-race, race on Enter, carrying the route and the mode', () => {
    const next = pressEnter(MENU, () => route);
    expect(next).toEqual(PRE_RACE);
    expect(pressEnter(PRE_RACE, () => null)).toEqual(RACE);
  });

  it('stays on the menu when no route fits the city', () => {
    expect(pressEnter(MENU, () => null)).toBe(MENU);
  });

  it('ignores Enter while racing and goes from the results back to the menu', () => {
    expect(pressEnter(RACE, () => route)).toBe(RACE);
    expect(pressEnter(RESULTS, () => route)).toEqual(MENU);
  });

  it('asks for a route only on the menu', () => {
    const ask = () => {
      throw new Error('asked');
    };
    for (const state of [PRE_RACE, RACE, RESULTS]) expect(() => pressEnter(state, ask)).not.toThrow();
  });

  it('goes back to the menu on Escape from every other state', () => {
    for (const state of [PRE_RACE, RACE, RESULTS]) expect(pressEscape(state)).toEqual(MENU);
    expect(pressEscape(MENU)).toBe(MENU);
  });

  it('shows the results RESULTS_AFTER_TICKS after the finish, with the race time', () => {
    const race = createRace(route, 50);
    expect(afterTick(RACE, race, goTick(race) + 10)).toBe(RACE);
    race.phase = 'finished';
    race.finishTick = goTick(race) + 1234;
    expect(afterTick(RACE, race, race.finishTick)).toBe(RACE);
    expect(afterTick(RACE, race, race.finishTick + RESULTS_AFTER_TICKS - 1)).toBe(RACE);
    expect(afterTick(RACE, race, race.finishTick + RESULTS_AFTER_TICKS)).toEqual({ kind: 'results', mode: DEFAULT_RACE_MODE, ticks: 1234 });
  });

  it('moves on by itself only from a finished race', () => {
    const race = createRace(route, 0);
    race.phase = 'finished';
    race.finishTick = goTick(race);
    const late = race.finishTick + RESULTS_AFTER_TICKS;
    for (const state of [MENU, PRE_RACE, RESULTS]) expect(afterTick(state, race, late)).toBe(state);
    expect(afterTick(RACE, null, late)).toBe(RACE);
  });

  it('starts the menu on unlimited, the only entry built so far', () => {
    expect(MENU_ENTRIES.map((entry) => entry.label)).toEqual(['daily', 'unlimited', 'join lobby', 'create lobby', 'garage', 'settings']);
    expect(FIRST_ENTRY).toBe(1);
    expect(MENU).toEqual({ kind: 'menu', selected: 1 });
    expect(MENU_ENTRIES.map((_, i) => entryEnabled(i))).toEqual([false, true, false, false, false, false]);
  });

  it('moves the selection up and down, wrapping round at both ends', () => {
    const at = (selected: number): GameState => ({ kind: 'menu', selected });
    expect(moveSelection(at(1), 1)).toEqual(at(2));
    expect(moveSelection(at(1), -1)).toEqual(at(0));
    expect(moveSelection(at(0), -1)).toEqual(at(5));
    expect(moveSelection(at(5), 1)).toEqual(at(0));
    for (const state of [PRE_RACE, RACE, RESULTS]) expect(moveSelection(state, 1)).toBe(state);
  });

  it('selects an entry under the pointer, the same state when nothing changes', () => {
    expect(selectEntry(MENU, 4)).toEqual({ kind: 'menu', selected: 4 });
    expect(selectEntry(MENU, FIRST_ENTRY)).toBe(MENU);
    for (const index of [-1, 6, 1.5]) expect(selectEntry(MENU, index)).toBe(MENU);
    expect(selectEntry(RACE, 0)).toBe(RACE);
  });

  it('does nothing on Enter over an entry not built yet, without asking for a route', () => {
    const ask = () => {
      throw new Error('asked');
    };
    for (let i = 0; i < MENU_ENTRIES.length; i++) {
      if (entryEnabled(i)) continue;
      const state: GameState = { kind: 'menu', selected: i };
      expect(pressEnter(state, ask)).toBe(state);
    }
  });

  it('goes back to the menu with the first entry selected', () => {
    expect(pressEscape(RACE)).toEqual({ kind: 'menu', selected: FIRST_ENTRY });
    const elsewhere: GameState = { kind: 'menu', selected: 4 };
    expect(pressEscape(elsewhere)).toBe(elsewhere);
  });
});
