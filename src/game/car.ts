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
// Sets the top speed (~150 km/h), where drag and rolling resistance cancel the engine.
const DRAG = 3.3; // N per (m/s)²
const ROLLING_RESISTANCE = 180; // N, ~1.5% of the car's weight
const ENGINE_BRAKING = 2000; // N, with the drive pedal released
const STOPPED_SPEED = 0.5; // m/s; below this the brake key reverses
const WHEELBASE = 2.6; // m
const MAX_STEER_ANGLE = 0.6; // radians
// Steering angle halves at this speed, so full keyboard steering stays controllable when fast.
const STEER_FALLOFF_SPEED = 4; // m/s
const STEER_SPEED = 4; // per second; full lock from centre in 0.25 s
const STEER_RETURN_SPEED = 6; // per second, back towards centre
const GRIP = 1; // g, the most sideways acceleration the tyres can give
const GRAVITY = 9.81; // m/s²

// Heading uses the camera's yaw convention: 0 faces -Z, positive turns left. Radians.
export interface Car {
  x: number;
  z: number;
  heading: number;
  velocityX: number; // m/s, world space
  velocityZ: number;
  steer: number; // -1 (right) to 1 (left), where the wheels actually are
}

export function createCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, velocityX: 0, velocityZ: 0, steer: 0 };
}

function forward(heading: number): [number, number] {
  return [-Math.sin(heading), -Math.cos(heading)];
}

// Velocity split into along the heading (negative when reversing) and across it (positive to the right).
function split(car: Car): [number, number] {
  const [forwardX, forwardZ] = forward(car.heading);
  return [
    car.velocityX * forwardX + car.velocityZ * forwardZ,
    car.velocityX * -forwardZ + car.velocityZ * forwardX,
  ];
}

function setVelocity(car: Car, speed: number, sideways: number): void {
  const [forwardX, forwardZ] = forward(car.heading);
  car.velocityX = forwardX * speed - forwardZ * sideways;
  car.velocityZ = forwardZ * speed + forwardX * sideways;
}

export function slideSpeed(car: Car): number {
  return split(car)[1];
}

export function stepCar(car: Car, input: CarInput): void {
  let [speed, sideways] = split(car);

  let drive: number;
  let brake: number;
  let drivePedal: number;
  if (speed > STOPPED_SPEED) {
    drive = input.throttle * ENGINE_FORCE;
    brake = input.brake * BRAKE_FORCE;
    drivePedal = input.throttle;
  } else if (speed < -STOPPED_SPEED) {
    drive = -input.brake * REVERSE_FORCE;
    brake = input.throttle * BRAKE_FORCE;
    drivePedal = input.brake;
  } else {
    drive = input.throttle * ENGINE_FORCE - input.brake * REVERSE_FORCE;
    brake = 0;
    drivePedal = Math.max(input.throttle, input.brake);
  }

  speed += ((drive - DRAG * speed * Math.abs(speed)) / MASS) * TICK_SECONDS;
  // Clamped so these never push the car backwards; this is also what brings it to a full stop.
  const slowing = brake + ROLLING_RESISTANCE + ENGINE_BRAKING * (1 - drivePedal);
  speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - (slowing / MASS) * TICK_SECONDS);
  setVelocity(car, speed, sideways);

  // Bicycle model. Turning the car doesn't turn its velocity; that is left to the tyres.
  const returning = Math.abs(input.steer) < Math.abs(car.steer) || input.steer * car.steer < 0;
  const steerStep = (returning ? STEER_RETURN_SPEED : STEER_SPEED) * TICK_SECONDS;
  car.steer += Math.max(-steerStep, Math.min(steerStep, input.steer - car.steer));
  const steerAngle = (car.steer * MAX_STEER_ANGLE) / (1 + Math.abs(speed) / STEER_FALLOFF_SPEED);
  const turnRate = (speed * Math.tan(steerAngle)) / WHEELBASE; // radians/s
  car.heading += turnRate * TICK_SECONDS;

  [speed, sideways] = split(car);
  // Clamped like the brakes; whatever is left over is the slide.
  sideways = Math.sign(sideways) * Math.max(0, Math.abs(sideways) - GRIP * GRAVITY * TICK_SECONDS);
  setVelocity(car, speed, sideways);
  car.x += car.velocityX * TICK_SECONDS;
  car.z += car.velocityZ * TICK_SECONDS;
}
