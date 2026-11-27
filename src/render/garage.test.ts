import { describe, expect, it } from 'vitest';
import { GARAGE_CAMERA, GARAGE_TURN_TICKS, garageFloorVertices, garageHeading } from './garage.ts';

describe('garage preview', () => {
  it('turns the car once every GARAGE_TURN_TICKS, smoothly between ticks', () => {
    expect(garageHeading(0)).toBe(0);
    expect(garageHeading(GARAGE_TURN_TICKS / 4)).toBeCloseTo(Math.PI / 2);
    expect(garageHeading(GARAGE_TURN_TICKS + 10)).toBeCloseTo(garageHeading(10));
    expect(garageHeading(10.5)).toBeGreaterThan(garageHeading(10));
    expect(garageHeading(10.5)).toBeLessThan(garageHeading(11));
  });

  it('looks down at the car from a fixed spot', () => {
    expect(GARAGE_CAMERA.pitch).toBeLessThan(0);
    expect(GARAGE_CAMERA.position[1]).toBeGreaterThan(1);
  });

  it('lays a glowing spot flat on the ground', () => {
    const floor = garageFloorVertices();
    expect(floor.length).toBeGreaterThan(0);
    for (let i = 0; i < floor.length; i += 16) {
      expect(floor[i + 1]).toBe(0);
      expect(floor[i + 9]).toBe(1);
    }
  });
});
