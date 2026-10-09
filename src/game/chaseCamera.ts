import type { Camera } from '../render/camera.ts';
import type { Car } from './car.ts';
import { takeMouseMovement } from './input.ts';

const CHASE_DISTANCE = 6; // behind the car's centre, in metres
const CHASE_HEIGHT = 2.2;
const CHASE_PITCH = -0.12; // radians, looking slightly down at the car

// Rendering only, like the fly camera: it reads the car but never changes it.
export function updateChaseCamera(camera: Camera, car: Car): void {
  // The mouse doesn't move this camera; drop its movement so it doesn't pile up for the fly camera.
  takeMouseMovement();
  // Behind is the opposite of the car's forward direction (-sin, -cos).
  camera.position = [
    car.x + Math.sin(car.heading) * CHASE_DISTANCE,
    CHASE_HEIGHT,
    car.z + Math.cos(car.heading) * CHASE_DISTANCE,
  ];
  camera.yaw = car.heading;
  camera.pitch = CHASE_PITCH;
}
