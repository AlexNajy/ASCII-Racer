import type { Building, Side } from '../../game/buildings.ts';
import { CURB_HEIGHT, type Rect } from '../../game/city.ts';
import type { Collider } from '../../game/collision.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { box, quad } from '../shapes.ts';

// Geometry plus what is solid about it. A model that doesn't fill its lot can't use the lot as its collider.
export interface Model {
  vertices: number[];
  colliders: Collider[];
}

export type BuildingModel = (building: Building, random: () => number) => Model;

export const GROUND = CURB_HEIGHT;

export function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function chance(share: number, random: () => number): boolean {
  return random() < share;
}

export function solid(rect: Rect, top: number): Collider {
  return { rect, top };
}

// Merges without spreading into push, which runs out of stack on big models.
export function combine(models: Model[]): Model {
  const vertices: number[] = [];
  const colliders: Collider[] = [];
  for (const model of models) {
    for (let i = 0; i < model.vertices.length; i++) vertices.push(model.vertices[i]);
    for (const collider of model.colliders) colliders.push(collider);
  }
  return { vertices, colliders };
}

export const SIDES: readonly Side[] = ['minX', 'maxX', 'minZ', 'maxZ'];

const NORMALS: Record<Side, Vec3> = { minX: [-1, 0, 0], maxX: [1, 0, 0], minZ: [0, 0, -1], maxZ: [0, 0, 1] };

// One wall of a rectangle in its own coordinates: u along it to the right as a viewer sees it, y up, w outwards.
export interface Face {
  side: Side;
  normal: Vec3;
  length: number;
  point(u: number, y: number, w: number): Vec3;
  // An axis-aligned box between those coordinates.
  box(u0: number, u1: number, y0: number, y1: number, w0: number, w1: number, color: Vec3, emission?: number): number[];
  // A flat rectangle `w` in front of the wall, facing out.
  panel(u0: number, u1: number, y0: number, y1: number, w: number, color: Vec3, emission?: number): number[];
}

export function faceOf(rect: Rect, side: Side): Face {
  const normal = NORMALS[side];
  const [nx, , nz] = normal;
  const alongX = side === 'minZ' || side === 'maxZ';
  const length = alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
  // The same right-hand direction pixelArt uses.
  const startX = nz > 0 ? rect.minX : nz < 0 ? rect.maxX : rect[side];
  const startZ = nx > 0 ? rect.maxZ : nx < 0 ? rect.minZ : rect[side];
  const point = (u: number, y: number, w: number): Vec3 => [startX + nz * u + nx * w, y, startZ - nx * u + nz * w];
  return {
    side,
    normal,
    length,
    point,
    box(u0, u1, y0, y1, w0, w1, color, emission = 0) {
      const a = point(u0, y0, w0);
      const b = point(u1, y1, w1);
      return box([Math.min(a[0], b[0]), y0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])], color, emission);
    },
    panel(u0, u1, y0, y1, w, color, emission = 0) {
      return quad([point(u0, y0, w), point(u1, y0, w), point(u1, y1, w), point(u0, y1, w)], normal, color, emission);
    },
  };
}
