import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from '../game/car.ts';
import { NO_INPUT } from '../game/carInput.ts';
import { DEFAULT_CITY_SETTINGS } from '../game/city.ts';
import { createLobbyScreen } from './createLobbyMenu.ts';
import { defaultLobbySettings } from '../game/lobbySettings.ts';
import { goTick } from '../game/race.ts';
import { RouteError } from '../game/route.ts';
import { createWorld, START_HEADING, startJunction, stepWorld } from '../game/world.ts';
import {
  carSettingsFor,
  cityRoute,
  DAILY_CAR_SETTINGS,
  enterState,
  randomCitySeed,
  seedRoute,
  UNLIMITED_SEEDS,
  UNLIMITED_TRIES,
  unlimitedRoute,
} from './flow.ts';
import {
  dailyRacing,
  dailyResults,
  CREATE_LOBBY,
  FIRST_OPTION,
  GARAGE,
  hostLobby,
  loaded,
  loadingLobby,
  loading,
  loadingDaily,
  MENU,
  preRace,
  race,
  SETTINGS,
  type GameState,
} from './gameState.ts';

const DAY = 330;

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
    const state = preRace(DAY, route);
    enterState(world, state, MENU);
    expect(world.race).toBeNull();
    expect([world.car.x, world.car.z, world.car.heading]).toEqual([route.pose.x, route.pose.z, route.pose.heading]);
    expect(world.previousCar).toEqual(world.car);
    stepWorld(world, NO_INPUT);
    expect([world.car.x, world.car.z]).toEqual([route.pose.x, route.pose.z]);

    const tick = world.tick;
    enterState(world, dailyRacing(DAY, route), state);
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
    enterState(world, preRace(DAY, route), MENU);
    enterState(world, RACE, preRace(DAY, route));
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

  it('keeps a finished daily race for its results, and drops one that did not finish', () => {
    enterState(world, dailyRacing(DAY, route), MENU);
    const current = world.race;
    enterState(world, dailyResults(DAY, 1234), dailyRacing(DAY, route));
    expect(world.race).toBe(current);
    enterState(world, dailyResults(DAY, null), dailyRacing(DAY, route));
    expect(world.race).toBeNull();
  });

  it('drives freely in a race state without a route', () => {
    enterState(world, MENU, RACE);
    enterState(world, race('unlimited', null), MENU);
    expect(world.race).toBeNull();
  });
});

describe('daily car settings', () => {
  it('are the defaults, and cannot be changed', () => {
    expect(DAILY_CAR_SETTINGS).toEqual(DEFAULT_CAR_SETTINGS);
    expect(Object.isFrozen(DAILY_CAR_SETTINGS)).toBe(true);
  });

  it('drive every daily screen whatever the dev menu holds, and only those', () => {
    const edited = { ...DEFAULT_CAR_SETTINGS, topSpeed: DEFAULT_CAR_SETTINGS.topSpeed * 3, gripFollow: 0 };
    const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, edited, false);
    const route = cityRoute(world)!;
    const daily: GameState[] = [preRace(DAY, route), dailyRacing(DAY, route), dailyResults(DAY, null), loadingDaily(DAY, route)];
    for (const state of daily) expect(carSettingsFor(state, edited)).toBe(DAILY_CAR_SETTINGS);
    const others: GameState[] = [MENU, race('unlimited', route), loading('unlimited'), SETTINGS, GARAGE, CREATE_LOBBY];
    for (const state of others) expect(carSettingsFor(state, edited)).toBe(edited);
  });

  it('drive the lobby and its loading the same way', () => {
    const edited = { ...DEFAULT_CAR_SETTINGS, topSpeed: DEFAULT_CAR_SETTINGS.topSpeed * 3 };
    for (const state of [hostLobby('ABC234', defaultLobbySettings(5)), loadingLobby(createLobbyScreen().draft)]) {
      expect(carSettingsFor(state, edited)).toBe(DAILY_CAR_SETTINGS);
    }
  });
});

describe('lobby state flow', () => {
  it('stands the car on the middle junction with no race, free to drive, when the lobby opens', () => {
    const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, false);
    const route = cityRoute(world)!;
    enterState(world, race('unlimited', route), MENU);
    for (let i = 0; i < 400; i++) stepWorld(world, NO_INPUT);
    enterState(world, hostLobby('ABC234', defaultLobbySettings(1)), loadingLobby(createLobbyScreen().draft));
    const { x, z } = startJunction(world.city);
    expect(world.race).toBeNull();
    expect(world.car).toMatchObject({ x, z, heading: START_HEADING });
    expect(world.previousCar).toEqual(world.car);
    for (let i = 0; i < 60; i++) stepWorld(world, { throttle: 1, brake: 0, steer: 0, drift: 0 });
    expect(world.car.velocityX ** 2 + world.car.velocityZ ** 2).toBeGreaterThan(1);
  });

  it('leaves the world alone on the create lobby screen', () => {
    const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, false);
    for (let i = 0; i < 50; i++) stepWorld(world, { throttle: 1, brake: 0, steer: 0, drift: 0 });
    const car = { ...world.car };
    enterState(world, CREATE_LOBBY, MENU);
    expect(world.car).toEqual(car);
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
