import type { Vec3 } from '../math/mat4.ts';
import type { Camera } from '../render/camera.ts';
import { isKeyDown, takeMouseMovement } from './input.ts';

const FLY_SPEED = 5; // world units per second
const BOOST_MULTIPLIER = 5;
const MOUSE_SENSITIVITY = 0.0025; // radians per pixel
const MAX_PITCH = Math.PI / 2 - 0.01;
const DRIVING_HEIGHT = 1.2; // eye height in a car, in metres

// With lockHeight the camera stays at driving height and moves along the ground.
export function updateFlyCamera(camera: Camera, dt: number, lockHeight: boolean): void {
  const [mouseX, mouseY] = takeMouseMovement();
  camera.yaw -= mouseX * MOUSE_SENSITIVITY;
  camera.pitch -= mouseY * MOUSE_SENSITIVITY;
  camera.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, camera.pitch));
  if (lockHeight) camera.position[1] = DRIVING_HEIGHT;

  const cosPitch = lockHeight ? 1 : Math.cos(camera.pitch);
  const forward: Vec3 = [
    -Math.sin(camera.yaw) * cosPitch,
    lockHeight ? 0 : Math.sin(camera.pitch),
    -Math.cos(camera.yaw) * cosPitch,
  ];
  const right: Vec3 = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];

  const move: Vec3 = [0, 0, 0];
  function add(direction: Vec3, sign: number) {
    for (let i = 0; i < 3; i++) move[i] += direction[i] * sign;
  }
  if (isKeyDown('KeyW')) add(forward, 1);
  if (isKeyDown('KeyS')) add(forward, -1);
  if (isKeyDown('KeyD')) add(right, 1);
  if (isKeyDown('KeyA')) add(right, -1);
  if (!lockHeight && isKeyDown('Space')) move[1] += 1;
  if (!lockHeight && (isKeyDown('ShiftLeft') || isKeyDown('ShiftRight'))) move[1] -= 1;

  // Normalized so diagonals are not faster than straight lines.
  const length = Math.hypot(move[0], move[1], move[2]);
  if (length === 0) return;
  const speed = isKeyDown('KeyQ') ? FLY_SPEED * BOOST_MULTIPLIER : FLY_SPEED;
  const step = (speed * dt) / length;
  for (let i = 0; i < 3; i++) camera.position[i] += move[i] * step;
}
