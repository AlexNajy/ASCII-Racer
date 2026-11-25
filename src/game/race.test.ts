import { describe, expect, it } from 'vitest';
import { createCar, DEFAULT_CAR_SETTINGS, stepCar, type Car } from './car.ts';
import { NO_INPUT, type CarInput } from './carInput.ts';
import { DEFAULT_CITY_SETTINGS } from './city.ts';
import { TICK_SECONDS } from './clock.ts';
import {
  COUNTDOWN_TICKS,
  countdownShown,
  createRace,
  crossesGate,
  formatRaceTime,
  GATE_SPAN_MARGIN,
  GO_SHOWN_TICKS,
  goTick,
  raceTicks,
  advanceRace,
  type RaceEvent,
} from './race.ts';
import { hashCar, Hasher, referenceInputs, runReference } from './referenceRun.ts';
import { generateRoute, type Gate, type Route } from './route.ts';
import type { Point } from './roadGraph.ts';
import { createRaceWorld, createWorld, startRace, stepWorld, type World } from './world.ts';

const THROTTLE: CarInput = { ...NO_INPUT, throttle: 1 };
const EVERYTHING: CarInput = { throttle: 1, brake: 1, steer: 1, drift: 1 };
const HALF_PI = Math.PI / 2;
const MAX_TICKS_TO_GATE = 2000;
const PLACE_BEHIND = 2; // m behind a gate where a test puts the car
const SEARCH_SEEDS = 50;

// Generation is the slow part: one city, copied for every test with a fresh car.
const template = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS });

function freeWorld(): World {
  const car = { ...template.car };
  return { ...template, car, previousCar: { ...car }, tick: 0, race: null };
}

function raceWorld(route: Route, startTick = 0): World {
  const world = freeWorld();
  world.tick = startTick;
  startRace(world, route);
  return world;
}

function route(seed: number): Route {
  return generateRoute(template.roadGraph, seed);
}

function headingOf(direction: Point): number {
  if (direction.z < 0) return 0;
  if (direction.x < 0) return HALF_PI;
  if (direction.z > 0) return 2 * HALF_PI;
  return -HALF_PI;
}

function carAt(point: Point, direction: Point, offset: number, heading = headingOf(direction)): Car {
  return createCar(point.x + direction.x * offset, point.z + direction.z * offset, heading);
}

function hashOf(car: Car): number {
  const hasher = new Hasher();
  hashCar(hasher, car);
  return hasher.value;
}

function skipCountdown(world: World): void {
  for (let i = 0; i < COUNTDOWN_TICKS; i++) stepWorld(world, NO_INPUT);
}

// Steps with `input` until a race event or `limit` ticks; returns the event and the world tick after it.
function stepUntilEvent(world: World, input: CarInput, limit = MAX_TICKS_TO_GATE): { event: RaceEvent | null; tick: number } {
  for (let i = 0; i < limit; i++) {
    const { race } = stepWorld(world, input);
    if (race) return { event: race, tick: world.tick };
  }
  return { event: null, tick: world.tick };
}

// A route whose first gate is reached by driving straight from the pose.
function straightStart(): Route {
  for (let seed = 1; seed <= SEARCH_SEEDS; seed++) {
    const candidate = route(seed);
    const first = candidate.gates[0];
    if (candidate.legs.slice(1, first.leg + 1).every((leg) => leg.turn === 'straight')) return candidate;
  }
  throw new Error('no route with a straight start');
}

describe('race', () => {
  it('places the car on the pose, standing still, with previousCar there too', () => {
    const r = route(1);
    const world = raceWorld(r);
    expect(world.car).toEqual(createCar(r.pose.x, r.pose.z, r.pose.heading));
    expect(world.previousCar).toEqual(world.car);
    expect(world.race).toMatchObject({ phase: 'countdown', startTick: 0, nextGate: 0, finishTick: -1 });
  });

  it('holds the car bit-identical through the countdown whatever the input', () => {
    const r = route(1);
    const idle = raceWorld(r);
    const busy = raceWorld(r);
    const pose = { ...idle.car };
    const random = referenceInputs(3, COUNTDOWN_TICKS);
    for (let i = 0; i < COUNTDOWN_TICKS; i++) {
      stepWorld(idle, NO_INPUT);
      stepWorld(busy, i % 2 === 0 ? EVERYTHING : random[i]);
      expect(hashOf(busy.car)).toBe(hashOf(pose));
      expect(busy.car).toEqual(pose);
    }
    expect(hashOf(busy.previousCar)).toBe(hashOf(idle.previousCar));
    // No pre-loading: the first driven tick is the same too.
    stepWorld(idle, THROTTLE);
    stepWorld(busy, THROTTLE);
    expect(hashOf(busy.car)).toBe(hashOf(idle.car));
    expect(busy.car.velocityX !== 0 || busy.car.velocityZ !== 0).toBe(true);
  });

  it('goes on the right tick and shows 3, 2, 1, go', () => {
    const world = raceWorld(route(1));
    const race = world.race!;
    expect(countdownShown(race, 0)).toBe(3);
    expect(countdownShown(race, 59)).toBe(3);
    expect(countdownShown(race, 60)).toBe(2);
    expect(countdownShown(race, 120)).toBe(1);
    expect(countdownShown(race, COUNTDOWN_TICKS - 1)).toBe(1);
    expect(countdownShown(race, COUNTDOWN_TICKS)).toBe(0);
    expect(countdownShown(race, COUNTDOWN_TICKS + GO_SHOWN_TICKS - 1)).toBe(0);
    expect(countdownShown(race, COUNTDOWN_TICKS + GO_SHOWN_TICKS)).toBeNull();
    expect(countdownShown(race, -1)).toBeNull();
    for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) expect(stepWorld(world, THROTTLE).race).toBeNull();
    expect(race.phase).toBe('countdown');
    expect(stepWorld(world, THROTTLE).race).toEqual({ kind: 'go' });
    expect(race.phase).toBe('running');
    expect(world.tick).toBe(goTick(race));
    expect(raceTicks(race, world.tick)).toBe(0);
  });

  it('crosses the first gate of a straight start on the expected tick', () => {
    const r = straightStart();
    const gate = r.gates[0];
    // The same drive with no city: the first tick the centre is on or past the line.
    const free = createCar(r.pose.x, r.pose.z, r.pose.heading);
    const past = (car: Car) => (gate.direction.x !== 0 ? (car.x - gate.point.x) * gate.direction.x : (car.z - gate.point.z) * gate.direction.z) >= 0;
    let expected = 0;
    while (!past(free)) {
      stepCar(free, THROTTLE, DEFAULT_CAR_SETTINGS);
      expected++;
    }
    const world = raceWorld(r);
    skipCountdown(world);
    let impacts = 0;
    let event: RaceEvent | null = null;
    while (!event && world.tick < MAX_TICKS_TO_GATE) {
      const result = stepWorld(world, THROTTLE);
      if (result.impact) impacts++;
      event = result.race;
    }
    expect(impacts).toBe(0);
    expect(event).toEqual({ kind: 'gate', gate: 0 });
    expect(world.tick - goTick(world.race!)).toBe(expected);
    expect(world.race!.nextGate).toBe(1);
  });

  it('ignores a gate crossed backwards, then counts it forwards', () => {
    const r = route(1);
    const gate = r.gates[0];
    const world = raceWorld(r);
    skipCountdown(world);
    // Facing back down the route, just past the gate.
    world.car = carAt(gate.point, gate.direction, PLACE_BEHIND, headingOf(gate.direction) + 2 * HALF_PI);
    const backwards = stepUntilEvent(world, THROTTLE, 60);
    expect(backwards.event).toBeNull();
    expect(world.race!.nextGate).toBe(0);
    const behind = gate.direction.x !== 0 ? (world.car.x - gate.point.x) * gate.direction.x : (world.car.z - gate.point.z) * gate.direction.z;
    expect(behind).toBeLessThan(0);
    world.car = carAt(gate.point, gate.direction, -PLACE_BEHIND);
    expect(stepUntilEvent(world, THROTTLE).event).toEqual({ kind: 'gate', gate: 0 });
  });

  it('ignores a later gate crossed first', () => {
    const r = route(1);
    const world = raceWorld(r);
    skipCountdown(world);
    const later = r.gates[1];
    world.car = carAt(later.point, later.direction, -PLACE_BEHIND);
    expect(stepUntilEvent(world, THROTTLE, 120).event).toBeNull();
    expect(world.race!.nextGate).toBe(0);
  });

  it('counts within the road plus the pavement on each side and not beyond', () => {
    const gate: Gate = { leg: 1, segment: 0, point: { x: 10, z: 50 }, direction: { x: 0, z: -1 }, width: 12, distance: 100 };
    const edge = gate.width / 2 + GATE_SPAN_MARGIN;
    const cross = (x: number) => crossesGate(gate, createCar(x, 50.3, 0), createCar(x, 49.8, 0));
    expect(cross(10)).toBe(true);
    expect(cross(10 + edge - 0.01)).toBe(true);
    expect(cross(10 - edge + 0.01)).toBe(true);
    expect(cross(10 + edge + 0.01)).toBe(false);
    expect(cross(10 - edge - 0.01)).toBe(false);
    // The span is checked where the path meets the line, not at its ends.
    expect(crossesGate(gate, createCar(10 + edge + 1, 51, 0), createCar(10 + edge - 1, 49, 0))).toBe(true);
    expect(crossesGate(gate, createCar(10 + edge - 1, 51, 0), createCar(10 + edge + 1, 49, 0))).toBe(true);
    // Wrong way, or not reaching the line.
    expect(crossesGate(gate, createCar(10, 49.8, 0), createCar(10, 50.3, 0))).toBe(false);
    expect(crossesGate(gate, createCar(10, 50.3, 0), createCar(10, 50.01, 0))).toBe(false);
  });

  it('keeps the pavement span clear of buildings', () => {
    const OVERLAP_TOLERANCE = 0.01;
    for (let seed = 1; seed <= 20; seed++) {
      for (const gate of route(seed).gates) {
        const half = gate.width / 2 + GATE_SPAN_MARGIN;
        const { x, z } = gate.point;
        const span = gate.direction.x !== 0 ? { minX: x, maxX: x, minZ: z - half, maxZ: z + half } : { minX: x - half, maxX: x + half, minZ: z, maxZ: z };
        for (const { rect } of template.layout.buildings) {
          const overlapX = Math.min(span.maxX, rect.maxX) - Math.max(span.minX, rect.minX);
          const overlapZ = Math.min(span.maxZ, rect.maxZ) - Math.max(span.minZ, rect.minZ);
          expect(overlapX >= 0 && overlapZ > OVERLAP_TOLERANCE, `route ${seed} gate at ${x}, ${z}`).toBe(false);
        }
      }
    }
  });

  it('counts a gate at most once when the car stops on the line and bounces back', () => {
    const r = route(1);
    const race = createRace(r, 0);
    race.phase = 'running';
    const gate = r.gates[0];
    const behind = carAt(gate.point, gate.direction, -0.3);
    const on = carAt(gate.point, gate.direction, 0);
    expect(advanceRace(race, behind, on, 1)).toEqual({ kind: 'gate', gate: 0 });
    expect(advanceRace(race, on, behind, 2)).toBeNull();
    expect(advanceRace(race, behind, on, 3)).toBeNull();
    expect(race.nextGate).toBe(1);
    // Resting exactly on the line never counts again, even for the same gate.
    expect(crossesGate(gate, on, on)).toBe(false);
    expect(crossesGate(gate, on, carAt(gate.point, gate.direction, 0.3))).toBe(false);
  });

  it('cannot be skipped by a fast car: the swept path crosses the line', () => {
    const r = route(1);
    const gate = r.gates[0];
    const topSpeedStep = DEFAULT_CAR_SETTINGS.topSpeed * TICK_SECONDS;
    expect(topSpeedStep).toBeLessThan(0.54);
    for (const step of [topSpeedStep, 10, 100]) {
      for (const share of [0, 0.01, 0.5, 0.99]) {
        const from = carAt(gate.point, gate.direction, -step * (1 - share) - 1e-9);
        const to = carAt(gate.point, gate.direction, step * share);
        expect(crossesGate(gate, from, to)).toBe(true);
      }
    }
  });

  it('finishes a race gate by gate, freezes the time and keeps driving', () => {
    const r = route(1);
    const world = raceWorld(r);
    const race = world.race!;
    skipCountdown(world);
    let tick = 0;
    r.gates.forEach((gate, index) => {
      world.car = carAt(gate.point, gate.direction, -PLACE_BEHIND);
      const result = stepUntilEvent(world, THROTTLE);
      tick = result.tick;
      if (index < r.gates.length - 1) {
        expect(result.event).toEqual({ kind: 'gate', gate: index });
        expect(race.nextGate).toBe(index + 1);
        expect(race.phase).toBe('running');
      } else {
        expect(result.event).toEqual({ kind: 'finish', gate: index, ticks: tick - goTick(race) });
      }
    });
    expect(race.phase).toBe('finished');
    expect(race.finishTick).toBe(tick);
    const time = raceTicks(race, world.tick);
    expect(time).toBe(tick - COUNTDOWN_TICKS);
    const { x, z } = world.car;
    for (let i = 0; i < 120; i++) expect(stepWorld(world, THROTTLE).race).toBeNull();
    expect(raceTicks(race, world.tick)).toBe(time);
    expect(race.finishTick).toBe(tick);
    expect(Math.hypot(world.car.x - x, world.car.z - z)).toBeGreaterThan(10);
  });

  it('gives the same race whatever world tick it starts on', () => {
    const r = straightStart();
    const START_TICK = 1234;
    const run = (world: World) => {
      skipCountdown(world);
      const { event, tick } = stepUntilEvent(world, THROTTLE);
      return { event, ticks: tick - world.race!.startTick, car: { ...world.car }, nextGate: world.race!.nextGate };
    };
    const late = freeWorld();
    for (let i = 0; i < START_TICK; i++) stepWorld(late, THROTTLE);
    startRace(late, r);
    expect(late.race!.startTick).toBe(START_TICK);
    expect(run(late)).toEqual(run(raceWorld(r)));
  });

  it('agrees between two worlds with the same seeds and inputs, race part included in the hash', () => {
    const TICKS = 2000;
    const inputs = referenceInputs(1, TICKS);
    const a = runReference(createRaceWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, 1), inputs);
    const b = runReference(raceWorld(route(1)), inputs);
    expect(b.samples).toEqual(a.samples);
    expect(b.hash).toBe(a.hash);
    // The race part counts: the same drive with another route, or a race moved on by one gate, hashes differently.
    expect(runReference(raceWorld(route(2)), inputs).hash).not.toBe(a.hash);
    const moved = raceWorld(route(1));
    moved.race!.nextGate = 1;
    expect(runReference(moved, inputs).hash).not.toBe(a.hash);
  });

  it('leaves free driving without a race and without race events', () => {
    const world = freeWorld();
    expect(world.race).toBeNull();
    for (let i = 0; i < COUNTDOWN_TICKS; i++) expect(stepWorld(world, THROTTLE).race).toBeNull();
    expect(Math.hypot(world.car.velocityX, world.car.velocityZ)).toBeGreaterThan(10);
  });

  it('formats ticks as m:ss.mmm with milliseconds rounded down', () => {
    expect(formatRaceTime(0)).toBe('0:00.000');
    expect(formatRaceTime(1)).toBe('0:00.016');
    expect(formatRaceTime(59)).toBe('0:00.983');
    expect(formatRaceTime(60)).toBe('0:01.000');
    expect(formatRaceTime(3599)).toBe('0:59.983');
    expect(formatRaceTime(3600)).toBe('1:00.000');
    expect(formatRaceTime(5 * 3600 + 61)).toBe('5:01.016');
    expect(formatRaceTime(123456789)).toBe('34293:33.150');
  });
});
