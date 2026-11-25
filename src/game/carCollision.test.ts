import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, CAR_WIDTH, createCar, DEFAULT_CAR_SETTINGS, type Car } from './car.ts';
import { NO_INPUT, type CarInput } from './carInput.ts';
import { DEFAULT_CITY_SETTINGS } from './city.ts';
import { TICKS_PER_SECOND } from './clock.ts';
import { pushOutOfRect, type Collider } from './collision.ts';
import { createWorld, stepWorld, type World } from './world.ts';
import { cos, sin } from '../math/deterministic.ts';

const input = (throttle: number, brake: number, steer: number, drift = 0): CarInput => ({ throttle, brake, steer, drift });
const DRIFT = input(0, 0, 0, 1);
const THROTTLE = input(1, 0, 0);
const REVERSE = input(0, 1, 0);
// What a player tries first when the car stands still against something.
const DRIVE_AWAY = [THROTTLE, REVERSE, input(1, 0, 1), input(1, 0, -1), input(0, 1, 1), input(0, 1, -1)];
const ESCAPE_DISTANCE = 5; // m
const ESCAPE_SECONDS = 3;
const SLIDE_SECONDS = 1;
const SETTLE_SECONDS = 3;

const world = createWorld({ ...DEFAULT_CITY_SETTINGS, seed: 1 }, { ...DEFAULT_CAR_SETTINGS }, false);

// Slides the car (drifting, no grip) for a second, then lets it come to rest.
function slideAndSettle(world: World, car: Car): Car {
  world.car = car;
  for (let t = 0; t < (SLIDE_SECONDS + SETTLE_SECONDS) * TICKS_PER_SECOND; t++) {
    stepWorld(world, t < SLIDE_SECONDS * TICKS_PER_SECOND ? DRIFT : NO_INPUT);
  }
  return { ...world.car };
}

function drivesAway(world: World, from: Car, input: CarInput): boolean {
  world.car = { ...from };
  for (let t = 0; t < ESCAPE_SECONDS * TICKS_PER_SECOND; t++) {
    stepWorld(world, input);
    if (Math.hypot(world.car.x - from.x, world.car.z - from.z) > ESCAPE_DISTANCE) return true;
  }
  return false;
}

// Whether any collider reaches into the car's outline (a capsule as wide as the car) by more than `slack`.
function overlaps(car: Car, colliders: Collider[], slack: number): boolean {
  const reach = (CAR_LENGTH - CAR_WIDTH) / 2;
  const radius = CAR_WIDTH / 2 - slack;
  for (let i = -10; i <= 10; i++) {
    const x = car.x - sin(car.heading) * reach * (i / 10);
    const z = car.z - cos(car.heading) * reach * (i / 10);
    for (const { rect } of colliders) {
      const [pushedX, pushedZ] = pushOutOfRect(x, z, radius, rect);
      if (pushedX !== x || pushedZ !== z) return true;
    }
  }
  return false;
}

function sliding(x: number, z: number, heading: number, velocityX: number, velocityZ: number): Car {
  const car = createCar(x, z, heading);
  car.velocityX = velocityX;
  car.velocityZ = velocityZ;
  car.drifting = true;
  car.traction = 0;
  return car;
}

describe('car collisions', () => {
  it('never wedges the car between a street light and the building after a fast sideways slide (seed 1)', () => {
    const rest = slideAndSettle(world, sliding(-252.5, -287, Math.PI / 2 - 0.1, 0, 30));
    expect(overlaps(rest, world.colliders, 1e-6)).toBe(false);
    expect(drivesAway(world, rest, THROTTLE)).toBe(true);
    // The pole stands right behind the tail in a gap exactly as wide as the car, so reversing straight only
    // pushes into it; swinging the tail away from the building gets out.
    expect(drivesAway(world, rest, input(0, 1, -1))).toBe(true);
  });

  // Every 12th pole of each kind, slid into sideways and diagonally, nose either way, around parallel to the road.
  it('can always drive away after sliding into a pole against a wall (seed 1 sample)', () => {
    const SAMPLE_EVERY = 12;
    const SPEEDS = [26, 32, 34, 38]; // m/s, up to above the top speed
    const ANGLES = [-0.1, -0.05, 0, 0.05, 0.1]; // radians off parallel
    const ALONG = [-3, -1.5, 0, 1.5, 3]; // m along the road from the pole
    const DIAGONAL = [0, 0.4]; // speed along the road, as a share of the speed across
    const START_DISTANCE = 3.2; // m before the pole
    const WALL_SEARCH = 2.5; // m beyond the pole, where a wall makes a wedge
    const poles = [
      ...world.streetLights.filter((_, i) => i % SAMPLE_EVERY === 0),
      ...world.intersections.trafficLights.filter((_, i) => i % SAMPLE_EVERY === 0),
      ...world.intersections.stopSigns.filter((_, i) => i % SAMPLE_EVERY === 0),
    ];
    let slides = 0;
    let wedged = 0;
    const traps: string[] = [];
    for (const pole of poles) {
      const local = world.colliders.filter(({ rect }) => Math.abs(rect.minX + rect.maxX - 2 * pole.x) < 60 && Math.abs(rect.minZ + rect.maxZ - 2 * pole.z) < 60);
      const near: World = { ...world, colliders: local, race: null };
      for (const [acrossX, acrossZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wallX = pole.x + acrossX * WALL_SEARCH;
        const wallZ = pole.z + acrossZ * WALL_SEARCH;
        const wall = local.some(({ rect }) => rect.maxX - rect.minX > 1 && rect.maxZ - rect.minZ > 1 && rect.minX < wallX + 1 && rect.maxX > wallX - 1 && rect.minZ < wallZ + 1 && rect.maxZ > wallZ - 1);
        if (!wall) continue;
        const alongX = acrossZ;
        const alongZ = acrossX;
        const parallel = Math.atan2(-alongX, -alongZ);
        for (const along of ALONG) for (const speed of SPEEDS) for (const angle of ANGLES) for (const diagonal of DIAGONAL) for (const flip of [0, Math.PI]) {
          const x = pole.x - acrossX * START_DISTANCE + alongX * along;
          const z = pole.z - acrossZ * START_DISTANCE + alongZ * along;
          const car = sliding(x, z, parallel + angle + flip, speed * (acrossX + alongX * diagonal), speed * (acrossZ + alongZ * diagonal));
          if (overlaps(car, local, 0)) continue;
          slides++;
          const rest = slideAndSettle(near, car);
          if (Math.hypot(rest.x - pole.x, rest.z - pole.z) > CAR_LENGTH) continue;
          wedged++;
          if (!DRIVE_AWAY.some((input) => drivesAway(near, rest, input))) traps.push(JSON.stringify({ pole, x, z, speed, angle, diagonal, flip }));
        }
      }
    }
    expect(slides).toBeGreaterThan(5000);
    expect(wedged).toBeGreaterThan(500);
    expect(traps).toEqual([]);
  });
});
