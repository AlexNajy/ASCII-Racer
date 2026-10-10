import type { Camera } from '../render/camera.ts';
import { wrapAngle, type Car, type CarSettings } from './car.ts';
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
}

export const DEFAULT_CHASE_CAMERA_SETTINGS: ChaseCameraSettings = {
  distance: 6.5,
  height: 2.2,
  lookHeight: 1.5,
  yawFollow: 10,
  speedPullBack: 1.5,
  speedFovBoost: 10,
  driftTravelBlend: 0.3,
};

// Below this the travel direction is too noisy to follow.
const MIN_TRAVEL_SPEED = 2; // m/s

// Returns the extra field of view in degrees.
export function updateChaseCamera(
  camera: Camera,
  car: Car,
  carSettings: CarSettings,
  settings: ChaseCameraSettings,
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

  const distance = settings.distance + settings.speedPullBack * speedFraction;
  camera.position = [
    car.x + Math.sin(camera.yaw) * distance,
    settings.height,
    car.z + Math.cos(camera.yaw) * distance,
  ];
  camera.pitch = Math.atan2(settings.lookHeight - settings.height, distance);
  return settings.speedFovBoost * speedFraction;
}
