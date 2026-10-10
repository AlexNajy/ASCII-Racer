import type { CarInput } from './carInput.ts';
import { TICK_SECONDS } from './clock.ts';

// Collision box, metres.
export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;

export interface CarSettings {
  acceleration: number; // m/s², from standstill
  topSpeed: number; // m/s
  coastDecel: number; // m/s², no pedal
  turnSpeed: number; // radians/s at full steer, not drifting
  driftTurnSpeed: number; // radians/s at full steer
  // How fast the velocity's direction catches up with the nose, per second (higher is tighter).
  driftFollow: number; // while drifting, so the car slides
  gripFollow: number; // otherwise
  tractionTime: number; // s, to blend fully between gripping and sliding
  // After the drift button is released the car slides on until its sideways speed drops below this.
  regripSpeed: number; // m/s
  // Rubber sliding on asphalt slows the whole car, at full strength when fully sideways.
  slipDecel: number; // m/s²
}

export const DEFAULT_CAR_SETTINGS: CarSettings = {
  acceleration: 10,
  topSpeed: 32,
  coastDecel: 4,
  turnSpeed: 0.6,
  driftTurnSpeed: 2,
  driftFollow: 2,
  gripFollow: 20,
  tractionTime: 0.3,
  regripSpeed: 1.5,
  slipDecel: 16,
};

// Heading uses the camera's yaw convention: 0 faces -Z, positive turns left. Radians.
export interface Car {
  x: number;
  z: number;
  heading: number;
  velocityX: number; // m/s, world space
  velocityZ: number;
  drifting: boolean;
  traction: number; // 0 sliding to 1 gripping, eases towards the drift state
}

export function createCar(x: number, z: number, heading: number): Car {
  return { x, z, heading, velocityX: 0, velocityZ: 0, drifting: false, traction: 1 };
}

// Clamped at 0 so slowing down never pushes the other way.
function slowDown(speed: number, decel: number): number {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - decel * TICK_SECONDS);
}

function forward(heading: number): [number, number] {
  return [-Math.sin(heading), -Math.cos(heading)];
}

function wrapAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

// Same turn as adding `angle` to a heading.
function rotate(x: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, z * cos - x * sin];
}

export function stepCar(car: Car, input: CarInput, settings: CarSettings): void {
  let [forwardX, forwardZ] = forward(car.heading);
  let speed = car.velocityX * forwardX + car.velocityZ * forwardZ; // negative when reversing

  // Traction eases towards the drift state, so every switch between gripping and sliding blends.
  const tractionStep = TICK_SECONDS / settings.tractionTime;
  const tractionTarget = car.drifting ? 0 : 1;
  car.traction += Math.max(-tractionStep, Math.min(tractionStep, tractionTarget - car.traction));
  const mix = (sliding: number, gripping: number) => sliding + (gripping - sliding) * car.traction;

  // Only the nose turns here; the velocity catches up below.
  const turnSpeed = mix(settings.driftTurnSpeed, settings.turnSpeed);
  car.heading += input.steer * turnSpeed * Math.sign(speed) * TICK_SECONDS;

  // Rotate the velocity part of the way towards the nose (or the tail when reversing), keeping its speed.
  const travelHeading = Math.atan2(-car.velocityX, -car.velocityZ);
  const targetHeading = speed < 0 ? car.heading + Math.PI : car.heading;
  const follow = mix(settings.driftFollow, settings.gripFollow);
  const lag = wrapAngle(targetHeading - travelHeading);
  [car.velocityX, car.velocityZ] = rotate(car.velocityX, car.velocityZ, lag * Math.min(1, follow * TICK_SECONDS));

  // The pedals only change the forward part of the velocity; the sideways part is the slide.
  [forwardX, forwardZ] = forward(car.heading);
  const rightX = -forwardZ; // forward turned a quarter clockwise seen from above
  const rightZ = forwardX;
  speed = car.velocityX * forwardX + car.velocityZ * forwardZ;
  let sideways = car.velocityX * rightX + car.velocityZ * rightZ;

  const pedal = input.throttle - input.brake; // -1 to 1
  if (pedal === 0) speed = slowDown(speed, settings.coastDecel);
  else {
    // Fades to 0 as the car nears top speed in the pedal's direction.
    const falloff = 1 - (pedal * speed) / settings.topSpeed;
    speed += pedal * settings.acceleration * falloff * TICK_SECONDS;
  }

  const total = Math.hypot(speed, sideways);
  if (total > 0) {
    const slip = Math.abs(sideways) / total; // 0 straight, 1 fully sideways
    const scale = slowDown(total, settings.slipDecel * slip * (1 - car.traction)) / total;
    speed *= scale;
    sideways *= scale;
  }

  // Pressing drift starts it at once; releasing only ends it once the slide has died down.
  if (input.drift) car.drifting = true;
  else if (Math.abs(sideways) < settings.regripSpeed) car.drifting = false;

  car.velocityX = forwardX * speed + rightX * sideways;
  car.velocityZ = forwardZ * speed + rightZ * sideways;
  car.x += car.velocityX * TICK_SECONDS;
  car.z += car.velocityZ * TICK_SECONDS;
}
