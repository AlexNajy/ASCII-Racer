import type { Building, Side } from '../../../game/buildings.ts';
import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { inset } from '../../../game/buildings.ts';
import { MATERIAL } from '../../materials.ts';
import { beam, withMaterial } from '../../shapes.ts';
import { floorsBox, parapet, plainBox, roofCap, seedFrom, windowWall, type WindowStyleName } from '../facade.ts';
import { chance, combine, faceOf, GROUND, pick, SIDES, solid, type BuildingModel, type Model } from '../model.ts';
import { neonFamily, BRICK, CONCRETE, ROOF_GREY, STONE, STUCCO } from '../palettes.ts';
import { acUnits, antenna, billboard, waterTank } from './rooftop.ts';
import { bladeSign, storefronts } from './shops.ts';

const CORNICE_HEIGHT = 0.7;
const CORNICE_OUT = 0.5;
const PARAPET_HEIGHT = 1;
const ESCAPE_COLOR: Vec3 = [0.2, 0.2, 0.22];
const ESCAPE_DEPTH = 1.2;
const ESCAPE_WIDTH = 5;
const BALCONY_DEPTH = 0.9;
const BALCONY_WIDTH = 2;
const BALCONY_COLOR: Vec3 = [0.4, 0.4, 0.42];
const BLADE_SHARE = 0.55;
const BILLBOARD_SHARE = 0.25;

// Walls of windows above a ground floor of shops or lobby, plus the roof.
function body(rect: Rect, floors: number, floorHeight: number, color: Vec3, material: number, style: WindowStyleName, colors: Vec3[], streets: Side[], random: () => number): number[] {
  const windows = { style, seed: seedFrom(random) };
  const top = GROUND + floors * floorHeight;
  const ground = GROUND + floorHeight;
  const plinth = plainBox(rect, GROUND, ground, color, material);
  return [
    ...plinth,
    ...floorsBox(rect, ground, top, floorHeight, color, material, windows, MATERIAL.roofGravel, ROOF_GREY),
    ...storefronts(rect, streets, floorHeight, colors, random),
  ];
}

function cornice(rect: Rect, y: number, color: Vec3, material: number): number[] {
  return plainBox(inset(rect, -CORNICE_OUT), y, y + CORNICE_HEIGHT, color, material);
}

// Landings and stairs zigzagging up a wall.
function fireEscape(rect: Rect, side: Side, floors: number, floorHeight: number): number[] {
  const face = faceOf(rect, side);
  const u0 = face.length * 0.3;
  const vertices: number[] = [];
  for (let floor = 1; floor < floors; floor++) {
    const y = GROUND + floor * floorHeight;
    vertices.push(...face.box(u0, u0 + ESCAPE_WIDTH, y, y + 0.15, 0, ESCAPE_DEPTH, ESCAPE_COLOR));
    vertices.push(...face.box(u0, u0 + ESCAPE_WIDTH, y + 0.9, y + 1, ESCAPE_DEPTH - 0.1, ESCAPE_DEPTH, ESCAPE_COLOR));
    if (floor === floors - 1) break;
    const [a, b] = floor % 2 === 0 ? [u0 + 0.3, u0 + ESCAPE_WIDTH - 0.3] : [u0 + ESCAPE_WIDTH - 0.3, u0 + 0.3];
    vertices.push(...beam(face.point(a, y, ESCAPE_DEPTH / 2), face.point(b, y + floorHeight, ESCAPE_DEPTH / 2), 0.2, ESCAPE_COLOR));
  }
  return withMaterial(vertices, MATERIAL.default);
}

// Slabs in front of every other bay, on each floor.
function balconies(rect: Rect, side: Side, floors: number, floorHeight: number, pitch: number): number[] {
  const face = faceOf(rect, side);
  const count = Math.floor(face.length / pitch);
  const margin = (face.length - count * pitch) / 2;
  const vertices: number[] = [];
  for (let floor = 1; floor < floors; floor++) {
    const y = GROUND + floor * floorHeight;
    for (let bay = 0; bay < count; bay++) {
      const u = margin + (bay + 0.5) * pitch;
      vertices.push(...face.box(u - BALCONY_WIDTH / 2, u + BALCONY_WIDTH / 2, y, y + 0.9, 0, BALCONY_DEPTH, BALCONY_COLOR));
    }
  }
  return withMaterial(vertices, MATERIAL.concreteWall);
}

// On an avenue, some flats let their walls and roof out to advertisers.
function advertising({ rect, avenues, neighbourhood, floorHeight, height }: Building, random: () => number): Model[] {
  const front = avenues[0];
  if (!front) return [];
  const colors = neonFamily(neighbourhood);
  const top = GROUND + height;
  const models: Model[] = [];
  if (chance(BLADE_SHARE, random)) models.push({ vertices: bladeSign(rect, front, GROUND + floorHeight + 1.5, top, colors[1], random), colliders: [] });
  if (chance(BILLBOARD_SHARE, random)) models.push(billboard(rect, front, top, colors, random));
  return models;
}

function done(building: Building, vertices: number[], random: () => number, ...extras: Model[]): Model {
  return combine([{ vertices, colliders: [solid(building.rect, GROUND + building.height)] }, ...advertising(building, random), ...extras]);
}

// Brick walls, a cornice, a fire escape on a street and a water tank.
export const brickWalkup: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, streets, neighbourhood, height } = building;
  const color = pick(BRICK, random);
  const top = GROUND + height;
  const fronts = streets.length > 0 ? streets : ['maxZ' as const];
  const vertices = [
    ...body(rect, floors, floorHeight, color, MATERIAL.brick, 'walkup', neonFamily(neighbourhood), streets, random),
    ...cornice(rect, top - CORNICE_HEIGHT, pick(STONE, random), MATERIAL.concreteWall),
    ...fireEscape(rect, pick(fronts, random), floors, floorHeight),
    ...waterTank(rect, top, random),
  ];
  return done(building, vertices, random);
};

// Plain concrete slabs of flats, with balconies.
export const concreteFlats: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, streets, neighbourhood, height } = building;
  const color = pick(CONCRETE, random);
  const top = GROUND + height;
  const style = pick(['flat', 'ribbon'] as const, random);
  const vertices = [
    ...body(rect, floors, floorHeight, color, MATERIAL.concreteWall, style, neonFamily(neighbourhood), streets, random),
    ...parapet(rect, top, PARAPET_HEIGHT, 0.4, color, MATERIAL.concreteWall),
    ...streets.flatMap((side) => balconies(rect, side, floors, floorHeight, 6.4)),
    ...acUnits(rect, top, 3, random),
  ];
  return done(building, vertices, random);
};

// Plaster walls, the top floors set back as a penthouse.
export const steppedFlats: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, streets, neighbourhood } = building;
  const color = pick(STUCCO, random);
  const penthouseFloors = 2;
  const lower = Math.max(1, floors - penthouseFloors);
  const y = GROUND + lower * floorHeight;
  const top = GROUND + floors * floorHeight;
  const upper = inset(rect, 3);
  const windows = { style: 'flat' as const, seed: seedFrom(random) };
  const vertices = [
    ...body(rect, lower, floorHeight, color, MATERIAL.stucco, 'flat', neonFamily(neighbourhood), streets, random),
    ...parapet(rect, y, 0.9, 0.3, color, MATERIAL.stucco),
    ...floorsBox(upper, y, top, floorHeight, color, MATERIAL.stucco, windows, MATERIAL.roofGravel, ROOF_GREY),
    ...parapet(upper, top, 0.7, 0.3, color, MATERIAL.stucco),
    ...acUnits(upper, top, 2, random),
  ];
  return { vertices, colliders: [solid(rect, y), solid(upper, top)] };
};

// Lit rooms, a sign down the front and a board on the roof.
export const hotel: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, streets, avenues, neighbourhood, height } = building;
  const colors = neonFamily(neighbourhood);
  const color = pick(STONE, random);
  const top = GROUND + height;
  const front = avenues[0] ?? streets[0] ?? 'maxZ';
  const vertices = [
    ...body(rect, floors, floorHeight, color, MATERIAL.concreteWall, 'hotel', colors, streets, random),
    ...cornice(rect, top - CORNICE_HEIGHT, color, MATERIAL.concreteWall),
    ...bladeSign(rect, front, GROUND + 2 * floorHeight, top, colors[0], random),
    ...antenna(rect.minX + 3, top, rect.minZ + 3, 8),
  ];
  return combine([{ vertices, colliders: [solid(rect, top)] }, billboard(rect, front, top, colors, random)]);
};

// The city's outer wall: nobody sees its back, so no details there.
export const wallBlock: BuildingModel = (building, random) => {
  const { rect, floorHeight, streets, neighbourhood, height } = building;
  const material = pick([MATERIAL.brick, MATERIAL.concreteWall, MATERIAL.stucco], random);
  const palette = material === MATERIAL.brick ? BRICK : material === MATERIAL.stucco ? STUCCO : CONCRETE;
  const color = pick(palette, random);
  const top = GROUND + height;
  const style = pick(['flat', 'walkup', 'ribbon', 'hotel'] as const, random);
  const windows = { style, seed: seedFrom(random) };
  const street = streets[0];
  const vertices = SIDES.flatMap((side) => withMaterial(windowWall(rect, side, GROUND + floorHeight, top, floorHeight, color, windows), material));
  vertices.push(...plainBox(rect, GROUND, GROUND + floorHeight, color, material));
  vertices.push(...roofCap(rect, top, ROOF_GREY, MATERIAL.roofGravel));
  vertices.push(...parapet(rect, top, PARAPET_HEIGHT, 0.4, color, material));
  if (street) vertices.push(...storefronts(rect, [street], floorHeight, neonFamily(neighbourhood), random));
  if (chance(0.4, random)) vertices.push(...waterTank(rect, top, random));
  return done(building, vertices, random);
};
