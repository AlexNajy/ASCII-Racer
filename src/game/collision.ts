import type { Vec3 } from '../math/mat4.ts';
import type { Building } from './buildings.ts';
import { CURB_HEIGHT, type Rect } from './city.ts';

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

// Buildings whose roof is below the position are skipped, so the fly camera can pass over them.
export function pushOutOfBuildings(position: Vec3, radius: number, buildings: Building[]): void {
  for (const { rect, height } of buildings) {
    if (position[1] > CURB_HEIGHT + height) continue;
    [position[0], position[2]] = pushOutOfRect(position[0], position[2], radius, rect);
  }
}
