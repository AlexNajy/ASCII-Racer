import type { CarInput } from './carInput.ts';
import { TICK_SECONDS } from './clock.ts';

// Collision box, metres.
export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;

const MASS = 1200; // kg
const ENGINE_FORCE = 6000; // N
const REVERSE_FORCE = 3000;
const BRAKE_FORCE = 12000;
// Drag and rolling resistance set the top speed (~150 km/h), where they cancel the engine.
const DRAG = 2; // N per (m/s)²
const ROLLING_RESISTANCE = 60; // N per m/s
const STOPPED_SPEED = 0.5; // m/s; below this the brake key reverses
const WHEELBASE = 2.6; // m
const MAX_STEER_ANGLE = 0.6; // radians
// Steering angle halves at this speed, so full keyboard steering stays controllable when fast.
const STEER_FALLOFF_SPEED = 4; // m/s

// Heading uses the camera's yaw convention: 0 faces -Z, positive turns left. Radians.
export interface Car {
  x: number;
  z: number;
  heading: number;
  velocityX: number; // m/s, world space
  velocityZ: number;
}

export function createCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, velocityX: 0, velocityZ: 0 };
}

export function stepCar(car: Car, input: CarInput): void {
  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  // Negative when reversing.
  let speed = car.velocityX * forwardX + car.velocityZ * forwardZ;

  let drive: number;
  let brake: number;
  if (speed > STOPPED_SPEED) {
    drive = input.throttle * ENGINE_FORCE;
    brake = input.brake * BRAKE_FORCE;
  } else if (speed < -STOPPED_SPEED) {
    drive = -input.brake * REVERSE_FORCE;
    brake = input.throttle * BRAKE_FORCE;
  } else {
    drive = input.throttle * ENGINE_FORCE - input.brake * REVERSE_FORCE;
    brake = 0;
  }

  const resistance = DRAG * speed * Math.abs(speed) + ROLLING_RESISTANCE * speed;
  speed += ((drive - resistance) / MASS) * TICK_SECONDS;
  // Clamped so braking never pushes the car backwards.
  const braking = (brake / MASS) * TICK_SECONDS;
  speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - braking);

  // Bicycle model.
  const steerAngle = (input.steer * MAX_STEER_ANGLE) / (1 + Math.abs(speed) / STEER_FALLOFF_SPEED);
  const turnRate = (speed * Math.tan(steerAngle)) / WHEELBASE; // radians/s
  car.heading += turnRate * TICK_SECONDS;

  car.velocityX = -Math.sin(car.heading) * speed;
  car.velocityZ = -Math.cos(car.heading) * speed;
  car.x += car.velocityX * TICK_SECONDS;
  car.z += car.velocityZ * TICK_SECONDS;
}
