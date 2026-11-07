import { CAR_LENGTH, CAR_WIDTH, type Car } from '../game/car.ts';
import type { Vec3 } from '../math/mat4.ts';

const REAR_AXLE = CAR_LENGTH / 2 - 0.9; // m behind the centre
const WHEEL_TRACK = CAR_WIDTH / 2 - 0.25; // m either side of the centre line
// Drift particles start this far out from the wheel and this high, outside the body, so it doesn't hide them.
const TYRE_OUTSIDE = 0.3; // m
const TYRE_SPRAY_HEIGHT = 0.1; // m
// Sideways speed above which the tyres throw drift particles, m/s.
export const DRIFT_SLIDE_SPEED = 2;

// How fast the car moves sideways, m/s.
export function slideSpeed(car: Car): number {
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  return Math.abs(car.velocityX * rightX + car.velocityZ * rightZ);
}

// Where each rear tyre throws its drift particles, just outside it, and the way they fly: outwards and up.
export function rearTyreSprays(car: Car): { position: Vec3; direction: Vec3 }[] {
  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  // Forward turned a quarter clockwise seen from above.
  const rightX = -forwardZ;
  const rightZ = forwardX;
  return [-1, 1].map((side) => {
    const out = WHEEL_TRACK + TYRE_OUTSIDE;
    return {
      position: [car.x - forwardX * REAR_AXLE + rightX * side * out, TYRE_SPRAY_HEIGHT, car.z - forwardZ * REAR_AXLE + rightZ * side * out],
      direction: [rightX * side * Math.SQRT1_2, Math.SQRT1_2, rightZ * side * Math.SQRT1_2],
    };
  });
}
