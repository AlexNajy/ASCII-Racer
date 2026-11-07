import type { Building, Side } from '../../../game/buildings.ts';
import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { withMaterial } from '../../shapes.ts';
import { glassStrip, parapet, roofCap, seedFrom, windowWall } from '../facade.ts';
import { chance, combine, faceOf, GROUND, pick, SIDES, solid, type BuildingModel, type Face, type Model } from '../model.ts';
import { neonStack, neonText, neonTube, textWidth } from '../neon.ts';
import { AWNING, neonFamily, ROOF_GREY, SHOP_WALL } from '../palettes.ts';
import { acUnits, billboard } from './rooftop.ts';
import { BLADE_SIGNS, SHOP_SIGNS } from './signs.ts';

const FRONT_HEIGHT = 3.6; // m of glass above the pavement
const FASCIA_HEIGHT = 2.1;
const UNIT_WIDTH = 12; // m, one shop along a street
const GLASS: Vec3 = [0.36, 0.38, 0.42];
const FASCIA: Vec3 = [0.24, 0.24, 0.27];
const SIGN_GLOW = 0.3; // of the neon colour, on the board behind the letters, so a sign still reads as a patch of colour far away
const PIER = 0.5; // m of wall between two shops
const AWNING_DEPTH = 1.4;
const UPPER_ROW = 3.5; // m, the upper floors of a tall shop
const SIGN_PIXEL = 0.27;
const SMALL_SIGN_PIXEL = 0.17;
const BLADE_PIXEL = 0.34;
const SMALL_FASCIA = 1.45; // m, signs over the shops under flats and offices
const PARAPET: Vec3 = [0.3, 0.3, 0.33];

// The band a sign sits on, glowing faintly in the sign's colour if it has one.
function board(face: Face, u0: number, u1: number, y0: number, y1: number, depth: number, sign?: Vec3): number[] {
  const color: Vec3 = sign ? [sign[0] * SIGN_GLOW, sign[1] * SIGN_GLOW, sign[2] * SIGN_GLOW] : FASCIA;
  return withMaterial(face.box(u0, u1, y0, y1, 0, depth, color, sign ? 1 : 0), MATERIAL.default);
}

// One shop on a stretch of street wall.
function shopUnit(rect: Rect, side: Side, u0: number, u1: number, open: boolean, colors: Vec3[], random: () => number): number[] {
  const face = faceOf(rect, side);
  const windows = { style: open ? ('shopfront' as const) : ('closedFront' as const), seed: seedFrom(random) };
  const sign = pick(SHOP_SIGNS, random);
  const y = GROUND + FRONT_HEIGHT;
  const width = u1 - u0;
  const pixel = Math.min(SIGN_PIXEL, (width - 0.8) / textWidth(sign));
  const color = pick(colors, random);
  const centre = face.point((u0 + u1) / 2, y + FASCIA_HEIGHT / 2, 0.14);
  const hasAwning = chance(0.4, random);
  const awningColor = pick(AWNING, random);
  const vertices = [
    ...withMaterial(glassStrip(rect, side, u0, u1, GROUND, y, GLASS, windows), MATERIAL.concreteWall),
    ...board(face, u0, u1, y, y + FASCIA_HEIGHT, 0.14, open ? color : undefined),
  ];
  if (open) vertices.push(...neonText(sign, centre, face.normal, pixel, color));
  if (open && chance(0.5, random)) vertices.push(...neonTube(rect, side, u0 + 0.2, u1 - 0.2, y - 0.12, 0.12, 0.1, color));
  if (hasAwning) {
    const stretch = withMaterial(face.box(u0 + 0.2, u1 - 0.2, y - 0.35, y - 0.15, 0.06, AWNING_DEPTH, awningColor), MATERIAL.awning);
    vertices.push(...stretch);
  }
  return vertices;
}

// A street wall cut into shops of about UNIT_WIDTH.
function shopRow(rect: Rect, side: Side, openShare: number, colors: Vec3[], random: () => number): number[] {
  const { length } = faceOf(rect, side);
  const units = Math.max(1, Math.round(length / UNIT_WIDTH));
  const width = length / units;
  return Array.from({ length: units }).flatMap((_, i) =>
    shopUnit(rect, side, i * width + PIER / 2, (i + 1) * width - PIER / 2, chance(openShare, random), colors, random),
  );
}

// A ground floor of shops or a long lobby, for buildings of flats and offices.
export function storefronts(rect: Rect, streets: Side[], floorHeight: number, colors: Vec3[], random: () => number): number[] {
  return streets.flatMap((side) => {
    const face = faceOf(rect, side);
    const windows = { style: 'lobby' as const, seed: seedFrom(random) };
    const top = GROUND + Math.min(floorHeight - 0.5, 2.9);
    if (chance(0.45, random)) {
      return withMaterial(glassStrip(rect, side, 1, face.length - 1, GROUND, top, GLASS, windows), MATERIAL.concreteWall);
    }
    const units = Math.max(1, Math.round(face.length / UNIT_WIDTH));
    const width = face.length / units;
    return Array.from({ length: units }).flatMap((_, i) => {
      const u0 = i * width + PIER / 2;
      const u1 = (i + 1) * width - PIER / 2;
      const open = chance(0.65, random);
      const sign = pick(SHOP_SIGNS, random);
      const color = pick(colors, random);
      const shopWindows = { style: open ? ('shopfront' as const) : ('closedFront' as const), seed: seedFrom(random) };
      const pixel = Math.min(SMALL_SIGN_PIXEL, (u1 - u0 - 0.8) / textWidth(sign));
      const vertices = withMaterial(glassStrip(rect, side, u0, u1, GROUND, top, GLASS, shopWindows), MATERIAL.concreteWall);
      vertices.push(...board(face, u0, u1, top, top + SMALL_FASCIA, 0.12, open ? color : undefined));
      if (open) vertices.push(...neonText(sign, face.point((u0 + u1) / 2, top + SMALL_FASCIA / 2, 0.12), face.normal, pixel, color));
      return vertices;
    });
  });
}

// A sign sticking out of a wall, letters running down it, fitted between `y` and `maxY`.
export function bladeSign(rect: Rect, side: Side, y: number, maxY: number, color: Vec3, random: () => number): number[] {
  const face = faceOf(rect, side);
  const text = pick(BLADE_SIGNS, random);
  const u = face.length * (chance(0.5, random) ? 0.12 : 0.88);
  const line = 9; // pixels per letter, the gap included
  const pixel = Math.min(BLADE_PIXEL, (maxY - y - 0.5) / (text.length * line));
  const height = text.length * line * pixel + 0.5;
  const out = 1.1;
  const blade = board(face, u - 0.1, u + 0.1, y, y + height, 0.1 + 2 * out, color);
  const centre = (uSide: number): Vec3 => face.point(u + uSide * 0.1, y + height / 2, 0.1 + out);
  // Drivers come along the street, so it faces along the wall both ways.
  const [nx, , nz] = face.normal;
  const along: Vec3 = [nz, 0, -nx];
  const back: Vec3 = [-nz, 0, nx];
  return [...blade, ...neonStack(text, centre(1), along, pixel, color), ...neonStack(text, centre(-1), back, pixel, color)];
}

function shop(building: Building, random: () => number, openShare: number, tube: boolean): Model {
  const { rect, height, avenues, streets, neighbourhood, floorHeight, merged } = building;
  const colors = neonFamily(neighbourhood);
  const wallColor = pick(SHOP_WALL, random);
  const top = GROUND + height;
  const upperWindows = { style: pick(['flat', 'walkup'] as const, random), seed: seedFrom(random) };
  const groundTop = GROUND + floorHeight;
  const walls = SIDES.flatMap((side) => [
    ...(height > floorHeight ? withMaterial(windowWall(rect, side, groundTop, top, UPPER_ROW, wallColor, upperWindows), MATERIAL.stucco) : []),
    ...withMaterial(faceOf(rect, side).panel(0, faceOf(rect, side).length, GROUND, groundTop, 0, wallColor), MATERIAL.stucco),
  ]);
  const fronts = streets.flatMap((side) => shopRow(rect, side, openShare, colors, random));
  const roofLine = tube ? streets.flatMap((side) => neonTube(rect, side, 0, faceOf(rect, side).length, top - 0.3, 0.14, 0.05, colors[0])) : [];
  const roof = [
    ...roofCap(rect, top, ROOF_GREY, MATERIAL.roofGravel),
    ...parapet(rect, top, 0.8, 0.35, PARAPET, MATERIAL.concreteWall),
    ...acUnits(rect, top, 1 + Math.floor(random() * 3), random),
  ];
  const parts: Model[] = [{ vertices: [...walls, ...fronts, ...roofLine, ...roof], colliders: [solid(rect, top)] }];
  const avenueSide = avenues[0];
  if (avenueSide && chance(merged ? 0.5 : 0.2, random)) parts.push(billboard(rect, avenueSide, top, colors, random));
  if (streets.length > 0 && height > floorHeight && chance(0.45, random)) {
    parts.push({ vertices: bladeSign(rect, pick(streets, random), groundTop + 0.5, top, colors[1], random), colliders: [] });
  }
  return combine(parts);
}

export const neonShop: BuildingModel = (building, random) => shop(building, random, 0.85, chance(0.5, random));
export const sleepyShop: BuildingModel = (building, random) => shop(building, random, 0.3, false);
