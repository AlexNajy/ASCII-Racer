import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from '../game/car.ts';
import { NO_INPUT } from '../game/carInput.ts';
import { DEFAULT_CITY_SETTINGS } from '../game/city.ts';
import { goTick } from '../game/race.ts';
import { RouteError } from '../game/route.ts';
import { createWorld, START_HEADING, startJunction, stepWorld } from '../game/world.ts';
import { cityRoute, enterState, randomCitySeed, seedRoute, UNLIMITED_SEEDS, UNLIMITED_TRIES, unlimitedRoute } from './flow.ts';
import { FIRST_OPTION, loaded, loading, MENU, preRace, race } from './gameState.ts';

describe('game state flow', () => {
  const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, false);
  const route = cityRoute(world)!;
  const RACE = race('unlimited', route);

  it('gives the city seed route', () => {
    expect(route).not.toBeNull();
    expect(route.seed).toBe(DEFAULT_CITY_SETTINGS.seed);
  });

  it('stands the car on the route start before the race, with no race yet', () => {
    for (let i = 0; i < 10; i++) stepWorld(world, NO_INPUT);
    const state = preRace('unlimited', route);
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
    enterState(world, preRace('unlimited', route), MENU);
    enterState(world, RACE, preRace('unlimited', route));
    const current = world.race;
    const car = { ...world.car };
    enterState(world, { kind: 'results', mode: 'unlimited', route, ticks: 0, selected: FIRST_OPTION }, RACE);
    expect(world.race).toBe(current);
    expect(world.car).toEqual(car);
  });

  it('starts the race straight from the menu or the finish screen, again on the same route from its start', () => {
    enterState(world, MENU, RACE);
    enterState(world, RACE, MENU);
    expect(world.race?.route).toBe(route);
    expect([world.car.x, world.car.z, world.car.heading]).toEqual([route.pose.x, route.pose.z, route.pose.heading]);
    for (let i = 0; i < 300; i++) stepWorld(world, { ...NO_INPUT, throttle: 1 });
    world.race!.nextGate = 2;
    const tick = world.tick;
    enterState(world, RACE, { kind: 'results', mode: 'unlimited', route, ticks: 0, selected: FIRST_OPTION });
    expect(world.race?.route).toBe(route);
    expect(world.race?.startTick).toBe(tick);
    expect(world.race?.nextGate).toBe(0);
    expect(world.race?.phase).toBe('countdown');
    expect([world.car.x, world.car.z, world.car.velocityX, world.car.velocityZ]).toEqual([route.pose.x, route.pose.z, 0, 0]);
  });

  it('drops the finished race while loading, then starts the new one from loading', () => {
    enterState(world, RACE, MENU);
    const results = { kind: 'results', mode: 'unlimited', route, ticks: 0, selected: FIRST_OPTION } as const;
    enterState(world, loading('unlimited'), results);
    expect(world.race).toBeNull();
    const tick = world.tick;
    enterState(world, loaded(loading('unlimited'), route), loading('unlimited'));
    expect(world.race?.route).toBe(route);
    expect(world.race?.startTick).toBe(tick);
    expect([world.car.x, world.car.z, world.car.heading]).toEqual([route.pose.x, route.pose.z, route.pose.heading]);
  });

  it('drives freely in a race state without a route', () => {
    enterState(world, MENU, RACE);
    enterState(world, race('unlimited', null), MENU);
    expect(world.race).toBeNull();
  });
});

describe('unlimited', () => {
  it('gives the route of a city seed, with the route seed the city seed', () => {
    const route = seedRoute(DEFAULT_CITY_SETTINGS, 1234);
    expect(route.seed).toBe(1234);
    const world = createWorld({ ...DEFAULT_CITY_SETTINGS, seed: 1234 }, { ...DEFAULT_CAR_SETTINGS }, false);
    expect(cityRoute(world)).toEqual(route);
  });

  it('takes the first picked seed that holds a route', () => {
    const picks = [7, 8, 9];
    const route = unlimitedRoute(() => picks.shift()!, (seed) => seedRoute(DEFAULT_CITY_SETTINGS, seed));
    expect(route?.seed).toBe(7);
    expect(picks).toEqual([8, 9]);
  });

  it('skips seeds whose city has no route', () => {
    const picks = [3, 4, 5];
    const tried: number[] = [];
    const route = unlimitedRoute(
      () => picks.shift()!,
      (seed) => {
        tried.push(seed);
        if (seed !== 5) throw new RouteError('too small');
        return seedRoute(DEFAULT_CITY_SETTINGS, seed);
      },
    );
    expect(tried).toEqual([3, 4, 5]);
    expect(route?.seed).toBe(5);
  });

  it('gives up after a bounded number of seeds', () => {
    let picked = 0;
    const route = unlimitedRoute(
      () => ++picked,
      () => {
        throw new RouteError('too small');
      },
    );
    expect(route).toBeNull();
    expect(picked).toBe(UNLIMITED_TRIES);
  });

  it('passes other errors on', () => {
    expect(() =>
      unlimitedRoute(
        () => 1,
        () => {
          throw new Error('broken');
        },
      ),
    ).toThrow('broken');
  });

  it('picks whole seeds from 1 to UNLIMITED_SEEDS', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomCitySeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(UNLIMITED_SEEDS);
    }
  });
});
