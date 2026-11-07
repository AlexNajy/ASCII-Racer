import type { Side } from '../../../game/buildings.ts';
import type { Rect } from '../../../game/city.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { gableRoof, hipRoof, withMaterial, withSideColor, withSideMaterial } from '../../shapes.ts';
import { plainBox, seedFrom, windowWall } from '../facade.ts';
import { chance, combine, faceOf, GROUND, pick, SIDES, solid, type BuildingModel, type Model } from '../model.ts';
import { HOUSE_ROOF, HOUSE_WALL } from '../palettes.ts';

const ROOF_ANGLE = 30; // degrees
const EAVE = 0.4; // m of roof past the walls
const DOOR_WIDTH = 1.2;
const DOOR_HEIGHT = 2.2;
const DOOR_COLOR: Vec3 = [0.42, 0.28, 0.2];
const PORCH_LIGHT: Vec3 = [1, 0.8, 0.45];
const STEP_COLOR: Vec3 = [0.5, 0.5, 0.5];
const PORCH_WIDTH = 3;
const PORCH_DEPTH = 1.6;
const PORCH_SPOTS = [0.5, 0.2, 0.8]; // along the wall, in order of preference; a garage may be in the way
const CHIMNEY_COLOR: Vec3 = [0.5, 0.28, 0.24];
const GARAGE_DOOR_COLOR: Vec3 = [0.6, 0.6, 0.58];
const GARAGE_DOOR_HEIGHT = 2.5;

function roofHeight(width: number): number {
  return (Math.tan((ROOF_ANGLE * Math.PI) / 180) * width) / 2;
}

function roof(rect: Rect, y: number, color: Vec3, wallColor: Vec3, hip: boolean): number[] {
  const { minX, minZ, maxX, maxZ } = rect;
  const x0 = minX - EAVE;
  const z0 = minZ - EAVE;
  const x1 = maxX + EAVE;
  const z1 = maxZ + EAVE;
  const short = Math.min(x1 - x0, z1 - z0);
  const height = roofHeight(short);
  if (hip) return withMaterial(hipRoof(x0, z0, x1, z1, y, height, short / 2, color), MATERIAL.houseRoof);
  const vertices = gableRoof(minX, minZ, maxX, maxZ, y, roofHeight(Math.min(maxX - minX, maxZ - minZ)), color);
  // Only the slopes are roof; the gable ends are wall.
  return withSideColor(withSideMaterial(withMaterial(vertices, MATERIAL.houseRoof), MATERIAL.stucco), wallColor);
}

function porch(rect: Rect, side: Side, base: number, garage?: Rect): Model {
  const face = faceOf(rect, side);
  const footprint = (u: number): Rect => {
    const [x0, , z0] = face.point(u - PORCH_WIDTH / 2, 0, 0);
    const [x1, , z1] = face.point(u + PORCH_WIDTH / 2, 0, PORCH_DEPTH);
    return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) };
  };
  const free = PORCH_SPOTS.map((share) => face.length * share).find((u) => {
    const spot = footprint(u);
    return !garage || spot.minX >= garage.maxX || spot.maxX <= garage.minX || spot.minZ >= garage.maxZ || spot.maxZ <= garage.minZ;
  });
  if (free === undefined) return { vertices: [], colliders: [] };
  const u = free;
  const floor = GROUND + base;
  const lamp = floor + DOOR_HEIGHT + 0.2;
  const vertices = [
    ...withMaterial(face.panel(u - DOOR_WIDTH / 2, u + DOOR_WIDTH / 2, floor, floor + DOOR_HEIGHT, 0.04, DOOR_COLOR), MATERIAL.default),
    ...withMaterial(face.box(u - PORCH_WIDTH / 2, u + PORCH_WIDTH / 2, GROUND, floor, 0, PORCH_DEPTH, STEP_COLOR), MATERIAL.concreteWall),
    ...withMaterial(face.box(u - PORCH_WIDTH / 2, u + PORCH_WIDTH / 2, floor + 2.5, floor + 2.7, 0, PORCH_DEPTH, STEP_COLOR), MATERIAL.concreteWall),
    ...withMaterial(face.box(u + DOOR_WIDTH / 2 + 0.2, u + DOOR_WIDTH / 2 + 0.5, lamp - 0.5, lamp - 0.2, 0, 0.15, PORCH_LIGHT, 1), MATERIAL.windowLit),
  ];
  return { vertices, colliders: [solid(footprint(u), floor)] };
}

// Walls with windows on every side, a door on the side towards the street and a pitched roof.
export const house: BuildingModel = (building, random) => {
  const { rect, base, floorHeight, height, entrance, garage: attachedGarage } = building;
  const color = pick(HOUSE_WALL, random);
  const roofColor = pick(HOUSE_ROOF, random);
  const walls = GROUND + height;
  const windows = { style: 'house' as const, seed: seedFrom(random) };
  const hip = chance(0.35, random);
  const [cx, cz] = [rect.minX + (rect.maxX - rect.minX) * (0.3 + random() * 0.4), rect.minZ + (rect.maxZ - rect.minZ) * (0.3 + random() * 0.4)];
  const chimneyTop = walls + roofHeight(Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ)) + 0.8;
  const chimney: Rect = { minX: cx - 0.45, maxX: cx + 0.45, minZ: cz - 0.45, maxZ: cz + 0.45 };
  const vertices = [
    ...plainBox(rect, GROUND, GROUND + base, STEP_COLOR, MATERIAL.concreteWall),
    ...SIDES.flatMap((side) => withMaterial(windowWall(rect, side, GROUND + base, walls, floorHeight, color, windows), MATERIAL.stucco)),
    ...roof(rect, walls, roofColor, color, hip),
    ...plainBox(chimney, walls, chimneyTop, CHIMNEY_COLOR, MATERIAL.default),
  ];
  return combine([{ vertices, colliders: [solid(rect, walls)] }, ...(entrance ? [porch(rect, entrance, base, attachedGarage)] : [])]);
};

// A flat-roofed box with a big door.
export const garage: BuildingModel = (building, random) => {
  const { rect, height, door } = building;
  const color = pick(HOUSE_WALL, random);
  const top = GROUND + height;
  const vertices = plainBox(rect, GROUND, top, color, MATERIAL.stucco, MATERIAL.roofGravel);
  if (door) {
    const face = faceOf(rect, door);
    const margin = face.length * 0.14;
    vertices.push(...withMaterial(face.panel(margin, face.length - margin, GROUND, GROUND + GARAGE_DOOR_HEIGHT, 0.04, GARAGE_DOOR_COLOR), MATERIAL.metalWall));
  }
  return { vertices, colliders: [solid(rect, top)] };
};
