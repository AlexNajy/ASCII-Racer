import { raceTicks, type Race } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { FINISH_SHOWN_TICKS } from '../hud/raceHud.ts';

// App flow, not simulation: which screen the game is on. Plain data and pure transitions; main.ts does what a
// change of state means for the world (placing the car, starting the race).

// What a race belongs to. Only the city seed's route for now; daily, unlimited and lobby join this list.
export type RaceMode = 'cityRoute';
export const DEFAULT_RACE_MODE: RaceMode = 'cityRoute';

export type GameState =
  | { kind: 'menu' }
  | { kind: 'preRace'; mode: RaceMode; route: Route }
  | { kind: 'race'; mode: RaceMode }
  | { kind: 'results'; mode: RaceMode; ticks: number };

export type GameStateKind = GameState['kind'];

// The results follow the finish once the finish banner has been seen.
export const RESULTS_AFTER_TICKS = FINISH_SHOWN_TICKS;

export const MENU: GameState = { kind: 'menu' };

export function preRace(mode: RaceMode, route: Route): GameState {
  return { kind: 'preRace', mode, route };
}

// Enter: the menu needs a route for the race it opens, so it is passed in; null (no route fits the city) stays.
export function pressEnter(state: GameState, menuRoute: () => Route | null): GameState {
  switch (state.kind) {
    case 'menu': {
      const route = menuRoute();
      return route ? preRace(DEFAULT_RACE_MODE, route) : state;
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
