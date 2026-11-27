import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from '../game/car.ts';
import { TICKS_PER_SECOND } from '../game/clock.ts';
import { DEFAULT_CITY_SETTINGS, type Rect } from '../game/city.ts';
import { createWorld } from '../game/world.ts';
import { FLIGHT_HEIGHT, FLIGHT_PITCH, FLIGHT_SPEED, flightPath, flightPose } from './menuFlight.ts';

function inside(rect: Rect, x: number, z: number): boolean {
  return x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ;
}

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}

// The camera moves FLIGHT_SPEED / TICKS_PER_SECOND per tick; a quarter turn of radius r takes (pi r / 2) of that.
const STEP = FLIGHT_SPEED / TICKS_PER_SECOND;

const CITIES = [
  { seed: 1 },
  { seed: 42 },
  { seed: 7, blocksPerSide: 6 },
  { seed: 9, blocksPerSide: 10 },
];

describe('menu flight', () => {
  for (const overrides of CITIES) {
    const settings = { ...DEFAULT_CITY_SETTINGS, ...overrides };
    const world = createWorld(settings, { ...DEFAULT_CAR_SETTINGS }, false);
    const path = flightPath(world.roadGraph);
    const loopTicks = Math.ceil((path.length / FLIGHT_SPEED) * TICKS_PER_SECOND);
    const name = `seed ${settings.seed}, ${settings.blocksPerSide} blocks`;

    it(`moves smoothly with no jumps, round the whole loop and across its seam (${name})`, () => {
      let previous = flightPose(path, 0);
      for (let tick = 1; tick <= 2 * loopTicks + 1; tick++) {
        const pose = flightPose(path, tick);
        const moved = Math.hypot(pose.position[0] - previous.position[0], pose.position[2] - previous.position[2]);
        expect(moved).toBeLessThanOrEqual(STEP + 1e-6);
        expect(moved).toBeGreaterThan(STEP * 0.9);
        expect(angleBetween(pose.yaw, previous.yaw)).toBeLessThan(0.02);
        expect(pose.position[1]).toBe(FLIGHT_HEIGHT);
        expect(pose.pitch).toBe(FLIGHT_PITCH);
        previous = pose;
      }
    });

    it(`comes back to where it started after one loop (${name})`, () => {
      const start = flightPose(path, 0);
      const ticks = (path.length / FLIGHT_SPEED) * TICKS_PER_SECOND;
      const again = flightPose(path, ticks);
      expect(again.position[0]).toBeCloseTo(start.position[0], 6);
      expect(again.position[2]).toBeCloseTo(start.position[2], 6);
      expect(angleBetween(again.yaw, start.yaw)).toBeLessThan(1e-6);
    });

    it(`stays over the roads inside the bounds, clear of every block and collider (${name})`, () => {
      const { city } = world;
      const above = world.colliders.filter((collider) => collider.top > FLIGHT_HEIGHT);
      for (let tick = 0; tick < loopTicks; tick += 5) {
        const [x, , z] = flightPose(path, tick).position;
        expect(inside(city.bounds, x, z)).toBe(true);
        expect(city.blocks.some((block) => inside(block.rect, x, z))).toBe(false);
        expect(above.some((collider) => inside(collider.rect, x, z))).toBe(false);
      }
    });

    it(`looks along the way it is going (${name})`, () => {
      for (let tick = 0; tick < loopTicks; tick += 37) {
        const pose = flightPose(path, tick);
        const next = flightPose(path, tick + 1);
        const dx = next.position[0] - pose.position[0];
        const dz = next.position[2] - pose.position[2];
        // Yaw 0 looks down -Z, positive yaw turns left (towards -X).
        expect(angleBetween(Math.atan2(-dx, -dz), pose.yaw)).toBeLessThan(0.02);
      }
    });
  }

  it('is the same picture for the same tick', () => {
    const world = createWorld({ ...DEFAULT_CITY_SETTINGS }, { ...DEFAULT_CAR_SETTINGS }, false);
    expect(flightPose(flightPath(world.roadGraph), 1234.5)).toEqual(flightPose(flightPath(world.roadGraph), 1234.5));
  });
});
