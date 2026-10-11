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

// How far along the segment from `from` to `to` it first enters a collider, from 0 to 1; 1 if it hits nothing.
// Colliders are boxes from the ground (y 0) up to `top`. Ones the segment starts inside are skipped.
export function segmentHit(from: Vec3, to: Vec3, colliders: Collider[]): number {
  let nearest = 1;
  for (const { rect, top } of colliders) {
    // Slab test: on each axis the segment is between the box's two faces for one stretch of t;
    // it is inside the box where all three stretches overlap.
    let enter = 0;
    let exit = nearest;
    const mins = [rect.minX, 0, rect.minZ];
    const maxes = [rect.maxX, top, rect.maxZ];
    for (let axis = 0; axis < 3 && enter <= exit; axis++) {
      const start = from[axis];
      const delta = to[axis] - start;
      if (delta === 0) {
        if (start < mins[axis] || start > maxes[axis]) exit = -1;
        continue;
      }
      const t1 = (mins[axis] - start) / delta;
      const t2 = (maxes[axis] - start) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
    const startsInside = enter === 0;
    if (enter <= exit && !startsInside) nearest = enter;
  }
  return nearest;
}
