import { CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH } from '../../game/car.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { box } from '../shapes.ts';

const CAR_COLOR: Vec3 = [0.85, 0.15, 0.1];

// Front towards -Z.
export function carVertices(): number[] {
  return box([-CAR_WIDTH / 2, 0, -CAR_LENGTH / 2], [CAR_WIDTH / 2, CAR_HEIGHT, CAR_LENGTH / 2], CAR_COLOR);
}
