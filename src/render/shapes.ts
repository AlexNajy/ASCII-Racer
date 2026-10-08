import type { Vec3 } from '../math/mat4.ts';

// Vertex layout: x, y, z, r, g, b.
export const FLOATS_PER_VERTEX = 6;

// Each face gets the colour times a fixed shade, so the faces of a box stay apart without lighting.
export function box(min: Vec3, max: Vec3, color: Vec3): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: [Vec3, Vec3, Vec3, Vec3, number][] = [
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 1.0], // top
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.8], // front
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 0.65], // right
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.65], // left
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], 0.5], // back
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0.4], // bottom
  ];
  const vertices: number[] = [];
  for (const [a, b, c, d, shade] of faces) {
    const shaded = color.map((channel) => channel * shade);
    for (const corner of [a, b, c, a, c, d]) vertices.push(...corner, ...shaded);
  }
  return vertices;
}
