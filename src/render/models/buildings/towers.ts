import { inset, type Building, type Side } from '../../../game/buildings.ts';
import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { hipRoof, withMaterial } from '../../shapes.ts';
import { floorsBox, parapet, plainBox, seedFrom, type WindowStyleName } from '../facade.ts';
import { chance, combine, faceOf, GROUND, pick, solid, type BuildingModel, type Model } from '../model.ts';
import { neonText, neonTube, textWidth } from '../neon.ts';
import { CONCRETE, GLASS, neonFamily, ROOF_GREY, STONE } from '../palettes.ts';
import { acUnits, antenna } from './rooftop.ts';
import { storefronts } from './shops.ts';
import { TOWER_SIGNS } from './signs.ts';

const LOBBY_FLOORS = 2;
const PIER_SIZE = 0.7;
const MIN_TIER = 12; // m, the narrowest a stepped tier may get
const PIER_COLOR_SCALE = 0.75;

function scaled([r, g, b]: Vec3, by: number): Vec3 {
  return [r * by, g * by, b * by];
}

interface Tier {
  rect: Rect;
  floors: number;
}

function stack(tiers: Tier[], floorHeight: number, color: Vec3, material: number, style: WindowStyleName, random: () => number): { vertices: number[]; colliders: Model['colliders']; top: number } {
  const vertices: number[] = [];
  const colliders: Model['colliders'] = [];
  let y = GROUND;
  for (const { rect, floors } of tiers) {
    const top = y + floors * floorHeight;
    const windows = { style, seed: seedFrom(random) };
    vertices.push(...floorsBox(rect, y, top, floorHeight, color, material, windows, MATERIAL.roofGravel, ROOF_GREY));
    colliders.push(solid(rect, top));
    y = top;
  }
  return { vertices, colliders, top: y };
}

// Slim columns up the corners, so a glass box has a frame to read by.
function cornerPiers(rect: Rect, bottom: number, top: number, color: Vec3): number[] {
  const { minX, minZ, maxX, maxZ } = rect;
  const s = PIER_SIZE;
  const corners: Rect[] = [
    { minX: minX - s / 2, maxX: minX + s / 2, minZ: minZ - s / 2, maxZ: minZ + s / 2 },
    { minX: maxX - s / 2, maxX: maxX + s / 2, minZ: minZ - s / 2, maxZ: minZ + s / 2 },
    { minX: minX - s / 2, maxX: minX + s / 2, minZ: maxZ - s / 2, maxZ: maxZ + s / 2 },
    { minX: maxX - s / 2, maxX: maxX + s / 2, minZ: maxZ - s / 2, maxZ: maxZ + s / 2 },
  ];
  return corners.flatMap((r) => plainBox(r, bottom, top, color, MATERIAL.concreteWall));
}

function lobby(building: Building, colors: Vec3[], random: () => number): number[] {
  const { rect, streets, floorHeight } = building;
  const sides: Side[] = streets.length > 0 ? streets : ['minX', 'maxX', 'minZ', 'maxZ'];
  return storefronts(rect, sides, floorHeight * LOBBY_FLOORS, colors, random);
}

// The name of the building in big letters high on the wall facing a street.
function crownSign(rect: Rect, side: Side, y: number, color: Vec3, random: () => number): number[] {
  const face = faceOf(rect, side);
  const text = pick(TOWER_SIGNS, random);
  const pixel = Math.min(0.9, (face.length - 3) / textWidth(text));
  return neonText(text, face.point(face.length / 2, y, 0.1), face.normal, pixel, color);
}

// Plain curtain wall to a flat top with a lit band.
export const glassSlab: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, streets, neighbourhood } = building;
  const color = pick(GLASS, random);
  const colors = neonFamily(neighbourhood);
  const { vertices, colliders, top } = stack([{ rect, floors }], floorHeight, color, MATERIAL.glassWall, 'curtain', random);
  vertices.push(...cornerPiers(rect, GROUND, top, scaled(color, PIER_COLOR_SCALE)));
  vertices.push(...plainBox(inset(rect, 3), top, top + 3.5, ROOF_GREY, MATERIAL.metalWall));
  vertices.push(...lobby(building, colors, random));
  const band = colors[1];
  for (const side of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
    vertices.push(...neonTube(rect, side, 0, faceOf(rect, side).length, top - 0.6, 0.3, 0.05, band));
  }
  if (streets[0] && chance(0.5, random)) vertices.push(...crownSign(rect, streets[0], top - 4.5, colors[0], random));
  return { vertices, colliders };
};

// Art deco: tiers stepping in towards a spire, on stone piers.
export const steppedDeco: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, neighbourhood } = building;
  const color = pick(STONE, random);
  const shrink = 3 + random() * 2;
  const tierFloors = [0.55, 0.28, 0.17].map((share) => Math.max(2, Math.round(floors * share)));
  const rects = [rect, inset(rect, shrink), inset(rect, 2 * shrink)];
  const tiers: Tier[] = rects.flatMap((r, i) => (Math.min(r.maxX - r.minX, r.maxZ - r.minZ) >= MIN_TIER ? [{ rect: r, floors: tierFloors[i] }] : []));
  const { vertices, colliders, top } = stack(tiers, floorHeight, color, MATERIAL.concreteWall, 'pier', random);
  const last = tiers[tiers.length - 1].rect;
  let y = GROUND;
  for (const { rect: r, floors: f } of tiers) {
    y += f * floorHeight;
    vertices.push(...parapet(r, y, 1, 0.4, color, MATERIAL.concreteWall));
  }
  vertices.push(...lobby(building, neonFamily(neighbourhood), random));
  vertices.push(...antenna((last.minX + last.maxX) / 2, top, (last.minZ + last.maxZ) / 2, 14));
  return { vertices, colliders };
};

// Offices on a wide podium, with a pointed top.
export const podiumTower: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, neighbourhood } = building;
  const podiumFloors = 3;
  const color = pick(CONCRETE, random);
  const glass = pick(GLASS, random);
  const side = Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  const shaftRect = side >= 24 ? inset(rect, 4) : rect;
  const podium = stack([{ rect, floors: podiumFloors }], floorHeight, color, MATERIAL.concreteWall, 'office', random);
  const windows = { style: 'office' as const, seed: seedFrom(random) };
  const y = GROUND + podiumFloors * floorHeight;
  const top = GROUND + Math.max(floors, podiumFloors + 2) * floorHeight;
  const colors = neonFamily(neighbourhood);
  const roofHeight = Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ) * 0.45;
  const { minX, minZ, maxX, maxZ } = shaftRect;
  const halfShort = Math.min(maxX - minX, maxZ - minZ) / 2;
  const vertices = [
    ...podium.vertices,
    ...floorsBox(shaftRect, y, top, floorHeight, glass, MATERIAL.glassWall, windows, MATERIAL.roofGravel, ROOF_GREY),
    ...withMaterial(hipRoof(minX, minZ, maxX, maxZ, top, roofHeight, halfShort, glass), MATERIAL.houseRoof),
    ...lobby(building, colors, random),
    ...antenna((minX + maxX) / 2, top + roofHeight - 0.5, (minZ + maxZ) / 2, 6),
    ...acUnits(rect, y, 2, random),
  ];
  return combine([{ vertices, colliders: [...podium.colliders, solid(shaftRect, top + roofHeight)] }]);
};

// Two slabs of different heights side by side on one base.
export const twinSlab: BuildingModel = (building, random) => {
  const { rect, floors, floorHeight, neighbourhood } = building;
  const color = pick(GLASS, random);
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
  const mid = alongX ? (rect.minX + rect.maxX) / 2 : (rect.minZ + rect.maxZ) / 2;
  const notch = 0.6;
  const a: Rect = alongX ? { ...rect, maxX: mid - notch } : { ...rect, maxZ: mid - notch };
  const b: Rect = alongX ? { ...rect, minX: mid + notch } : { ...rect, minZ: mid + notch };
  const base = stack([{ rect, floors: 2 }], floorHeight, color, MATERIAL.glassWall, 'curtain', random);
  const y = GROUND + 2 * floorHeight;
  const topA = y + (floors - 2) * floorHeight;
  const topB = y + Math.max(3, Math.round((floors - 2) * 0.72)) * floorHeight;
  const windows = { style: 'office' as const, seed: seedFrom(random) };
  const vertices = [
    ...base.vertices,
    ...floorsBox(a, y, topA, floorHeight, color, MATERIAL.glassWall, windows, MATERIAL.roofGravel, ROOF_GREY),
    ...floorsBox(b, y, topB, floorHeight, color, MATERIAL.glassWall, { ...windows, seed: seedFrom(random) }, MATERIAL.roofGravel, ROOF_GREY),
    ...lobby(building, neonFamily(neighbourhood), random),
    ...antenna((a.minX + a.maxX) / 2, topA, (a.minZ + a.maxZ) / 2, 7),
  ];
  return { vertices, colliders: [...base.colliders, solid(a, topA), solid(b, topB)] };
};
