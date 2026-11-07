import { CAR_LENGTH, CAR_WIDTH, type Car } from '../game/car.ts';
import type { Vec3 } from '../math/mat4.ts';
import { MATERIAL } from './materials.ts';
import { FLOATS_PER_VERTEX, quad, withMaterial } from './shapes.ts';

// Visual only: read from the car each tick, never fed back into it.
export const MAX_TIRE_MARKS = 4000; // segments; the oldest is overwritten when full
export const FLOATS_PER_MARK = 6 * FLOATS_PER_VERTEX; // one quad

const MARK_WIDTH = 0.35; // m, wider than a real tyre so it covers a cell further away
const MARK_HEIGHT = 0.03; // m, above the road markings so they don't fight for depth
const MARK_COLOR: Vec3 = [0.04, 0.04, 0.04];
const REAR_AXLE = CAR_LENGTH / 2 - 0.9; // m behind the centre
const WHEEL_TRACK = CAR_WIDTH / 2 - 0.25; // m either side of the centre line
// Sideways speed above which the tyres leave marks and smoke, m/s.
export const MARK_SLIDE_SPEED = 2;

export interface TireMarks {
  next: number; // segment written next
  count: number; // segments written so far, capped at MAX_TIRE_MARKS
  last: ([number, number] | null)[]; // each rear wheel's position last tick, null when it wasn't marking
  // Segments written since the last upload, with the place they go in the buffer.
  pending: { index: number; vertices: Float32Array }[];
}

export function createTireMarks(): TireMarks {
  return { next: 0, count: 0, last: [null, null], pending: [] };
}

// How fast the car moves sideways, m/s.
export function slideSpeed(car: Car): number {
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  return Math.abs(car.velocityX * rightX + car.velocityZ * rightZ);
}

// Left and right rear wheel, x and z.
export function rearWheels(car: Car): [number, number][] {
  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  return [-1, 1].map((side) => [
    car.x - forwardX * REAR_AXLE + forwardZ * side * WHEEL_TRACK,
    car.z - forwardZ * REAR_AXLE - forwardX * side * WHEEL_TRACK,
  ]);
}

// One flat quad from a to b, MARK_WIDTH wide.
function segment([ax, az]: [number, number], [bx, bz]: [number, number]): number[] {
  const length = Math.hypot(bx - ax, bz - az);
  const sideX = (-(bz - az) / length) * (MARK_WIDTH / 2);
  const sideZ = ((bx - ax) / length) * (MARK_WIDTH / 2);
  const y = MARK_HEIGHT;
  return withMaterial(
    quad([[ax - sideX, y, az - sideZ], [ax + sideX, y, az + sideZ], [bx + sideX, y, bz + sideZ], [bx - sideX, y, bz - sideZ]], [0, 1, 0], MARK_COLOR),
    MATERIAL.tireMark,
  );
}

// Called once per tick: while sliding, each rear wheel adds a segment from where it was last tick.
export function updateTireMarks(marks: TireMarks, car: Car) {
  const sliding = slideSpeed(car) > MARK_SLIDE_SPEED;
  rearWheels(car).forEach((wheel, i) => {
    const last = marks.last[i];
    marks.last[i] = sliding ? wheel : null;
    if (!sliding || !last || (last[0] === wheel[0] && last[1] === wheel[1])) return;
    marks.pending.push({ index: marks.next, vertices: new Float32Array(segment(last, wheel)) });
    marks.next = (marks.next + 1) % MAX_TIRE_MARKS;
    marks.count = Math.min(marks.count + 1, MAX_TIRE_MARKS);
  });
}
