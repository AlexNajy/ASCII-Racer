import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, DEFAULT_CAR_SETTINGS } from './car.ts';
import { NO_INPUT, type CarInput } from './carInput.ts';
import { DEFAULT_CITY_SETTINGS } from './city.ts';
import { TICKS_PER_SECOND } from './clock.ts';
import { createWorld, regenerateCity, stepWorld, type World } from './world.ts';

const THROTTLE: CarInput = { ...NO_INPUT, throttle: 1 };

function newWorld(seed = DEFAULT_CITY_SETTINGS.seed): World {
  return createWorld({ ...DEFAULT_CITY_SETTINGS, seed }, { ...DEFAULT_CAR_SETTINGS });
}

function drive(world: World, inputs: (tick: number) => CarInput, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepWorld(world, inputs(world.tick));
}

describe('world', () => {
  it('builds a city with buildings and colliders at tick 0', () => {
    const world = newWorld();
    expect(world.tick).toBe(0);
    expect(world.layout.buildings.length).toBeGreaterThan(0);
    expect(world.colliders.length).toBeGreaterThan(world.layout.buildings.length);
    expect(world.car.velocityX).toBe(0);
    expect(world.car.velocityZ).toBe(0);
  });

  it('counts one tick per step and moves the car with throttle held', () => {
    const world = newWorld();
    drive(world, () => THROTTLE, 300);
    expect(world.tick).toBe(300);
    expect(Math.hypot(world.car.x, world.car.z)).toBeGreaterThan(10);
    expect(world.previousCar).not.toEqual(world.car);
  });

  it('ends in identical car state for the same seed and inputs', () => {
    const inputs = (tick: number): CarInput => ({
      throttle: tick % 200 < 150 ? 1 : 0,
      brake: tick % 200 >= 180 ? 1 : 0,
      steer: tick % 120 < 40 ? 1 : tick % 120 < 80 ? -1 : 0,
      drift: tick % 300 > 250 ? 1 : 0,
    });
    const a = newWorld(7);
    const b = newWorld(7);
    drive(a, inputs, 1000);
    drive(b, inputs, 1000);
    expect(a.car).toEqual(b.car);
    expect(a.tick).toBe(b.tick);
  });

  it('stops at a wall with an impact and stays outside the colliders', () => {
    const world = newWorld();
    let firstHit: { x: number; z: number } | null = null;
    for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
      const { impact } = stepWorld(world, THROTTLE);
      const { x, z } = world.car;
      if (impact && !firstHit) firstHit = { x, z };
      const inside = world.colliders.some(({ rect }) => x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ);
      expect(inside).toBe(false);
    }
    expect(firstHit).not.toBeNull();
    // Still pressed against what it hit, not through it.
    expect(Math.hypot(world.car.x - firstHit!.x, world.car.z - firstHit!.z)).toBeLessThan(CAR_LENGTH);
  });

  it('keeps the car and tick when the city is regenerated', () => {
    const world = newWorld();
    drive(world, () => THROTTLE, 60);
    const car = { ...world.car };
    world.citySettings.seed = 2;
    regenerateCity(world);
    expect(world.car).toEqual(car);
    expect(world.tick).toBe(60);
    expect(world.city).toEqual(newWorld(2).city);
  });
});
