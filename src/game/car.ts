import { TICK_SECONDS } from './clock.ts';

// The car's collision box, in metres.
export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;

// The car seen from above: it drives on the ground, so it only needs x and z.
// Heading uses the camera's yaw convention: 0 faces -Z, positive turns left. Radians.
export interface Car {
  x: number;
  z: number;
  heading: number;
  velocityX: number; // metres per second, in world directions
  velocityZ: number;
}

export function createCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, velocityX: 0, velocityZ: 0 };
}

// One fixed simulation step.
export function stepCar(car: Car): void {
  car.x += car.velocityX * TICK_SECONDS;
  car.z += car.velocityZ * TICK_SECONDS;
}
