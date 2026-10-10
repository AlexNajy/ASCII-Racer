import type { CarInput } from './carInput.ts';
import { TICK_SECONDS } from './clock.ts';

// Collision box, metres.
export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;

export interface CarSettings {
  mass: number; // kg
  engineForce: number; // N
  reverseForce: number; // N
  brakeForce: number; // N
  // Sets the top speed (~180 km/h), where drag and rolling resistance cancel the engine.
  drag: number; // N per (m/s)²
  rollingResistance: number; // N, ~1.5% of the car's weight
  engineBraking: number; // N, with the drive pedal released
  wheelbase: number; // m
  maxSteerAngle: number; // radians
  // Steering angle halves at this speed, so full keyboard steering stays controllable when fast.
  steerFalloffSpeed: number; // m/s
  steerSpeed: number; // per second; 4 = full lock from centre in 0.25 s
  steerReturnSpeed: number; // per second, back towards centre
  grip: number; // g, the most sideways acceleration the tyres can give
  // Asking for more than `grip` breaks into a drift, which only ends when the slide slows below driftExitSpeed.
  driftGrip: number; // g
  driftExitSpeed: number; // m/s of sideways speed
  // Skidding tyres slowing the whole car while drifting, at full strength when fully sideways.
  driftScrub: number; // g
}

export const DEFAULT_CAR_SETTINGS: CarSettings = {
  mass: 1200,
  engineForce: 11000,
  reverseForce: 5000,
  brakeForce: 22000,
  drag: 4.3,
  rollingResistance: 180,
  engineBraking: 2500,
  wheelbase: 2.6,
  maxSteerAngle: 0.6,
  steerFalloffSpeed: 6,
  steerSpeed: 12,
  steerReturnSpeed: 16,
  grip: 1.6,
  driftGrip: 0.9,
  driftExitSpeed: 1,
  driftScrub: 1,
};

const STOPPED_SPEED = 0.5; // m/s; below this the brake key reverses
const GRAVITY = 9.81; // m/s²

// Heading uses the camera's yaw convention: 0 faces -Z, positive turns left. Radians.
export interface Car {
  x: number;
  z: number;
  heading: number;
  velocityX: number; // m/s, world space
  velocityZ: number;
  steer: number; // -1 (right) to 1 (left), where the wheels actually are
  drifting: boolean;
}

export function createCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, velocityX: 0, velocityZ: 0, steer: 0, drifting: false };
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

export function stepCar(car: Car, input: CarInput, settings: CarSettings): void {
  let [speed, sideways] = split(car);

  let drive: number;
  let brake: number;
  let drivePedal: number;
  if (speed > STOPPED_SPEED) {
    drive = input.throttle * settings.engineForce;
    brake = input.brake * settings.brakeForce;
    drivePedal = input.throttle;
  } else if (speed < -STOPPED_SPEED) {
    drive = -input.brake * settings.reverseForce;
    brake = input.throttle * settings.brakeForce;
    drivePedal = input.brake;
  } else {
    drive = input.throttle * settings.engineForce - input.brake * settings.reverseForce;
    brake = 0;
    drivePedal = Math.max(input.throttle, input.brake);
  }

  speed += ((drive - settings.drag * speed * Math.abs(speed)) / settings.mass) * TICK_SECONDS;
  // Clamped so these never push the car backwards; this is also what brings it to a full stop.
  const slowing = brake + settings.rollingResistance + settings.engineBraking * (1 - drivePedal);
  speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - (slowing / settings.mass) * TICK_SECONDS);
  setVelocity(car, speed, sideways);

  // Bicycle model. Turning the car doesn't turn its velocity; that is left to the tyres.
  const returning = Math.abs(input.steer) < Math.abs(car.steer) || input.steer * car.steer < 0;
  const steerStep = (returning ? settings.steerReturnSpeed : settings.steerSpeed) * TICK_SECONDS;
  car.steer += Math.max(-steerStep, Math.min(steerStep, input.steer - car.steer));
  const steerAngle = (car.steer * settings.maxSteerAngle) / (1 + Math.abs(speed) / settings.steerFalloffSpeed);
  const turnRate = (speed * Math.tan(steerAngle)) / settings.wheelbase; // radians/s
  car.heading += turnRate * TICK_SECONDS;

  [speed, sideways] = split(car);
  const grip = (car.drifting ? settings.driftGrip : settings.grip) * GRAVITY * TICK_SECONDS;
  if (Math.abs(sideways) > grip) car.drifting = true;
  // Clamped like the brakes; whatever is left over is the slide.
  sideways = Math.sign(sideways) * Math.max(0, Math.abs(sideways) - grip);
  if (Math.abs(sideways) < settings.driftExitSpeed) car.drifting = false;
  if (car.drifting) {
    const total = Math.hypot(speed, sideways);
    const slip = Math.abs(sideways) / total; // 0 straight, 1 fully sideways
    const scrubbed = Math.max(0, total - settings.driftScrub * slip * GRAVITY * TICK_SECONDS);
    speed *= scrubbed / total;
    sideways *= scrubbed / total;
  }
  setVelocity(car, speed, sideways);
  car.x += car.velocityX * TICK_SECONDS;
  car.z += car.velocityZ * TICK_SECONDS;
}
