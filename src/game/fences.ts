import { inset, SETBACK, type Building } from './buildings.ts';
import { Zone, type City, type Rect } from './city.ts';

export const FENCE_THICKNESS = 0.3;
export const FENCE_HEIGHT = 1.8;

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

// Four arms from a post at the centre of each houses block out to the sidewalk, one between each pair of
// neighbouring houses. An arm that runs into a building (a duplex) is left out: the duplex is one lot.
export function houseFences(city: City, buildings: Building[]): Rect[] {
  const half = FENCE_THICKNESS / 2;
  return city.blocks
    .filter(({ zone }) => zone === Zone.Houses)
    .flatMap(({ rect }) => {
      const yard = inset(rect, SETBACK);
      const x = (yard.minX + yard.maxX) / 2;
      const z = (yard.minZ + yard.maxZ) / 2;
      const post: Rect = { minX: x - half, minZ: z - half, maxX: x + half, maxZ: z + half };
      const arms: Rect[] = [
        { ...post, minZ: yard.minZ, maxZ: post.minZ },
        { ...post, minZ: post.maxZ, maxZ: yard.maxZ },
        { ...post, minX: yard.minX, maxX: post.minX },
        { ...post, minX: post.maxX, maxX: yard.maxX },
      ];
      return [post, ...arms.filter((arm) => !buildings.some(({ rect: b }) => overlaps(b, arm)))];
    });
}
