import type { Vec3 } from '../math/mat4.ts';
import type { Building } from './buildings.ts';
import { CURB_HEIGHT, type Rect } from './city.ts';
import {
  STOP_SIGN_HEIGHT,
  STOP_SIGN_POLE_WIDTH,
  TRAFFIC_LIGHT_POLE_HEIGHT,
  TRAFFIC_LIGHT_POLE_WIDTH,
  WALK_POLE_HEIGHT,
  type Intersections,
} from './intersections.ts';
import { STREET_LIGHT_POLE_HEIGHT, STREET_LIGHT_POLE_WIDTH, type StreetLight } from './streetLights.ts';

// Something solid, seen from above, standing on the pavement up to `top`.
export interface Collider {
  rect: Rect;
  top: number;
}

// Pushes a circle (centre x, z) out of a rectangle, seen from above. Returns the new centre,
// unchanged if they don't overlap. Only the overlapping part of a move is undone, so the circle slides along walls.
// Math.sqrt is exact in every browser.
export function pushOutOfRect(x: number, z: number, radius: number, rect: Rect): [number, number] {
  const closestX = Math.min(Math.max(x, rect.minX), rect.maxX);
  const closestZ = Math.min(Math.max(z, rect.minZ), rect.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared >= radius * radius) return [x, z];

  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    const push = (radius - distance) / distance;
    return [x + dx * push, z + dz * push];
  }

  const toMinX = x - rect.minX;
  const toMaxX = rect.maxX - x;
  const toMinZ = z - rect.minZ;
  const toMaxZ = rect.maxZ - z;
  const nearest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
  if (nearest === toMinX) return [rect.minX - radius, z];
  if (nearest === toMaxX) return [rect.maxX + radius, z];
  if (nearest === toMinZ) return [x, rect.minZ - radius];
  return [x, rect.maxZ + radius];
}

// A square pole centred on (x, z).
function pole(x: number, z: number, width: number, height: number): Collider {
  const half = width / 2;
  return { rect: { minX: x - half, minZ: z - half, maxX: x + half, maxZ: z + half }, top: CURB_HEIGHT + height };
}

// Everything in the city the camera (later the car) can bump into. Only poles for the street furniture:
// arms, signal heads and signs hang overhead, above anything driving.
export function cityColliders(buildings: Building[], streetLights: StreetLight[], intersections: Intersections): Collider[] {
  return [
    ...buildings.map(({ rect, height }) => ({ rect, top: CURB_HEIGHT + height })),
    ...streetLights.map(({ x, z }) => pole(x, z, STREET_LIGHT_POLE_WIDTH, STREET_LIGHT_POLE_HEIGHT)),
    ...intersections.trafficLights.map(({ x, z, heads }) =>
      pole(x, z, TRAFFIC_LIGHT_POLE_WIDTH, heads.length > 0 ? TRAFFIC_LIGHT_POLE_HEIGHT : WALK_POLE_HEIGHT),
    ),
    ...intersections.stopSigns.map(({ x, z }) => pole(x, z, STOP_SIGN_POLE_WIDTH, STOP_SIGN_HEIGHT)),
  ];
}

// Colliders whose top is below the position are skipped, so the fly camera can pass over them.
export function pushOutOfColliders(position: Vec3, radius: number, colliders: Collider[]): void {
  for (const { rect, top } of colliders) {
    if (position[1] > top) continue;
    [position[0], position[2]] = pushOutOfRect(position[0], position[2], radius, rect);
  }
}
