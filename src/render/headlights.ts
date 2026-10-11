import { CAR_LENGTH, type Car } from '../game/car.ts';
import type { Vec3 } from '../math/mat4.ts';

const HEADLIGHT_HEIGHT = 0.7; // m
const HEADLIGHT_TILT = 0.05; // radians down, so the cone reaches the road
// Share of the cone's half-angle that fades out towards the edge.
export const HEADLIGHT_SOFT_EDGE = 0.3;

export interface Headlight {
  position: Vec3;
  direction: Vec3; // unit length
}

// A light at the middle of the car's nose, in world space.
export function headlight(car: Car): Headlight {
  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  const nose = CAR_LENGTH / 2;
  const level = Math.cos(HEADLIGHT_TILT);
  return {
    position: [car.x + forwardX * nose, HEADLIGHT_HEIGHT, car.z + forwardZ * nose],
    direction: [forwardX * level, -Math.sin(HEADLIGHT_TILT), forwardZ * level],
  };
}
