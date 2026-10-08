import type { Vec3 } from '../math/mat4.ts';

// Vertex layout: x, y, z, r, g, b, nx, ny, nz, emission.
// Emission 1 shows the colour at full strength whatever the lighting, for things that glow.
export const FLOATS_PER_VERTEX = 10;

export function box(min: Vec3, max: Vec3, color: Vec3, emission = 0): number[] {
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
    for (const corner of [a, b, c, a, c, d]) vertices.push(...corner, ...color, ...normal, emission);
  }
  return vertices;
}

// A box centred on `centre` whose front points along `facing`, which must be ±x or ±z.
// Width runs across the front, depth along `facing`.
export function facingBox(
  centre: Vec3,
  facing: Vec3,
  width: number,
  height: number,
  depth: number,
  color: Vec3,
  emission = 0,
): number[] {
  const halfX = (Math.abs(facing[2]) * width + Math.abs(facing[0]) * depth) / 2;
  const halfZ = (Math.abs(facing[0]) * width + Math.abs(facing[2]) * depth) / 2;
  const [x, y, z] = centre;
  return box([x - halfX, y - height / 2, z - halfZ], [x + halfX, y + height / 2, z + halfZ], color, emission);
}

// Pixel art from rows of '#' (top to bottom), standing out of a flat face by `depth`, centred on `centre`.
// `facing` is the face's direction (±x or ±z). One box per run of '#' in a row.
export function pixelArt(
  rows: string[],
  centre: Vec3,
  facing: Vec3,
  pixel: number,
  depth: number,
  color: Vec3,
  emission = 0,
): number[] {
  const [x, y, z] = centre;
  const [facingX, , facingZ] = facing;
  // Face space to world: u to the right as a viewer sees it, v up, w out of the face.
  const position = (u: number, v: number, w: number): Vec3 => [
    x + facingZ * u + facingX * w,
    y + v,
    z - facingX * u + facingZ * w,
  ];
  const left = -(Math.max(...rows.map((row) => row.length)) * pixel) / 2;
  const top = (rows.length * pixel) / 2;
  const vertices: number[] = [];
  rows.forEach((row, r) => {
    for (const run of row.matchAll(/#+/g)) {
      const a = position(left + run.index * pixel, top - (r + 1) * pixel, 0);
      const b = position(left + (run.index + run[0].length) * pixel, top - r * pixel, depth);
      const min: Vec3 = [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])];
      const max: Vec3 = [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])];
      vertices.push(...box(min, max, color, emission));
    }
  });
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

function back(direction: Vec3): Vec3 {
  return [-direction[0], -direction[1], -direction[2]];
}

// A flat regular polygon with some depth (octagon signs, round lamps), standing upright and facing a
// horizontal unit direction. The first corner is half a side's angle up, so an octagon has a flat top.
export function disc(
  centre: Vec3,
  facing: Vec3,
  radius: number,
  depth: number,
  sides: number,
  color: Vec3,
  emission = 0,
): number[] {
  const right = cross(facing, [0, 1, 0]);
  const up: Vec3 = [0, 1, 0];
  const half = depth / 2;
  const angle = (corner: number) => (2 * Math.PI * (corner + 0.5)) / sides;
  const rim = (corner: number, offset: number) =>
    along(centre, [right, Math.cos(angle(corner)) * radius], [up, Math.sin(angle(corner)) * radius], [facing, offset]);
  const vertices: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3, normal: Vec3) => {
    for (const point of [a, b, c]) vertices.push(...point, ...color, ...normal, emission);
  };
  for (let corner = 0; corner < sides; corner++) {
    triangle(along(centre, [facing, half]), rim(corner, half), rim(corner + 1, half), facing);
    triangle(along(centre, [facing, -half]), rim(corner, -half), rim(corner + 1, -half), back(facing));
    const middle = (angle(corner) + angle(corner + 1)) / 2;
    const outward = along([0, 0, 0], [right, Math.cos(middle)], [up, Math.sin(middle)]);
    triangle(rim(corner, -half), rim(corner + 1, -half), rim(corner + 1, half), outward);
    triangle(rim(corner, -half), rim(corner + 1, half), rim(corner, half), outward);
  }
  return vertices;
}

// A square bar between two points at any angle. Must not point straight up.
export function beam(from: Vec3, to: Vec3, thickness: number, color: Vec3, emission = 0): number[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const forward: Vec3 = [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length];
  const side = cross(forward, [0, 1, 0]);
  const sideLength = Math.hypot(...side);
  const right: Vec3 = [side[0] / sideLength, side[1] / sideLength, side[2] / sideLength];
  const up = cross(right, forward);
  const half = thickness / 2;
  const corner = (end: Vec3, r: number, u: number) => along(end, [right, r * half], [up, u * half]);
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
    for (const point of [a, b, c, a, c, d]) vertices.push(...point, ...color, ...normal, emission);
  }
  return vertices;
}
