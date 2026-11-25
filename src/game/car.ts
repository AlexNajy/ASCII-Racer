import type { CarInput } from './carInput.ts';
import { TICK_SECONDS } from './clock.ts';
import type { Rect } from './city.ts';
import { pushOutOfRect, type Collider } from './collision.ts';
import { atan2, cos, hypot, sin } from '../math/deterministic.ts';

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
  fullTurnSpeed: number; // m/s, turning grows from nothing at standstill to full at this speed
  wallBounce: number; // share of the speed into a wall that comes back out, 0 to 1
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
  fullTurnSpeed: 5,
  wallBounce: 0.2,
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

// The car part of the way (0 to 1) from `from` to `to`, for drawing between two ticks.
export function blendCars(from: Car, to: Car, share: number): Car {
  const blend = (a: number, b: number) => a + (b - a) * share;
  return {
    ...to,
    x: blend(from.x, to.x),
    z: blend(from.z, to.z),
    heading: from.heading + wrapAngle(to.heading - from.heading) * share,
    velocityX: blend(from.velocityX, to.velocityX),
    velocityZ: blend(from.velocityZ, to.velocityZ),
  };
}

// Clamped at 0 so slowing down never pushes the other way.
function slowDown(speed: number, decel: number): number {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - decel * TICK_SECONDS);
}

function forward(heading: number): [number, number] {
  return [-sin(heading), -cos(heading)];
}

export function wrapAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

// Same turn as adding `angle` to a heading.
function rotate(x: number, z: number, angle: number): [number, number] {
  const c = cos(angle);
  const s = sin(angle);
  return [x * c + z * s, z * c - x * s];
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
  // Negative when reversing, which flips the steering like a real car.
  const turnFactor = Math.max(-1, Math.min(1, speed / settings.fullTurnSpeed));
  car.heading += input.steer * turnSpeed * turnFactor * TICK_SECONDS;

  // Rotate the velocity part of the way towards the nose (or the tail when reversing), keeping its speed.
  const travelHeading = atan2(-car.velocityX, -car.velocityZ);
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

  const before = hypot(speed, sideways);
  const slip = before > 0 ? (Math.abs(sideways) / before) * (1 - car.traction) : 0; // 0 gripping or straight, 1 fully sideways

  const pedal = input.throttle - input.brake; // -1 to 1
  if (pedal === 0) speed = slowDown(speed, settings.coastDecel);
  else {
    // Fades to 0 as the car nears top speed in the pedal's direction.
    const falloff = 1 - (pedal * speed) / settings.topSpeed;
    // Sliding tyres can't put all the power down, so the rubber always wins and the slide dies out.
    speed += pedal * settings.acceleration * falloff * (1 - slip) * TICK_SECONDS;
  }

  const total = hypot(speed, sideways);
  if (total > 0) {
    const scale = slowDown(total, settings.slipDecel * slip) / total;
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

// Seen from above the car is a capsule as wide as it: a circle swept along the centre line, its round ends
// reaching the nose and tail, so they glance off corners instead of catching on them. Being convex it has
// no notch a pole can hook into, so a car pressed between a pole and a wall can always slide out one way.
const COLLISION_RADIUS = CAR_WIDTH / 2;
const COLLISION_REACH = (CAR_LENGTH - CAR_WIDTH) / 2; // from the centre to the end circles' centres
// The tick's move is resolved in steps no longer than this, so nothing thin is skipped past or squeezed through.
const MAX_COLLISION_STEP = 0.1; // m
// Pushing out of one collider can push into another; each step repeats until clear or this many passes.
const COLLISION_PASSES = 4;
// Colliders further than this from the tick's move can't be reached by the car.
const NEARBY_MARGIN = CAR_LENGTH; // m

// How hard the car hit something this tick: the speed it had into the wall, and the wall's outward direction.
export interface Impact {
  speed: number; // m/s
  normalX: number;
  normalZ: number;
}

// The point of the segment from (ax, az) to (bx, bz) nearest the rectangle, seen from above: the nearest pair
// is an end of the segment or the segment's nearest point to a corner. The rectangle's centre covers a segment
// running right through it.
function nearestOnSegment(ax: number, az: number, bx: number, bz: number, rect: Rect): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const along = (px: number, pz: number) => Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  const candidates = [
    0,
    1,
    along(rect.minX, rect.minZ),
    along(rect.maxX, rect.minZ),
    along(rect.minX, rect.maxZ),
    along(rect.maxX, rect.maxZ),
    along((rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2),
  ];
  let bestX = ax;
  let bestZ = az;
  let best = Infinity;
  for (const t of candidates) {
    const x = ax + dx * t;
    const z = az + dz * t;
    const outX = x - Math.min(Math.max(x, rect.minX), rect.maxX);
    const outZ = z - Math.min(Math.max(z, rect.minZ), rect.maxZ);
    const distanceSquared = outX * outX + outZ * outZ;
    if (distanceSquared < best) {
      best = distanceSquared;
      bestX = x;
      bestZ = z;
    }
  }
  return [bestX, bestZ];
}

// Moves the capsule centred on (x, z) out of the colliders. Returns the new centre.
function pushCarOut(x: number, z: number, reachX: number, reachZ: number, colliders: Collider[]): [number, number] {
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let pushed = false;
    for (const { rect } of colliders) {
      const [nearX, nearZ] = nearestOnSegment(x - reachX, z - reachZ, x + reachX, z + reachZ, rect);
      const [outX, outZ] = pushOutOfRect(nearX, nearZ, COLLISION_RADIUS, rect);
      if (outX === nearX && outZ === nearZ) continue;
      x += outX - nearX;
      z += outZ - nearZ;
      pushed = true;
    }
    if (!pushed) break;
  }
  return [x, z];
}

// Resolves the tick's move from (fromX, fromZ) to where stepCar put the car. A car can't drive over anything
// solid, however low, so `top` is ignored.
export function collideCar(car: Car, fromX: number, fromZ: number, colliders: Collider[], settings: CarSettings): Impact | null {
  const endX = car.x;
  const endZ = car.z;
  const moveX = endX - fromX;
  const moveZ = endZ - fromZ;
  const nearby = colliders.filter(
    ({ rect }) =>
      rect.maxX > Math.min(fromX, endX) - NEARBY_MARGIN &&
      rect.minX < Math.max(fromX, endX) + NEARBY_MARGIN &&
      rect.maxZ > Math.min(fromZ, endZ) - NEARBY_MARGIN &&
      rect.minZ < Math.max(fromZ, endZ) + NEARBY_MARGIN,
  );
  const [forwardX, forwardZ] = forward(car.heading);
  const steps = Math.max(1, Math.ceil(hypot(moveX, moveZ) / MAX_COLLISION_STEP));
  // The pushes add up separately, so a move that hits nothing ends exactly where stepCar put it.
  let pushX = 0;
  let pushZ = 0;
  for (let step = 1; step <= steps; step++) {
    const x = (step === steps ? endX : fromX + (moveX * step) / steps) + pushX;
    const z = (step === steps ? endZ : fromZ + (moveZ * step) / steps) + pushZ;
    const [outX, outZ] = pushCarOut(x, z, forwardX * COLLISION_REACH, forwardZ * COLLISION_REACH, nearby);
    pushX += outX - x;
    pushZ += outZ - z;
  }
  car.x = endX + pushX;
  car.z = endZ + pushZ;

  // The tick's whole push points out of the wall, so it gives the wall's direction.
  const push = hypot(pushX, pushZ);
  if (push === 0) return null;
  const normalX = pushX / push;
  const normalZ = pushZ / push;
  const into = car.velocityX * normalX + car.velocityZ * normalZ; // negative when moving into the wall
  if (into >= 0) return null;
  // Remove the speed into the wall and send some of it back; the speed along the wall is kept, so the car scrapes along.
  car.velocityX -= (1 + settings.wallBounce) * into * normalX;
  car.velocityZ -= (1 + settings.wallBounce) * into * normalZ;
  return { speed: -into, normalX, normalZ };
}
