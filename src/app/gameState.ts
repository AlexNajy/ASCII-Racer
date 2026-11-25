import { raceTicks, type Race } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { FINISH_SHOWN_TICKS } from '../hud/raceHud.ts';
import { FIRST_ENTRY, MENU_ENTRIES, wrapEntry } from './mainMenu.ts';

// App flow, not simulation: which screen the game is on. Plain data and pure transitions; main.ts does what a
// change of state means for the world (placing the car, starting the race, building a new city).

// What a race belongs to. Daily and lobby join this list.
export type RaceMode = 'unlimited';

// The finish screen's options, in the spec's order.
export const RESULTS_OPTIONS = ['again', 'next', 'menu'] as const;
export type ResultsOption = (typeof RESULTS_OPTIONS)[number];
export const FIRST_OPTION = 0; // again

export type GameState =
  | { kind: 'menu'; selected: number } // index into MENU_ENTRIES
  | { kind: 'preRace'; mode: RaceMode; route: Route }
  | { kind: 'race'; mode: RaceMode; route: Route | null } // null: free driving, only from the URL parameter race=0
  | { kind: 'results'; mode: RaceMode; route: Route; ticks: number; selected: number }; // index into RESULTS_OPTIONS

export type GameStateKind = GameState['kind'];

// The results follow the finish once the finish banner has been seen.
export const RESULTS_AFTER_TICKS = FINISH_SHOWN_TICKS;

export const MENU: GameState = { kind: 'menu', selected: FIRST_ENTRY };

export function preRace(mode: RaceMode, route: Route): GameState {
  return { kind: 'preRace', mode, route };
}

export function race(mode: RaceMode, route: Route | null): GameState {
  return { kind: 'race', mode, route };
}

function optionCount(state: GameState): number {
  if (state.kind === 'menu') return MENU_ENTRIES.length;
  return state.kind === 'results' ? RESULTS_OPTIONS.length : 0;
}

// The menu's or the finish screen's selection moved by `step` (up is -1), wrapping round. Other states are left alone.
export function moveSelection(state: GameState, step: number): GameState {
  if (state.kind === 'menu') return selectEntry(state, wrapEntry(state.selected + step));
  if (state.kind !== 'results') return state;
  const count = RESULTS_OPTIONS.length;
  return selectEntry(state, (((state.selected + step) % count) + count) % count);
}

// The pointer over an entry selects it; the same state back when nothing changes.
export function selectEntry(state: GameState, index: number): GameState {
  if (state.kind !== 'menu' && state.kind !== 'results') return state;
  if (index === state.selected || !Number.isInteger(index) || index < 0 || index >= optionCount(state)) return state;
  return { ...state, selected: index };
}

// Enter. A new race needs a new city and route, so `newRoute` is passed in (null when none could be made); it is
// only called when one is needed. The menu stays put without one; `next` goes back to the menu.
export function pressEnter(state: GameState, newRoute: () => Route | null): GameState {
  switch (state.kind) {
    case 'menu': {
      const mode = MENU_ENTRIES[state.selected]?.mode;
      if (!mode) return state;
      const route = newRoute();
      return route ? race(mode, route) : state;
    }
    case 'preRace':
      return race(state.mode, state.route);
    case 'race':
      return state;
    case 'results': {
      const option = RESULTS_OPTIONS[state.selected];
      if (option === 'again') return race(state.mode, state.route);
      if (option === 'menu') return MENU;
      const route = newRoute();
      return route ? race(state.mode, route) : MENU;
    }
  }
}

export function pressEscape(state: GameState): GameState {
  return state.kind === 'menu' ? state : MENU;
}

// After each tick: a finished race moves on to its results RESULTS_AFTER_TICKS after the finish.
export function afterTick(state: GameState, current: Race | null, tick: number): GameState {
  if (state.kind !== 'race' || current?.phase !== 'finished' || tick - current.finishTick < RESULTS_AFTER_TICKS) return state;
  return { kind: 'results', mode: state.mode, route: current.route, ticks: raceTicks(current, tick), selected: FIRST_OPTION };
}
