import type { Vec3 } from '../math/mat4.ts';
import type { Camera } from '../render/camera.ts';
import { isKeyDown } from './input.ts';

const FLY_SPEED = 5; // world units per second

export function updateFlyCamera(camera: Camera, dt: number): void {
  const cosPitch = Math.cos(camera.pitch);
  const forward: Vec3 = [
    -Math.sin(camera.yaw) * cosPitch,
    Math.sin(camera.pitch),
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
  if (isKeyDown('Space')) move[1] += 1;
  if (isKeyDown('ShiftLeft') || isKeyDown('ShiftRight')) move[1] -= 1;

  // Normalized so diagonals are not faster than straight lines.
  const length = Math.hypot(move[0], move[1], move[2]);
  if (length === 0) return;
  const step = (FLY_SPEED * dt) / length;
  for (let i = 0; i < 3; i++) camera.position[i] += move[i] * step;
}
