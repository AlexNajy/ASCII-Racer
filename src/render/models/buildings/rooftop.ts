import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { BEACON_ID, beam, box, cone, column, withId, withMaterial } from '../../shapes.ts';
import { faceOf, pick, type Model } from '../model.ts';
import { neonText, textWidth } from '../neon.ts';
import { plainBox } from '../facade.ts';
import { ROOF_GREY } from '../palettes.ts';
import { BILLBOARDS } from './signs.ts';

const LEG_COLOR: Vec3 = [0.25, 0.25, 0.27];
const TANK_COLOR: Vec3 = [0.42, 0.34, 0.27];
const BEACON_COLOR: Vec3 = [1, 0.1, 0.08];
const BILLBOARD_HEIGHT = 5;
const BILLBOARD_LIFT = 2.5;
const BILLBOARD_PIXEL = 0.5;

function spot(rect: Rect, margin: number, random: () => number): [number, number] {
  return [
    rect.minX + margin + random() * (rect.maxX - rect.minX - 2 * margin),
    rect.minZ + margin + random() * (rect.maxZ - rect.minZ - 2 * margin),
  ];
}

// A wooden tank on legs, as on New York rooftops.
export function waterTank(rect: Rect, y: number, random: () => number): number[] {
  const [x, z] = spot(rect, 3, random);
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) =>
    box([x + a * 1.1 - 0.12, y, z + b * 1.1 - 0.12], [x + a * 1.1 + 0.12, y + 2.5, z + b * 1.1 + 0.12], LEG_COLOR),
  );
  return withMaterial([...legs, ...column([x, y + 2.5, z], 1.7, 3, 8, TANK_COLOR), ...cone([x, y + 5.5, z], 1.9, 1, 8, TANK_COLOR)], MATERIAL.default);
}

export function acUnits(rect: Rect, y: number, count: number, random: () => number): number[] {
  return Array.from({ length: count }).flatMap(() => {
    const [x, z] = spot(rect, 2, random);
    const width = 1.5 + random() * 2;
    return plainBox({ minX: x - width / 2, minZ: z - 1, maxX: x + width / 2, maxZ: z + 1 }, y, y + 1.2 + random(), ROOF_GREY, MATERIAL.metalWall);
  });
}

// A mast with a red light that blinks with every other one in the city.
export function antenna(x: number, y: number, z: number, height: number): number[] {
  return [
    ...withMaterial(beam([x, y, z], [x + 0.01, y + height, z], 0.3, LEG_COLOR), MATERIAL.default),
    ...withMaterial(withId(box([x - 0.4, y + height, z - 0.4], [x + 0.4, y + height + 0.8, z + 0.4], BEACON_COLOR, 1), BEACON_ID), MATERIAL.neon),
  ];
}

// A lit board on legs along the roof's edge, facing the street on `side`.
export function billboard(rect: Rect, side: 'minX' | 'maxX' | 'minZ' | 'maxZ', y: number, colors: readonly Vec3[], random: () => number): Model {
  const face = faceOf(rect, side);
  const text = pick(BILLBOARDS, random);
  const width = Math.min(face.length - 1, textWidth(text) * BILLBOARD_PIXEL + 2);
  const pixel = (width - 2) / textWidth(text);
  const u0 = (face.length - width) / 2;
  const bottom = y + BILLBOARD_LIFT;
  const top = bottom + BILLBOARD_HEIGHT;
  const board: Vec3 = [0.06, 0.06, 0.08];
  const legs = [u0 + 1, u0 + width - 1].flatMap((u) => face.box(u - 0.15, u + 0.15, y, bottom, -1.2, -0.9, LEG_COLOR));
  return {
    vertices: [
      ...withMaterial([...legs, ...face.box(u0, u0 + width, bottom, top, -1.2, -0.9, board)], MATERIAL.default),
      ...neonText(text, face.point(face.length / 2, (bottom + top) / 2, -0.9), face.normal, Math.min(pixel, 0.6), pick(colors, random)),
    ],
    colliders: [],
  };
}
