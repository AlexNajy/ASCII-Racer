import { inset, SETBACK, type Building, type Side } from './buildings.ts';
import { Zone, type City, type Rect } from './city.ts';
import { FENCE_THICKNESS } from './fences.ts';

const DRIVEWAY_SHARE = 0.75; // of the garage's door wall
// m, how far a driveway reaches under its garage, so the grass edge isn't in the same plane as the garage wall
const UNDER_GARAGE = 0.1;

function drivewayWidth(garage: Rect, door: Side): number {
  return DRIVEWAY_SHARE * (door === 'minX' || door === 'maxX' ? garage.maxZ - garage.minZ : garage.maxX - garage.minX);
}

// Centred on the door, straight out to the sidewalk.
function straight(garage: Rect, door: Side, yard: Rect): Rect {
  const half = drivewayWidth(garage, door) / 2;
  const x = (garage.minX + garage.maxX) / 2;
  const z = (garage.minZ + garage.maxZ) / 2;
  const acrossX = { minX: x - half, maxX: x + half };
  const acrossZ = { minZ: z - half, maxZ: z + half };
  const driveways: Record<Side, Rect> = {
    minX: { ...acrossZ, minX: yard.minX, maxX: garage.minX + UNDER_GARAGE },
    maxX: { ...acrossZ, minX: garage.maxX - UNDER_GARAGE, maxX: yard.maxX },
    minZ: { ...acrossX, minZ: yard.minZ, maxZ: garage.minZ + UNDER_GARAGE },
    maxZ: { ...acrossX, minZ: garage.maxZ - UNDER_GARAGE, maxZ: yard.maxZ },
  };
  return driveways[door];
}

// In front of the door, from the garage's far end to the street the lot opens to.
function alongside(garage: Rect, door: Side, entrance: Side, yard: Rect): Rect {
  // Narrowed if needed so it stops at the fence along the door's street.
  const room = door === 'minX' || door === 'minZ' ? garage[door] - yard[door] : yard[door] - garage[door];
  const w = Math.min(drivewayWidth(garage, door), room - FENCE_THICKNESS);
  const fronts = {
    minX: { minX: garage.minX - w, maxX: garage.minX + UNDER_GARAGE },
    maxX: { minX: garage.maxX - UNDER_GARAGE, maxX: garage.maxX + w },
    minZ: { minZ: garage.minZ - w, maxZ: garage.minZ + UNDER_GARAGE },
    maxZ: { minZ: garage.maxZ - UNDER_GARAGE, maxZ: garage.maxZ + w },
  };
  const toStreet = {
    minX: { minX: yard.minX, maxX: garage.maxX },
    maxX: { minX: garage.minX, maxX: yard.maxX },
    minZ: { minZ: yard.minZ, maxZ: garage.maxZ },
    maxZ: { minZ: garage.minZ, maxZ: yard.maxZ },
  };
  return { ...garage, ...fronts[door], ...toStreet[entrance] };
}

function cut(rect: Rect, hole: Rect): Rect[] {
  if (hole.minX >= rect.maxX || hole.maxX <= rect.minX || hole.minZ >= rect.maxZ || hole.maxZ <= rect.minZ) return [rect];
  const minZ = Math.max(rect.minZ, hole.minZ);
  const maxZ = Math.min(rect.maxZ, hole.maxZ);
  return [
    { ...rect, maxZ: minZ },
    { ...rect, minZ: maxZ },
    { minX: rect.minX, maxX: hole.minX, minZ, maxZ },
    { minX: hole.maxX, maxX: rect.maxX, minZ, maxZ },
  ].filter((piece) => piece.maxX > piece.minX && piece.maxZ > piece.minZ);
}

// What is left of `rect` with the holes cut out, as rectangles that don't overlap.
export function subtract(rect: Rect, holes: Rect[]): Rect[] {
  return holes.reduce((pieces, hole) => pieces.flatMap((piece) => cut(piece, hole)), [rect]);
}

// A strip from each garage door to the sidewalk of the street its lot opens to.
export function houseDriveways(city: City, buildings: Building[]): Rect[] {
  const yards = city.blocks.filter(({ zone }) => zone === Zone.Houses).map(({ rect }) => inset(rect, SETBACK));
  return buildings
    .filter(({ part }) => part === 'garage')
    .flatMap(({ rect, entrance, door }) => {
      const yard = yards.find((y) => rect.minX >= y.minX && rect.maxX <= y.maxX && rect.minZ >= y.minZ && rect.maxZ <= y.maxZ);
      if (!yard || !entrance || !door) return [];
      return [door === entrance ? straight(rect, door, yard) : alongside(rect, door, entrance, yard)];
    });
}
