import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from './car.ts';
import { NO_INPUT } from './carInput.ts';
import { DEFAULT_CITY_SETTINGS, type CitySettings } from './city.ts';
import { TICKS_PER_SECOND } from './clock.ts';
import { driveRace, type DrivenRace } from './driver.ts';
import { COUNTDOWN_TICKS } from './race.ts';
import { runReference } from './referenceRun.ts';
import { ROUTE_LENGTHS, type RouteLengthName } from './route.ts';
import { createRaceWorld, stepWorld, type World } from './world.ts';

const MIN_PACE = 18; // m/s along the route: a good pace, not a crawl (the driver averages about 22)
const TICK_LIMIT_PACE = 10; // m/s: a race slower than this on average is given up as not finished

interface Case {
  name: string;
  seed: number;
  length: RouteLengthName;
  blocksPerSide?: number;
}

// City seed and route seed are the same, as the daily uses them.
const CASES: Case[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed): Case => ({ name: `city ${seed}, medium`, seed, length: 'medium' })),
  { name: 'city 13, short', seed: 13, length: 'short' },
  { name: 'city 14, long', seed: 14, length: 'long' },
  { name: '6×6 city 15, short', seed: 15, length: 'short', blocksPerSide: 6 },
  { name: '10×10 city 16, long', seed: 16, length: 'long', blocksPerSide: 10 },
];

function raceWorld(seed: number, length: RouteLengthName = 'medium', blocksPerSide = DEFAULT_CITY_SETTINGS.blocksPerSide): World {
  const settings: CitySettings = { ...DEFAULT_CITY_SETTINGS, seed, blocksPerSide };
  return createRaceWorld(settings, { ...DEFAULT_CAR_SETTINGS }, seed, { length: ROUTE_LENGTHS[length] }, false);
}

function tickLimit(world: World): number {
  return COUNTDOWN_TICKS + Math.ceil((world.race!.route.length / TICK_LIMIT_PACE) * TICKS_PER_SECOND);
}

// Every gate in order, then the finish, each once.
function expectGatesInOrder(result: DrivenRace, gates: number): void {
  const passed = result.events.filter((event) => event.kind !== 'go').map((event) => [event.kind, event.gate]);
  expect(passed).toEqual(Array.from({ length: gates }, (_, i) => [i === gates - 1 ? 'finish' : 'gate', i]));
}

describe('test driver', { timeout: 30000 }, () => {
  it.each(CASES)('finishes the route in $name at a good pace, every gate in order, without getting stuck', ({ seed, length, blocksPerSide }) => {
    const world = raceWorld(seed, length, blocksPerSide);
    const route = world.race!.route;
    const result = driveRace(world, tickLimit(world));
    expect(result.finished).toBe(true);
    expectGatesInOrder(result, route.gates.length);
    expect(result.backOuts).toBe(0);
    expect(route.length / (result.raceTicks / TICKS_PER_SECOND)).toBeGreaterThan(MIN_PACE);
  });

  it.each([
    ['backwards', Math.PI, true],
    ['facing the kerb', -Math.PI / 2, false],
  ])('finishes when the car starts %s', (_, turn, backsOut) => {
    const world = raceWorld(2);
    for (let i = 0; i < COUNTDOWN_TICKS; i++) stepWorld(world, NO_INPUT);
    world.car.heading += turn;
    world.previousCar = { ...world.car };
    const result = driveRace(world, tickLimit(world));
    expect(result.finished).toBe(true);
    expectGatesInOrder(result, world.race!.route.gates.length);
    expect(result.backOuts > 0).toBe(backsOut);
  });

  // Driven once, shared by the two tests below.
  let recorded: { world: World; result: DrivenRace } | null = null;
  const recordedRace = () => {
    if (!recorded) {
      const world = raceWorld(1);
      recorded = { world, result: driveRace(world, tickLimit(world)) };
    }
    return recorded;
  };

  it('records inputs that replay to the same finish in a separately built world', () => {
    const { world: driven, result } = recordedRace();
    const replayed = raceWorld(1);
    runReference(replayed, result.inputs);
    expect(replayed.race!.phase).toBe('finished');
    expect(replayed.race!.finishTick).toBe(driven.race!.finishTick);
    expect(replayed.car).toEqual(driven.car);
  });

  // Update on purpose only: the first complete race on record, which a server checking runs must agree with.
  const DRIVEN_RACE_HASH = 3683511602;

  it('matches the stored hash of the driven race in city 1 on route 1', () => {
    const { hash } = runReference(raceWorld(1), recordedRace().result.inputs);
    expect(
      hash,
      [
        `Driven race hash for city 1, route 1 changed (${hash}, stored ${DRIVEN_RACE_HASH}).`,
        'The simulation, city or route generation, or the test driver now gives a different race. That is only fine',
        'if it was meant: a recorded race no longer replays the same, so times recorded before it are void.',
        'If it was meant, replace DRIVEN_RACE_HASH in src/game/driver.test.ts with the new hash',
        '(and bump the simulation version once it exists). If not, find what changed.',
      ].join('\n'),
    ).toBe(DRIVEN_RACE_HASH);
  });
});
