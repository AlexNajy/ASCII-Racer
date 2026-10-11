import type { Vec3 } from '../math/mat4.ts';
import type { Camera } from '../render/camera.ts';
import { wrapAngle, type Car, type CarSettings } from './car.ts';
import { segmentHit, type Collider } from './collision.ts';
import { takeMouseMovement } from './input.ts';

export interface ChaseCameraSettings {
  distance: number; // m behind the car, at standstill
  height: number; // m
  lookHeight: number; // m, the camera aims at this point above the car
  yawFollow: number; // how fast the yaw catches up with its target, per second (higher is stiffer)
  speedPullBack: number; // m further back at top speed
  speedFovBoost: number; // degrees wider at top speed
  // While sliding, how far the camera aims at the travel direction instead of the nose (0 to 1).
  driftTravelBlend: number;
  // After a wall pushed the camera in, how fast it eases back out, per second. Pushing in is instant.
  wallReturn: number;
}

export const DEFAULT_CHASE_CAMERA_SETTINGS: ChaseCameraSettings = {
  distance: 6.5,
  height: 2.2,
  lookHeight: 1.5,
  yawFollow: 10,
  speedPullBack: 1.5,
  speedFovBoost: 10,
  driftTravelBlend: 0.3,
  wallReturn: 2,
};

export interface ChaseCamera {
  share: number; // how much of its wanted distance the camera is at, 0 to 1; walls pull it in
}

export function createChaseCamera(): ChaseCamera {
  return { share: 1 };
}

// Below this the travel direction is too noisy to follow.
const MIN_TRAVEL_SPEED = 2; // m/s
// Kept between the camera and a wall behind it, at least the near plane so the wall isn't cut open.
const WALL_MARGIN = 0.6; // m

// Returns the extra field of view in degrees.
export function updateChaseCamera(
  camera: Camera,
  chase: ChaseCamera,
  car: Car,
  carSettings: CarSettings,
  settings: ChaseCameraSettings,
  colliders: Collider[],
  dt: number,
): number {
  // Discarded so it doesn't pile up for the fly camera.
  takeMouseMovement();
  const speed = Math.hypot(car.velocityX, car.velocityZ);
  const speedFraction = Math.min(1, speed / carSettings.topSpeed);

  let targetYaw = car.heading;
  const travelHeading = Math.atan2(-car.velocityX, -car.velocityZ);
  const slip = wrapAngle(travelHeading - car.heading);
  // Only while going forwards, so reversing doesn't spin the camera round.
  if (speed > MIN_TRAVEL_SPEED && Math.abs(slip) < Math.PI / 2) {
    targetYaw += slip * settings.driftTravelBlend * (1 - car.traction);
  }
  camera.yaw += wrapAngle(targetYaw - camera.yaw) * (1 - Math.exp(-settings.yawFollow * dt));

  // Where the camera wants to be, then pulled in along the line to the car if something is in the way.
  const wanted = settings.distance + settings.speedPullBack * speedFraction;
  const look: Vec3 = [car.x, settings.lookHeight, car.z];
  const ideal: Vec3 = [
    car.x + Math.sin(camera.yaw) * wanted,
    settings.height,
    car.z + Math.cos(camera.yaw) * wanted,
  ];
  const hit = segmentHit(look, ideal, colliders);
  const rayLength = Math.hypot(wanted, settings.height - settings.lookHeight);
  const allowed = hit < 1 ? Math.max(0, hit - WALL_MARGIN / rayLength) : 1;

  if (chase.share > allowed) chase.share = allowed;
  else chase.share += (allowed - chase.share) * (1 - Math.exp(-settings.wallReturn * dt));

  camera.position = [
    look[0] + (ideal[0] - look[0]) * chase.share,
    look[1] + (ideal[1] - look[1]) * chase.share,
    look[2] + (ideal[2] - look[2]) * chase.share,
  ];
  camera.pitch = Math.atan2(look[1] - camera.position[1], wanted * chase.share);
  return settings.speedFovBoost * speedFraction;
}
