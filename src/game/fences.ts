import { inset, SETBACK, type Building, type Side } from './buildings.ts';
import { Zone, type City, type Rect } from './city.ts';

export const FENCE_THICKNESS = 0.3;
export const FENCE_HEIGHT = 1.8;

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function inside(rect: Rect, block: Rect): boolean {
  const x = (rect.minX + rect.maxX) / 2;
  const z = (rect.minZ + rect.maxZ) / 2;
  return x > block.minX && x < block.maxX && z > block.minZ && z < block.maxZ;
}

// Four arms from a post at the centre of each houses block out to the sidewalk, one between each pair of
// neighbouring houses. An arm that runs into a building (a big house) is left out: the big house is one lot.
// Each lot is also fenced where its grass meets the sidewalk, except on its entrance side.
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
      const blockBuildings = buildings.filter((building) => inside(building.rect, rect));
      const edges = blockBuildings
        .filter(({ part }) => part === 'house')
        .flatMap(({ rect: house, entrance }) => {
          // The quarter, or for a big house the half, of the block the house stands on.
          const lot: Rect = {
            minX: house.minX < x ? yard.minX : x,
            minZ: house.minZ < z ? yard.minZ : z,
            maxX: house.maxX > x ? yard.maxX : x,
            maxZ: house.maxZ > z ? yard.maxZ : z,
          };
          // Ends on a centre line stop at the arm there.
          const minX = lot.minX === x ? x + half : lot.minX;
          const maxX = lot.maxX === x ? x - half : lot.maxX;
          const minZ = lot.minZ === z ? z + half : lot.minZ;
          const maxZ = lot.maxZ === z ? z - half : lot.maxZ;
          const sides: Record<Side, Rect> = {
            minX: { minX: yard.minX, maxX: yard.minX + FENCE_THICKNESS, minZ, maxZ },
            maxX: { minX: yard.maxX - FENCE_THICKNESS, maxX: yard.maxX, minZ, maxZ },
            minZ: { minX, maxX, minZ: yard.minZ, maxZ: yard.minZ + FENCE_THICKNESS },
            maxZ: { minX, maxX, minZ: yard.maxZ - FENCE_THICKNESS, maxZ: yard.maxZ },
          };
          return (Object.keys(sides) as Side[])
            .filter((side) => side !== entrance && lot[side] === yard[side])
            .map((side) => sides[side]);
        });
      return [post, ...arms.filter((arm) => !blockBuildings.some(({ rect: b }) => overlaps(b, arm))), ...edges];
    });
}
