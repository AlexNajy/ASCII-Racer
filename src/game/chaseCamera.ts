import type { Camera } from '../render/camera.ts';
import type { Car } from './car.ts';
import { takeMouseMovement } from './input.ts';

const CHASE_DISTANCE = 6; // m
const CHASE_HEIGHT = 2.2;
const CHASE_PITCH = -0.12; // radians

export function updateChaseCamera(camera: Camera, car: Car): void {
  // Discarded so it doesn't pile up for the fly camera.
  takeMouseMovement();
  camera.position = [
    car.x + Math.sin(car.heading) * CHASE_DISTANCE,
    CHASE_HEIGHT,
    car.z + Math.cos(car.heading) * CHASE_DISTANCE,
  ];
  camera.yaw = car.heading;
  camera.pitch = CHASE_PITCH;
}
