import { describe, expect, it } from 'vitest';
import { collideCar, createCar, DEFAULT_CAR_SETTINGS, stepCar, type Car, type Impact } from './car.ts';
import { NO_INPUT, type CarInput } from './carInput.ts';
import type { Rect } from './city.ts';
import type { Collider } from './collision.ts';

const DRIFT: CarInput = { ...NO_INPUT, drift: 1 };
const TICKS = 60;
const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;
// A cut outside corner adds its pushes up in another order, so only rounding may differ.
const CORNER_TOLERANCE = 1e-9;

interface Outcome {
  first: Impact | null;
  hitCar: Car | null;
  car: Car;
  impacts: number;
}

const collider = (minX: number, minZ: number, maxX: number, maxZ: number): Collider => ({ rect: { minX, minZ, maxX, maxZ }, top: 10 });

// Slides the car (drifting, no grip) for TICKS ticks against the colliders.
function slide(start: Car, colliders: Collider[]): Outcome {
  const car = { ...start };
  let first: Impact | null = null;
  let hitCar: Car | null = null;
  let impacts = 0;
  for (let t = 0; t < TICKS; t++) {
    const fromX = car.x;
    const fromZ = car.z;
    stepCar(car, DRIFT, DEFAULT_CAR_SETTINGS);
    const impact = collideCar(car, fromX, fromZ, colliders, DEFAULT_CAR_SETTINGS);
    if (!impact) continue;
    impacts++;
    if (!first) {
      first = impact;
      hitCar = { ...car };
    }
  }
  return { first, hitCar, car, impacts };
}

function sliding(x: number, z: number, heading: number, velocityX: number, velocityZ: number): Car {
  const car = createCar(x, z, heading);
  car.velocityX = velocityX;
  car.velocityZ = velocityZ;
  car.drifting = true;
  car.traction = 0;
  return car;
}

// The largest difference between two outcomes' numbers; Infinity if one hit and the other didn't.
function difference(a: Outcome, b: Outcome): number {
  if (!a.first !== !b.first) return Infinity;
  const numbers = (o: Outcome) => [
    o.car.x, o.car.z, o.car.heading, o.car.velocityX, o.car.velocityZ,
    ...(o.first && o.hitCar ? [o.first.speed, o.first.normalX, o.first.normalZ, o.hitCar.x, o.hitCar.z, o.hitCar.velocityX, o.hitCar.velocityZ] : []),
  ];
  const x = numbers(a);
  const y = numbers(b);
  return Math.max(...x.map((value, i) => Math.abs(value - y[i])));
}

// Mirrors and swaps axes, so one set of cases covers walls facing every way.
type Transform = (x: number, z: number) => [number, number];
const TRANSFORMS: Transform[] = [
  (x, z) => [x, z],
  (x, z) => [x, -z],
  (x, z) => [z, x],
  (x, z) => [-z, x],
];

function transformRect(t: Transform, { minX, minZ, maxX, maxZ }: Rect): Collider {
  const [ax, az] = t(minX, minZ);
  const [bx, bz] = t(maxX, maxZ);
  return collider(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
}

// A heading in the untransformed frame, turned the same way as the positions.
function transformHeading(t: Transform, heading: number): number {
  const [fx, fz] = t(-Math.sin(heading), -Math.cos(heading));
  return Math.atan2(-fx, -fz);
}

// Every slide (positions along the wall, headings, speeds, glancing or head on) towards a wall whose face
// is z = 0, the wall behind it (z > 0), car approaching from z < 0.
function slides(alongFrom: number, alongTo: number): Array<(t: Transform) => Car> {
  const cases: Array<(t: Transform) => Car> = [];
  const ALONG_STEP = 0.55; // m
  const HEADINGS = [-0.15, -0.03, 0, 0.1]; // radians off parallel (or off head on)
  const SPEEDS = [8, 30, 38]; // m/s into the wall
  const ALONG_SPEEDS = [-12, 0, 15]; // m/s along the wall
  for (let along = alongFrom; along <= alongTo; along += ALONG_STEP) {
    for (const base of [QUARTER_TURN, -QUARTER_TURN, HALF_TURN]) for (const offset of HEADINGS) for (const speed of SPEEDS) for (const alongSpeed of ALONG_SPEEDS) {
      const heading = base + offset;
      const start = base === HALF_TURN ? -3.5 : -2; // clear of the wall, nose or side first
      cases.push((t) => {
        const [x, z] = t(along, start);
        const [vx, vz] = t(alongSpeed, speed);
        return sliding(x, z, transformHeading(t, heading), vx, vz);
      });
    }
  }
  return cases;
}

// Compares every slide against two ways of building the same solid shape.
function compare(a: Rect[], b: Rect[], cases: Array<(t: Transform) => Car>): { worst: number; hits: number; count: number } {
  let worst = 0;
  let hits = 0;
  let count = 0;
  for (const t of TRANSFORMS) {
    const wallA = a.map((rect) => transformRect(t, rect));
    const wallB = b.map((rect) => transformRect(t, rect));
    for (const make of cases) {
      const car = make(t);
      const one = slide(car, wallA);
      const other = slide(car, wallB);
      if (one.first) hits++;
      count++;
      worst = Math.max(worst, difference(one, other));
    }
  }
  return { worst, hits, count };
}

const WALL: Rect = { minX: -30, minZ: 0, maxX: 30, maxZ: 8 };

describe('wall seams', () => {
  it('a flat wall cut into two touching rectangles behaves like one', () => {
    const halves: Rect[] = [{ ...WALL, maxX: 0 }, { ...WALL, minX: 0 }];
    const result = compare([WALL], halves, slides(-4, 4));
    expect(result.hits).toBeGreaterThan(result.count * 0.9);
    expect(result.worst).toBe(0);
  });

  it('a flat wall cut into many pieces of different depths behaves like one', () => {
    const pieces: Rect[] = [
      { minX: -30, minZ: 0, maxX: -2.5, maxZ: 8 },
      { minX: -2.5, minZ: 0, maxX: -1, maxZ: 3 },
      { minX: -1, minZ: 0, maxX: 0.4, maxZ: 12 },
      { minX: 0.4, minZ: 0, maxX: 2, maxZ: 0.3 },
      { minX: 2, minZ: 0, maxX: 30, maxZ: 8 },
    ];
    const result = compare([WALL], pieces, slides(-4, 4));
    expect(result.worst).toBe(0);
  });

  // An inside corner: the wall along z = 0 meets one running out towards the car at x = 0.
  it('an inside corner behaves the same however its two walls are cut', () => {
    const longAlong: Rect[] = [{ minX: -30, minZ: 0, maxX: 30, maxZ: 8 }, { minX: 0, minZ: -30, maxX: 8, maxZ: 0 }];
    const longAcross: Rect[] = [{ minX: -30, minZ: 0, maxX: 0, maxZ: 8 }, { minX: 0, minZ: -30, maxX: 8, maxZ: 8 }];
    const result = compare(longAlong, longAcross, slides(-5, -0.5));
    expect(result.hits).toBeGreaterThan(result.count * 0.9);
    expect(result.worst).toBe(0);
  });

  // The outside corner of a block cut along both axes, against the whole block.
  it('an outside corner of a cut block behaves like the corner of the whole block', () => {
    const block: Rect = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
    const quarters: Rect[] = [
      { minX: 0, minZ: 0, maxX: 1, maxZ: 1 },
      { minX: 1, minZ: 0, maxX: 20, maxZ: 1 },
      { minX: 0, minZ: 1, maxX: 1, maxZ: 20 },
      { minX: 1, minZ: 1, maxX: 20, maxZ: 20 },
    ];
    const result = compare([block], quarters, slides(-3, 3));
    expect(result.worst).toBeLessThan(CORNER_TOLERANCE);
  });

  it('still pushes diagonally off a real outside corner', () => {
    const block = [collider(0, 0, 20, 20)];
    const { first } = slide(sliding(-1.5, -3, QUARTER_TURN, 0, 20), block);
    expect(first).not.toBeNull();
    expect(Math.abs(first!.normalX)).toBeGreaterThan(0.1);
    expect(first!.normalZ).toBeLessThan(-0.1);
  });
});
