import type { Side } from '../../../game/buildings.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { withMaterial } from '../../shapes.ts';
import { glassStrip, parapet, plainBox, seedFrom } from '../facade.ts';
import { combine, faceOf, GROUND, pick, solid, type BuildingModel } from '../model.ts';
import { neonText, neonTube, textWidth } from '../neon.ts';
import { neonFamily, ROOF_GREY, SHOP_WALL, STONE } from '../palettes.ts';
import { acUnits, billboard } from './rooftop.ts';
import { MALL_SIGNS, MARKET_SIGNS } from './signs.ts';

const GLASS: Vec3 = [0.36, 0.38, 0.42];
const ENTRANCE_HEIGHT = 4.5;
const SIGN_PIXEL = 0.42;
const CANOPY_DEPTH = 2.5;

function front(rect: Parameters<typeof faceOf>[0], side: Side, top: number, sign: string, color: Vec3, random: () => number): number[] {
  const face = faceOf(rect, side);
  const width = face.length * 0.7;
  const u0 = (face.length - width) / 2;
  const y = GROUND + ENTRANCE_HEIGHT;
  const pixel = Math.min(SIGN_PIXEL, (face.length - 4) / textWidth(sign), (top - y - 0.6) / 7);
  return [
    ...withMaterial(glassStrip(rect, side, u0, u0 + width, GROUND, y, GLASS, { style: 'shopfront', seed: seedFrom(random) }), MATERIAL.concreteWall),
    ...withMaterial(face.box(u0 - 0.5, u0 + width + 0.5, y, y + 0.3, 0, CANOPY_DEPTH, ROOF_GREY), MATERIAL.concreteWall),
    ...neonText(sign, face.point(face.length / 2, (y + top) / 2 + 0.15, 0.02), face.normal, pixel, color),
    ...neonTube(rect, side, 0, face.length, top - 0.25, 0.15, 0.05, color),
  ];
}

// The side with the most street frontage, the avenue first.
const mainSide = (avenues: Side[], streets: Side[], fallback: Side): Side => avenues[0] ?? streets[0] ?? fallback;

// A big block of shops: glass entrances on every street and a name on the main one.
export const mall: BuildingModel = (building, random) => {
  const { rect, height, avenues, streets, neighbourhood } = building;
  const color = pick(STONE, random);
  const top = GROUND + height;
  const colors = neonFamily(neighbourhood);
  const main = mainSide(avenues, streets, 'maxZ');
  const vertices = [
    ...plainBox(rect, GROUND, top, color, MATERIAL.concreteWall, MATERIAL.roofGravel),
    ...parapet(rect, top, 1, 0.5, color, MATERIAL.concreteWall),
    ...front(rect, main, top, pick(MALL_SIGNS, random), colors[0], random),
    ...acUnits(rect, top, 5, random),
  ];
  return combine([{ vertices, colliders: [solid(rect, top)] }, billboard(rect, main, top, colors, random)]);
};

// A box with its entrance towards its car park.
export const superstore: BuildingModel = (building, random) => {
  const { rect, height, neighbourhood, entrance = 'maxZ' } = building;
  const top = GROUND + height;
  const color = pick(SHOP_WALL, random);
  const colors = neonFamily(neighbourhood);
  const vertices = [
    ...plainBox(rect, GROUND, top, color, MATERIAL.metalWall, MATERIAL.roofGravel),
    ...parapet(rect, top, 0.7, 0.4, color, MATERIAL.metalWall),
    ...front(rect, entrance, top, pick(MARKET_SIGNS, random), colors[0], random),
    ...acUnits(rect, top, 6, random),
  ];
  return { vertices, colliders: [solid(rect, top)] };
};
