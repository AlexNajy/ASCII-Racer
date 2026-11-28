import { raceTicks, type Race } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { FINISH_SHOWN_TICKS } from '../hud/raceHud.ts';
import { FIRST_ENTRY, isMenuScreen, MENU_ENTRIES, screenEntry, wrapEntry, type MenuScreen } from './mainMenu.ts';
import type { LobbySettings } from '../game/lobbySettings.ts';
import { createLobbyScreen, selectLobbyRow, wrapLobbyRow, type CreateLobbyScreen, type LobbyDraft } from './createLobbyMenu.ts';
import { GARAGE_ROWS, wrapGarageRow } from './garageMenu.ts';
import { selectSettingsRow, wrapSettingsRow, type SettingsScreen } from './settingsMenu.ts';

// App flow, not simulation: which screen the game is on. Plain data and pure transitions; main.ts does what a
// change of state means for the world (placing the car, starting the race, building a new city).

// What a race belongs to. Lobby joins this list.
export type RaceMode = 'unlimited' | 'daily';

// The finish screen's options, in the spec's order.
export const RESULTS_OPTIONS = ['again', 'next', 'menu'] as const;
export type ResultsOption = (typeof RESULTS_OPTIONS)[number];
export const FIRST_OPTION = 0; // again

export type GameState =
  | { kind: 'menu'; selected: number } // index into MENU_ENTRIES
  | { kind: 'preRace'; day: number; route: Route } // the daily's, before its one try
  | { kind: 'race'; mode: 'unlimited'; route: Route | null } // null: free driving, only from the URL parameter race=0
  // `day` is fixed when the pre-race screen opens; `givingUp` while Esc waits for Enter to confirm; `finished` from
  // the finish on, with the time
  | { kind: 'race'; mode: 'daily'; day: number; route: Route; givingUp: boolean; finished: number | null }
  | { kind: 'results'; mode: 'unlimited'; route: Route; ticks: number; selected: number } // index into RESULTS_OPTIONS
  // null: did not finish; `selected` indexes the entries: `share` (finished only) and then `menu` / `play`
  | { kind: 'dailyResults'; day: number; ticks: number | null; selected: number }
  | ({ kind: 'settings' } & SettingsScreen)
  | { kind: 'garage'; selected: number } // index into GARAGE_ROWS
  | ({ kind: 'createLobby' } & CreateLobbyScreen)
  // The host in the lobby's city, driving freely. `code` and `settings` are what other players are told.
  | { kind: 'lobby'; role: 'host'; code: string; settings: LobbySettings }
  | { kind: 'loading'; mode: 'unlimited' } // a new city and route being made for an unlimited race
  | { kind: 'loading'; mode: 'lobby'; draft: LobbyDraft } // the lobby's city being built; a random seed is picked then
  | { kind: 'loading'; mode: 'daily'; day: number; route: Route }; // the day's city being built for its route

export type GameStateKind = GameState['kind'];
export type DailyRaceState = Extract<GameState, { kind: 'race'; mode: 'daily' }>;

// The results follow the finish once the finish banner has been seen.
export const RESULTS_AFTER_TICKS = FINISH_SHOWN_TICKS;

export const MENU: GameState = { kind: 'menu', selected: FIRST_ENTRY };
export const SETTINGS: GameState = { kind: 'settings', selected: 0, editing: null };
export const GARAGE: GameState = { kind: 'garage', selected: 0 };
export const CREATE_LOBBY: GameState = { kind: 'createLobby', ...createLobbyScreen() };
const SCREEN_STATES: Record<MenuScreen, GameState> = { garage: GARAGE, settings: SETTINGS, createLobby: CREATE_LOBBY };

// The menu with the entry of a screen or race mode selected, for coming back from it.
export function menuAt(entry: MenuScreen | RaceMode): GameState {
  return { kind: 'menu', selected: screenEntry(entry) };
}

export function preRace(day: number, route: Route): GameState {
  return { kind: 'preRace', day, route };
}

export function race(mode: 'unlimited', route: Route | null): GameState {
  return { kind: 'race', mode, route };
}

export function dailyRacing(day: number, route: Route): DailyRaceState {
  return { kind: 'race', mode: 'daily', day, route, givingUp: false, finished: null };
}

export function dailyResults(day: number, ticks: number | null, selected = FIRST_DAILY_ENTRY): GameState {
  return { kind: 'dailyResults', day, ticks, selected };
}

// A finished try offers `share` before `menu`; one that did not finish only `menu`. The first is selected.
export const FIRST_DAILY_ENTRY = 0;
export function dailyEntryCount(ticks: number | null): number {
  return ticks === null ? 1 : 2;
}

// Whether the selected entry of the daily results is `share`.
export function picksShare(state: GameState): boolean {
  return state.kind === 'dailyResults' && state.ticks !== null && state.selected === 0;
}

export function loading(mode: 'unlimited'): GameState {
  return { kind: 'loading', mode };
}

export function loadingLobby(draft: LobbyDraft): GameState {
  return { kind: 'loading', mode: 'lobby', draft };
}

export function hostLobby(code: string, settings: LobbySettings): GameState {
  return { kind: 'lobby', role: 'host', code, settings };
}

export function loadingDaily(day: number, route: Route): GameState {
  return { kind: 'loading', mode: 'daily', day, route };
}

// Once the city is built: unlimited's race, the daily's pre-race screen, or the menu when no city with a route was
// found.
export function loaded(state: GameState, route: Route | null): GameState {
  if (state.kind !== 'loading') return state;
  if (state.mode === 'lobby') return menuAt('createLobby'); // a lobby needs no route: hostLobby is its way out of loading
  if (state.mode === 'daily') return route ? preRace(state.day, route) : MENU;
  return route ? race(state.mode, route) : menuAt('unlimited');
}

function optionCount(state: GameState): number {
  if (state.kind === 'menu') return MENU_ENTRIES.length;
  if (state.kind === 'garage') return GARAGE_ROWS.length;
  if (state.kind === 'dailyResults') return dailyEntryCount(state.ticks);
  return state.kind === 'results' ? RESULTS_OPTIONS.length : 0;
}

// The menu's, the finish screen's, the garage's or the settings' selection moved by `step` (up is -1), wrapping round. Other states
// are left alone, and so are the settings while the nickname is being typed.
export function moveSelection(state: GameState, step: number): GameState {
  if (state.kind === 'menu') return selectEntry(state, wrapEntry(state.selected + step));
  if (state.kind === 'garage') return selectEntry(state, wrapGarageRow(state.selected + step));
  if (state.kind === 'createLobby') return state.editing || step === 0 ? state : { ...state, selected: wrapLobbyRow(state.selected + step) };
  if (state.kind === 'settings') {
    if (state.editing || step === 0) return state;
    return { ...state, selected: wrapSettingsRow(state.selected + step) };
  }
  if (state.kind !== 'results' && state.kind !== 'dailyResults') return state;
  const count = optionCount(state);
  return selectEntry(state, (((state.selected + step) % count) + count) % count);
}

// The pointer over an entry selects it; the same state back when nothing changes.
export function selectEntry(state: GameState, index: number): GameState {
  if (state.kind === 'createLobby') {
    const screen = selectLobbyRow(state, index);
    return screen === state ? state : { ...state, ...screen };
  }
  if (state.kind === 'settings') {
    const screen = selectSettingsRow(state, index);
    return screen === state ? state : { ...state, ...screen };
  }
  if (state.kind !== 'menu' && state.kind !== 'results' && state.kind !== 'garage' && state.kind !== 'dailyResults') return state;
  if (index === state.selected || !Number.isInteger(index) || index < 0 || index >= optionCount(state)) return state;
  return { ...state, selected: index };
}

// Enter where it opens the daily: on the menu's daily entry, and on the daily results once the next day has begun.
// What it opens needs the clock and the stored try, so it is dailyEntry's (dailyFlow.ts), not pressEnter's.
export function opensDaily(state: GameState, today: number): boolean {
  if (state.kind === 'menu') return MENU_ENTRIES[state.selected]?.opens === 'daily';
  return state.kind === 'dailyResults' && today > state.day && !picksShare(state);
}

// The daily race given up (or run past the timer's cap): it did not finish.
export function giveUp(state: GameState): GameState {
  return state.kind === 'race' && state.mode === 'daily' ? dailyResults(state.day, null) : state;
}

// The daily race's finish has been crossed: no giving up any more.
export function raceFinished(state: GameState, ticks: number): GameState {
  return state.kind === 'race' && state.mode === 'daily' && state.finished === null ? { ...state, givingUp: false, finished: ticks } : state;
}

// Enter. A new unlimited race needs a new city and route, so the menu's unlimited and `next` go to the loading state.
// The daily entry is left to dailyEntry (see opensDaily). `canAsk`: whether the give-up question can be shown now;
// a question that can't be seen is never confirmed.
export function pressEnter(state: GameState, canAsk = true): GameState {
  switch (state.kind) {
    case 'menu': {
      const opens = MENU_ENTRIES[state.selected]?.opens;
      if (!opens || opens === 'daily') return state;
      return isMenuScreen(opens) ? SCREEN_STATES[opens] : loading(opens);
    }
    case 'preRace':
      return dailyRacing(state.day, state.route);
    case 'race':
      return state.mode === 'daily' && state.givingUp && canAsk ? giveUp(state) : state;
    case 'garage': // Left and Right change the car, Enter nothing
    case 'settings': // its keys are settingsKey's
    case 'createLobby': // its keys are createLobbyKey's
    case 'lobby':
    case 'loading':
      return state;
    case 'results': {
      const option = RESULTS_OPTIONS[state.selected];
      if (option === 'again') return race(state.mode, state.route);
      return option === 'menu' ? menuAt('unlimited') : loading(state.mode);
    }
    case 'dailyResults': // sharing is main.ts's: it copies and stays
      return picksShare(state) ? state : MENU;
  }
}

// Back to the menu, with the entry the screen came from selected; from the garage and the settings with their entry
// selected again; a nickname or seed being typed is only dropped. In the daily race Esc asks first and a second Esc keeps
// driving (Enter gives up), and it doesn't ask when the question can't be shown (`canAsk`); after its finish it goes
// straight to the results. Ignored while a city loads.
export function pressEscape(state: GameState, canAsk = true): GameState {
  switch (state.kind) {
    case 'loading':
    case 'menu':
      return state;
    case 'garage':
      return menuAt('garage');
    case 'settings':
      return state.editing ? { ...state, editing: null } : menuAt('settings');
    case 'createLobby':
      return state.editing ? { ...state, editing: null } : menuAt('createLobby');
    case 'lobby': // the lobby closes; no question asked yet
      return menuAt('createLobby');
    case 'race':
      if (state.mode === 'unlimited') return menuAt('unlimited');
      if (state.finished !== null) return dailyResults(state.day, state.finished);
      return state.givingUp || canAsk ? { ...state, givingUp: !state.givingUp } : state;
    case 'results':
      return menuAt('unlimited');
    case 'preRace':
    case 'dailyResults':
      return MENU;
  }
}

// After each tick: a finished race moves on to its results RESULTS_AFTER_TICKS after the finish.
export function afterTick(state: GameState, current: Race | null, tick: number): GameState {
  if (state.kind !== 'race' || current?.phase !== 'finished' || tick - current.finishTick < RESULTS_AFTER_TICKS) return state;
  const ticks = raceTicks(current, tick);
  if (state.mode === 'daily') return dailyResults(state.day, ticks);
  return { kind: 'results', mode: state.mode, route: current.route, ticks, selected: FIRST_OPTION };
}
