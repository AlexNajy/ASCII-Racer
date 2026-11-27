import { raceTicks, type Race } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { FINISH_SHOWN_TICKS } from '../hud/raceHud.ts';
import { FIRST_ENTRY, isMenuScreen, MENU_ENTRIES, screenEntry, wrapEntry, type MenuScreen } from './mainMenu.ts';
import { GARAGE_ROWS, wrapGarageRow } from './garageMenu.ts';
import { selectSettingsRow, wrapSettingsRow, type SettingsScreen } from './settingsMenu.ts';

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
  | { kind: 'results'; mode: RaceMode; route: Route; ticks: number; selected: number } // index into RESULTS_OPTIONS
  | ({ kind: 'settings' } & SettingsScreen)
  | { kind: 'garage'; selected: number } // index into GARAGE_ROWS
  | { kind: 'loading'; mode: RaceMode }; // a new city and route being made for a race of this mode

export type GameStateKind = GameState['kind'];

// The results follow the finish once the finish banner has been seen.
export const RESULTS_AFTER_TICKS = FINISH_SHOWN_TICKS;

export const MENU: GameState = { kind: 'menu', selected: FIRST_ENTRY };
export const SETTINGS: GameState = { kind: 'settings', selected: 0, editing: null };
export const GARAGE: GameState = { kind: 'garage', selected: 0 };
const SCREEN_STATES: Record<MenuScreen, GameState> = { garage: GARAGE, settings: SETTINGS };

export function preRace(mode: RaceMode, route: Route): GameState {
  return { kind: 'preRace', mode, route };
}

export function race(mode: RaceMode, route: Route | null): GameState {
  return { kind: 'race', mode, route };
}

export function loading(mode: RaceMode): GameState {
  return { kind: 'loading', mode };
}

// Once the city is built: its race, or the menu when no city with a route was found.
export function loaded(state: GameState, route: Route | null): GameState {
  if (state.kind !== 'loading') return state;
  return route ? race(state.mode, route) : MENU;
}

function optionCount(state: GameState): number {
  if (state.kind === 'menu') return MENU_ENTRIES.length;
  if (state.kind === 'garage') return GARAGE_ROWS.length;
  return state.kind === 'results' ? RESULTS_OPTIONS.length : 0;
}

// The menu's, the finish screen's, the garage's or the settings' selection moved by `step` (up is -1), wrapping round. Other states
// are left alone, and so are the settings while the nickname is being typed.
export function moveSelection(state: GameState, step: number): GameState {
  if (state.kind === 'menu') return selectEntry(state, wrapEntry(state.selected + step));
  if (state.kind === 'garage') return selectEntry(state, wrapGarageRow(state.selected + step));
  if (state.kind === 'settings') {
    if (state.editing || step === 0) return state;
    return { ...state, selected: wrapSettingsRow(state.selected + step) };
  }
  if (state.kind !== 'results') return state;
  const count = RESULTS_OPTIONS.length;
  return selectEntry(state, (((state.selected + step) % count) + count) % count);
}

// The pointer over an entry selects it; the same state back when nothing changes.
export function selectEntry(state: GameState, index: number): GameState {
  if (state.kind === 'settings') {
    const screen = selectSettingsRow(state, index);
    return screen === state ? state : { ...state, ...screen };
  }
  if (state.kind !== 'menu' && state.kind !== 'results' && state.kind !== 'garage') return state;
  if (index === state.selected || !Number.isInteger(index) || index < 0 || index >= optionCount(state)) return state;
  return { ...state, selected: index };
}

// Enter. A new race needs a new city and route, so the menu's race entries and `next` go to the loading state.
export function pressEnter(state: GameState): GameState {
  switch (state.kind) {
    case 'menu': {
      const opens = MENU_ENTRIES[state.selected]?.opens;
      if (!opens) return state;
      return isMenuScreen(opens) ? SCREEN_STATES[opens] : loading(opens);
    }
    case 'preRace':
      return race(state.mode, state.route);
    case 'race':
    case 'garage': // Left and Right change the car, Enter nothing
    case 'settings': // its keys are settingsKey's
    case 'loading':
      return state;
    case 'results': {
      const option = RESULTS_OPTIONS[state.selected];
      if (option === 'again') return race(state.mode, state.route);
      return option === 'menu' ? MENU : loading(state.mode);
    }
  }
}

// Back to the menu, from the garage and the settings with their entry selected again; a nickname being typed is only
// dropped. Ignored while a city loads.
export function pressEscape(state: GameState): GameState {
  if (state.kind === 'loading') return state;
  if (state.kind === 'garage') return { kind: 'menu', selected: screenEntry('garage') };
  if (state.kind === 'settings') return state.editing ? { ...state, editing: null } : { kind: 'menu', selected: screenEntry('settings') };
  return state.kind === 'menu' ? state : MENU;
}

// After each tick: a finished race moves on to its results RESULTS_AFTER_TICKS after the finish.
export function afterTick(state: GameState, current: Race | null, tick: number): GameState {
  if (state.kind !== 'race' || current?.phase !== 'finished' || tick - current.finishTick < RESULTS_AFTER_TICKS) return state;
  return { kind: 'results', mode: state.mode, route: current.route, ticks: raceTicks(current, tick), selected: FIRST_OPTION };
}
