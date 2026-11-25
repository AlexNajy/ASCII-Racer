import { createCar } from '../game/car.ts';
import { generateRoute, RouteError, type Route } from '../game/route.ts';
import { clearRace, START_HEADING, startJunction, startRace, type World } from '../game/world.ts';
import type { GameState } from './gameState.ts';

// What a change of game state does to the world. No WebGL or DOM.

function standCar(world: World, x: number, z: number, heading: number): void {
  world.car = createCar(x, z, heading);
  world.previousCar = { ...world.car };
}

// The race the menu opens: the city seed's route, null when the city can't hold one.
export function cityRoute(world: World): Route | null {
  try {
    return generateRoute(world.roadGraph, world.citySettings.seed);
  } catch (error) {
    if (!(error instanceof RouteError)) throw error;
    return null;
  }
}

// The menu stands the car on the middle junction with no race; the pre-race screen stands it on the route's start
// with no race yet; the race starts (countdown from this tick) when entered from the pre-race screen.
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
    case 'race':
      if (previous.kind === 'preRace') startRace(world, previous.route);
      return;
    case 'results':
      return;
  }
}
