import { createCar, DEFAULT_CAR_SETTINGS, type CarSettings } from '../game/car.ts';
import { generateCity, type CitySettings } from '../game/city.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute, RouteError, type Route } from '../game/route.ts';
import { clearRace, START_HEADING, startJunction, startRace, type World } from '../game/world.ts';
import type { GameState } from './gameState.ts';

// What a change of game state does to the world. No WebGL or DOM.

function standCar(world: World, x: number, z: number, heading: number): void {
  world.car = createCar(x, z, heading);
  world.previousCar = { ...world.car };
}

// The city seed's route, null when the city can't hold one (the URL parameter state=).
export function cityRoute(world: World): Route | null {
  try {
    return generateRoute(world.roadGraph, world.citySettings.seed);
  } catch (error) {
    if (!(error instanceof RouteError)) throw error;
    return null;
  }
}

// Unlimited's city seeds are 1 to this.
export const UNLIMITED_SEEDS = 1_000_000;
// Seeds tried for a city that holds a route before giving up.
export const UNLIMITED_TRIES = 10;

// App flow, not generation: the one place a random seed is right.
export function randomCitySeed(): number {
  return 1 + Math.floor(Math.random() * UNLIMITED_SEEDS);
}

// The route of a city seed (route seed = city seed), from the road graph alone, so no buildings are generated for a
// seed that fails. Throws a RouteError when the city can't hold one.
export function seedRoute(settings: CitySettings, seed: number): Route {
  return generateRoute(roadGraph(generateCity({ ...settings, seed })), seed);
}

// Unlimited's next race: seeds from `pickSeed` until one holds a route, null after `tries`. The caller then builds
// that seed's city (route.seed).
export function unlimitedRoute(pickSeed: () => number, routeFor: (seed: number) => Route, tries = UNLIMITED_TRIES): Route | null {
  for (let i = 0; i < tries; i++) {
    try {
      return routeFor(pickSeed());
    } catch (error) {
      if (!(error instanceof RouteError)) throw error;
    }
  }
  return null;
}

// The daily and the lobbies are driven with these whatever the dev menu holds, so every player's car handles alike
// (the daily's run replays the same on a server).
export const DAILY_CAR_SETTINGS: Readonly<CarSettings> = Object.freeze({ ...DEFAULT_CAR_SETTINGS });

// The car settings the world drives with in a state: the fixed ones in every daily screen and in the lobby, else the
// dev menu's.
export function carSettingsFor(state: GameState, devSettings: CarSettings): CarSettings {
  const fixed =
    state.kind === 'preRace' ||
    state.kind === 'dailyResults' ||
    state.kind === 'lobby' ||
    ((state.kind === 'race' || state.kind === 'loading') && (state.mode === 'daily' || state.mode === 'lobby'));
  return fixed ? DAILY_CAR_SETTINGS : devSettings;
}

// The menu stands the car on the middle junction with no race; the pre-race screen stands it on the route's start
// with no race yet; the race starts its route (countdown from this tick). Loading drops the old race, whose gates mean
// nothing in the next city, and so does a daily that did not finish.
export function enterState(world: World, next: GameState, previous: GameState): void {
  switch (next.kind) {
    case 'menu': {
      clearRace(world);
      const { x, z } = startJunction(world.city);
      standCar(world, x, z, START_HEADING);
      return;
    }
    case 'preRace': {
      clearRace(world);
      const { x, z, heading } = next.route.pose;
      standCar(world, x, z, heading);
      return;
    }
    case 'loading':
      clearRace(world);
      return;
    case 'lobby': {
      clearRace(world);
      const { x, z } = startJunction(world.city);
      standCar(world, x, z, START_HEADING);
      return;
    }
    case 'race':
      if (next.route && previous.kind !== 'race') startRace(world, next.route);
      return;
    case 'dailyResults':
      if (next.ticks === null) clearRace(world);
      return;
    case 'results':
    case 'garage': // reached from the menu, the car stays where the menu stood it; the garage turns its own
    case 'settings':
    case 'createLobby':
      return;
  }
}
