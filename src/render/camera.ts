import { multiply, rotationX, rotationY, translation, type Mat4, type Vec3 } from '../math/mat4.ts';

// Yaw 0 looks down -Z, positive yaw turns left. Positive pitch looks up. Angles in radians.
export interface Camera {
  position: Vec3;
  yaw: number;
  pitch: number;
}

// The view matrix undoes the camera's own placement: move the world by -position,
// then turn it by -yaw and -pitch, so the camera ends up at the origin looking down -Z.
export function viewMatrix(camera: Camera): Mat4 {
  const [x, y, z] = camera.position;
  return multiply(
    rotationX(-camera.pitch),
    multiply(rotationY(-camera.yaw), translation(-x, -y, -z)),
  );
}
