import type { Side } from '../../../game/buildings.ts';
import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { box, cone, flatDisc, withMaterial } from '../../shapes.ts';
import { plainBox } from '../facade.ts';
import { faceOf, GROUND, pick, solid, type Model } from '../model.ts';
import { neonText, textWidth } from '../neon.ts';
import { AWNING, CAR_PAINT } from '../palettes.ts';

const TRUNK_COLOR: Vec3 = [0.3, 0.2, 0.14];
const LEAF_COLORS: readonly Vec3[] = [[0.16, 0.4, 0.17], [0.2, 0.45, 0.2], [0.14, 0.36, 0.22], [0.26, 0.42, 0.14]];
const TRUNK_WIDTH = 0.5;
const TREE_SIDES = 7;
const PLANTER_TREE_SCALE = 0.6;
const BENCH_COLOR: Vec3 = [0.4, 0.28, 0.18];
const PLANTER_COLOR: Vec3 = [0.5, 0.48, 0.45];
const LAMP_COLOR: Vec3 = [1, 0.85, 0.55];
const POST_COLOR: Vec3 = [0.3, 0.3, 0.32];
const DUMPSTER_COLORS: readonly Vec3[] = [[0.16, 0.34, 0.24], [0.2, 0.24, 0.4], [0.32, 0.26, 0.16]];
const CABIN_COLOR: Vec3 = [0.08, 0.1, 0.14];
const TAIL_LIGHT: Vec3 = [0.8, 0.08, 0.05];
const WATER_COLOR: Vec3 = [0.15, 0.35, 0.65];
const KIOSK_COLOR: Vec3 = [0.36, 0.34, 0.3];
const KIOSK_SIGNS = ['NEWS', 'COFFEE', 'TICKETS', 'SNACKS', 'FLOWERS'];
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.8;

const square = (x: number, z: number, half: number): Rect => ({ minX: x - half, minZ: z - half, maxX: x + half, maxZ: z + half });
const area = (x: number, z: number, halfX: number, halfZ: number): Rect => ({ minX: x - halfX, minZ: z - halfZ, maxX: x + halfX, maxZ: z + halfZ });

// Stacked cones. Only the trunk is solid, and it is thick so it can't be a thin surprise at speed.
export function tree(x: number, z: number, ground: number, random: () => number, scale = 1): Model {
  const height = (4 + random() * 3) * scale;
  const radius = (1.5 + random()) * scale;
  const color = pick(LEAF_COLORS, random);
  const trunkTop = ground + height * 0.35;
  const trunk = square(x, z, TRUNK_WIDTH / 2);
  const leaves = [0, 0.35, 0.65].flatMap((share, i) =>
    cone([x, trunkTop + share * height * 0.6, z], radius * (1 - i * 0.22), height * 0.42, TREE_SIDES, color),
  );
  return {
    vertices: [...plainBox(trunk, ground, trunkTop, TRUNK_COLOR, MATERIAL.default), ...withMaterial(leaves, MATERIAL.foliage)],
    colliders: [solid(trunk, ground + height)],
  };
}

export function bench(x: number, z: number, alongX: boolean): Model {
  const rect = alongX ? area(x, z, 1, 0.3) : area(x, z, 0.3, 1);
  return {
    vertices: withMaterial(box([rect.minX, GROUND + 0.3, rect.minZ], [rect.maxX, GROUND + 0.55, rect.maxZ], BENCH_COLOR), MATERIAL.default),
    colliders: [solid(rect, GROUND + 0.55)],
  };
}

export function planter(x: number, z: number, random: () => number): Model {
  const rect = square(x, z, 1);
  const top = GROUND + 0.7;
  const greenery = tree(x, z, top, random, PLANTER_TREE_SCALE);
  return {
    vertices: [...plainBox(rect, GROUND, top, PLANTER_COLOR, MATERIAL.concreteWall), ...greenery.vertices],
    colliders: [solid(rect, top), ...greenery.colliders],
  };
}

// A short post with a glowing top, for paths and squares.
export function bollard(x: number, z: number): Model {
  const post = square(x, z, 0.15);
  const top = GROUND + 1;
  return {
    vertices: [
      ...plainBox(post, GROUND, top, POST_COLOR, MATERIAL.default),
      ...withMaterial(box([x - 0.25, top, z - 0.25], [x + 0.25, top + 0.3, z + 0.25], LAMP_COLOR, 1), MATERIAL.windowLit),
    ],
    colliders: [solid(post, top + 0.3)],
  };
}

export function dumpster(x: number, z: number, alongX: boolean, random: () => number): Model {
  const rect = alongX ? area(x, z, 1.1, 0.6) : area(x, z, 0.6, 1.1);
  const top = GROUND + 1.4;
  return { vertices: plainBox(rect, GROUND, top, pick(DUMPSTER_COLORS, random), MATERIAL.metalWall), colliders: [solid(rect, top)] };
}

// A parked car; its back has red lights, so a row of them reads at night.
export function parkedCar(x: number, z: number, ground: number, facing: Side, random: () => number): Model {
  const alongX = facing === 'minX' || facing === 'maxX';
  const rect = alongX ? area(x, z, CAR_LENGTH / 2, CAR_WIDTH / 2) : area(x, z, CAR_WIDTH / 2, CAR_LENGTH / 2);
  const cabin = alongX ? area(x, z, CAR_LENGTH * 0.27, CAR_WIDTH * 0.42) : area(x, z, CAR_WIDTH * 0.42, CAR_LENGTH * 0.27);
  const paint = pick(CAR_PAINT, random);
  const face = faceOf(rect, ({ minX: 'maxX', maxX: 'minX', minZ: 'maxZ', maxZ: 'minZ' } as const)[facing]);
  const top = ground + 1.45;
  return {
    vertices: [
      ...plainBox(rect, ground + 0.25, ground + 0.95, paint, MATERIAL.metalWall, MATERIAL.default),
      ...plainBox(cabin, ground + 0.95, top, CABIN_COLOR, MATERIAL.windowDark),
      ...withMaterial(face.panel(0.1, 0.5, ground + 0.6, ground + 0.8, 0.03, TAIL_LIGHT, 1), MATERIAL.windowLit),
      ...withMaterial(face.panel(CAR_WIDTH - 0.5, CAR_WIDTH - 0.1, ground + 0.6, ground + 0.8, 0.03, TAIL_LIGHT, 1), MATERIAL.windowLit),
    ],
    colliders: [solid(rect, top)],
  };
}

// A round basin with water, on a square square.
export function fountain(x: number, z: number): Model {
  const rim = square(x, z, 5);
  const top = GROUND + 0.6;
  const pillar = square(x, z, 0.5);
  return {
    vertices: [
      ...plainBox(rim, GROUND, top, PLANTER_COLOR, MATERIAL.concreteWall),
      ...withMaterial(flatDisc([x, top + 0.02, z], 4.6, 12, WATER_COLOR), MATERIAL.water),
      ...plainBox(pillar, top, top + 2, PLANTER_COLOR, MATERIAL.concreteWall),
      ...withMaterial(box([x - 0.9, top + 2, z - 0.9], [x + 0.9, top + 2.3, z + 0.9], WATER_COLOR), MATERIAL.water),
    ],
    colliders: [solid(rim, top)],
  };
}

// A small lit stand with an awning, its hatch towards `side`.
export function kiosk(x: number, z: number, side: Side, random: () => number): Model {
  const rect = square(x, z, 1.6);
  const top = GROUND + 2.6;
  const face = faceOf(rect, side);
  const sign = pick(KIOSK_SIGNS, random);
  const pixel = Math.min(0.08, (face.length - 0.4) / textWidth(sign));
  return {
    vertices: [
      ...plainBox(rect, GROUND, top, KIOSK_COLOR, MATERIAL.metalWall),
      ...withMaterial(face.panel(0.4, face.length - 0.4, GROUND + 1, GROUND + 2, 0.03, LAMP_COLOR, 1), MATERIAL.windowLit),
      ...withMaterial(face.box(0.1, face.length - 0.1, GROUND + 2.05, GROUND + 2.25, 0, 0.9, pick(AWNING, random)), MATERIAL.awning),
      ...neonText(sign, face.point(face.length / 2, GROUND + 2.42, 0), face.normal, pixel, LAMP_COLOR),
    ],
    colliders: [solid(rect, top)],
  };
}
