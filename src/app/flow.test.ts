import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from '../game/car.ts';
import { NO_INPUT } from '../game/carInput.ts';
import { DEFAULT_CITY_SETTINGS } from '../game/city.ts';
import { goTick } from '../game/race.ts';
import { createWorld, START_HEADING, startJunction, stepWorld } from '../game/world.ts';
import { cityRoute, enterState } from './flow.ts';
import { DEFAULT_RACE_MODE, MENU, preRace, type GameState } from './gameState.ts';

const RACE: GameState = { kind: 'race', mode: DEFAULT_RACE_MODE };

describe('game state flow', () => {
  const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, false);
  const route = cityRoute(world)!;

  it('gives the city seed route', () => {
    expect(route).not.toBeNull();
    expect(route.seed).toBe(DEFAULT_CITY_SETTINGS.seed);
  });

  it('stands the car on the route start before the race, with no race yet', () => {
    for (let i = 0; i < 10; i++) stepWorld(world, NO_INPUT);
    const state = preRace(DEFAULT_RACE_MODE, route);
    enterState(world, state, MENU);
    expect(world.race).toBeNull();
    expect([world.car.x, world.car.z, world.car.heading]).toEqual([route.pose.x, route.pose.z, route.pose.heading]);
    expect(world.previousCar).toEqual(world.car);
    stepWorld(world, NO_INPUT);
    expect([world.car.x, world.car.z]).toEqual([route.pose.x, route.pose.z]);

    const tick = world.tick;
    enterState(world, RACE, state);
    expect(world.race?.route).toBe(route);
    expect(world.race?.phase).toBe('countdown');
    expect(goTick(world.race!)).toBeGreaterThan(tick);
  });

  it('clears the race and stands the car on the middle junction on the menu', () => {
    enterState(world, MENU, RACE);
    const { x, z } = startJunction(world.city);
    expect(world.race).toBeNull();
    expect([world.car.x, world.car.z, world.car.heading]).toEqual([x, z, START_HEADING]);
    expect(world.previousCar).toEqual(world.car);
  });

  it('leaves the world alone when the results come up', () => {
    enterState(world, preRace(DEFAULT_RACE_MODE, route), MENU);
    enterState(world, RACE, preRace(DEFAULT_RACE_MODE, route));
    const race = world.race;
    const car = { ...world.car };
    enterState(world, { kind: 'results', mode: DEFAULT_RACE_MODE, ticks: 0 }, RACE);
    expect(world.race).toBe(race);
    expect(world.car).toEqual(car);
  });
});
