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
