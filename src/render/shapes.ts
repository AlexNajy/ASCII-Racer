import type { Vec3 } from '../math/mat4.ts';

// Vertex layout: x, y, z, r, g, b, nx, ny, nz.
export const FLOATS_PER_VERTEX = 9;

export function box(min: Vec3, max: Vec3, color: Vec3): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: [Vec3, Vec3, Vec3, Vec3, Vec3][] = [
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]], // top
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], // front
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]], // right
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]], // left
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]], // back
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], // bottom
  ];
  const vertices: number[] = [];
  for (const [a, b, c, d, normal] of faces) {
    for (const corner of [a, b, c, a, c, d]) vertices.push(...corner, ...color, ...normal);
  }
  return vertices;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function along(origin: Vec3, ...steps: [Vec3, number][]): Vec3 {
  const point: Vec3 = [...origin];
  for (const [direction, distance] of steps) {
    for (let i = 0; i < 3; i++) point[i] += direction[i] * distance;
  }
  return point;
}

// A square bar between two points at any angle. Must not point straight up.
export function beam(from: Vec3, to: Vec3, thickness: number, color: Vec3): number[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const forward: Vec3 = [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length];
  const side = cross(forward, [0, 1, 0]);
  const sideLength = Math.hypot(...side);
  const right: Vec3 = [side[0] / sideLength, side[1] / sideLength, side[2] / sideLength];
  const up = cross(right, forward);
  const half = thickness / 2;
  const corner = (end: Vec3, r: number, u: number) => along(end, [right, r * half], [up, u * half]);
  const back = (direction: Vec3): Vec3 => [-direction[0], -direction[1], -direction[2]];
  const faces: [Vec3, Vec3, Vec3, Vec3, Vec3][] = [
    [corner(from, -1, 1), corner(from, 1, 1), corner(to, 1, 1), corner(to, -1, 1), up],
    [corner(from, -1, -1), corner(from, 1, -1), corner(to, 1, -1), corner(to, -1, -1), back(up)],
    [corner(from, 1, -1), corner(from, 1, 1), corner(to, 1, 1), corner(to, 1, -1), right],
    [corner(from, -1, -1), corner(from, -1, 1), corner(to, -1, 1), corner(to, -1, -1), back(right)],
    [corner(to, -1, -1), corner(to, 1, -1), corner(to, 1, 1), corner(to, -1, 1), forward],
    [corner(from, -1, -1), corner(from, 1, -1), corner(from, 1, 1), corner(from, -1, 1), back(forward)],
  ];
  const vertices: number[] = [];
  for (const [a, b, c, d, normal] of faces) {
    for (const point of [a, b, c, a, c, d]) vertices.push(...point, ...color, ...normal);
  }
  return vertices;
}
