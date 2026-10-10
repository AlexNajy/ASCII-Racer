import { isKeyDown } from './input.ts';

export interface CarInput {
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  steer: number; // -1 (right) to 1 (left)
  drift: number; // 0 or 1
}

export const NO_INPUT: CarInput = { throttle: 0, brake: 0, steer: 0, drift: 0 };

export function readCarInput(): CarInput {
  const key = (...codes: string[]) => (codes.some(isKeyDown) ? 1 : 0);
  return {
    throttle: key('KeyW', 'ArrowUp'),
    brake: key('KeyS', 'ArrowDown'),
    steer: key('KeyA', 'ArrowLeft') - key('KeyD', 'ArrowRight'),
    drift: key('Space'),
  };
}
