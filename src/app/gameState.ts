import { raceTicks, type Race } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { FINISH_SHOWN_TICKS } from '../hud/raceHud.ts';
import { FIRST_ENTRY, MENU_ENTRIES, wrapEntry } from './mainMenu.ts';

// App flow, not simulation: which screen the game is on. Plain data and pure transitions; main.ts does what a
// change of state means for the world (placing the car, starting the race).

// What a race belongs to. Only the city seed's route for now; daily, unlimited and lobby join this list.
export type RaceMode = 'cityRoute';
export const DEFAULT_RACE_MODE: RaceMode = 'cityRoute';

export type GameState =
  | { kind: 'menu'; selected: number } // index into MENU_ENTRIES
  | { kind: 'preRace'; mode: RaceMode; route: Route }
  | { kind: 'race'; mode: RaceMode }
  | { kind: 'results'; mode: RaceMode; ticks: number };

export type GameStateKind = GameState['kind'];

// The results follow the finish once the finish banner has been seen.
export const RESULTS_AFTER_TICKS = FINISH_SHOWN_TICKS;

export const MENU: GameState = { kind: 'menu', selected: FIRST_ENTRY };

export function preRace(mode: RaceMode, route: Route): GameState {
  return { kind: 'preRace', mode, route };
}

// The menu's selection moved by `step` entries (up is -1), wrapping round. Other states are left alone.
export function moveSelection(state: GameState, step: number): GameState {
  return state.kind === 'menu' ? selectEntry(state, wrapEntry(state.selected + step)) : state;
}

// The pointer over an entry selects it; the same state back when nothing changes.
export function selectEntry(state: GameState, index: number): GameState {
  if (state.kind !== 'menu' || index === state.selected || !Number.isInteger(index) || !MENU_ENTRIES[index]) return state;
  return { kind: 'menu', selected: index };
}

// Enter: the selected menu entry opens its race, which needs a route, so it is passed in; an entry not built yet
// or no route for the city (null) stays on the menu.
export function pressEnter(state: GameState, menuRoute: () => Route | null): GameState {
  switch (state.kind) {
    case 'menu': {
      const mode = MENU_ENTRIES[state.selected]?.mode;
      if (!mode) return state;
      const route = menuRoute();
      return route ? preRace(mode, route) : state;
    }
    case 'preRace':
      return { kind: 'race', mode: state.mode };
    case 'race':
      return state;
    case 'results':
      return MENU;
  }
}

export function pressEscape(state: GameState): GameState {
  return state.kind === 'menu' ? state : MENU;
}

// After each tick: a finished race moves on to its results RESULTS_AFTER_TICKS after the finish.
export function afterTick(state: GameState, race: Race | null, tick: number): GameState {
  if (state.kind !== 'race' || race?.phase !== 'finished' || tick - race.finishTick < RESULTS_AFTER_TICKS) return state;
  return { kind: 'results', mode: state.mode, ticks: raceTicks(race, tick) };
}
