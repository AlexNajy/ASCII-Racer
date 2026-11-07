import { CAR_LENGTH, CAR_WIDTH, type Car } from '../game/car.ts';

const REAR_AXLE = CAR_LENGTH / 2 - 0.9; // m behind the centre
const WHEEL_TRACK = CAR_WIDTH / 2 - 0.25; // m either side of the centre line
// Sideways speed above which the tyres throw drift particles, m/s.
export const DRIFT_SLIDE_SPEED = 2;

// How fast the car moves sideways, m/s.
export function slideSpeed(car: Car): number {
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  return Math.abs(car.velocityX * rightX + car.velocityZ * rightZ);
}

// Left and right rear wheel, x and z.
export function rearWheels(car: Car): [number, number][] {
  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  return [-1, 1].map((side) => [
    car.x - forwardX * REAR_AXLE + forwardZ * side * WHEEL_TRACK,
    car.z - forwardZ * REAR_AXLE - forwardX * side * WHEEL_TRACK,
  ]);
}
