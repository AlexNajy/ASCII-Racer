import { SETBACK, type Building } from './buildings.ts';
import { Zone, type Block, type Rect } from './city.ts';

const ENTRANCE_WIDTH = 11; // m, the gap in the sidewalk where cars drive in

type Side = 'minX' | 'maxX' | 'minZ' | 'maxZ';

function centre(rect: Rect): [number, number] {
  return [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
}

// The raised parts of a car park block. Everything else is left open, at road level, so the road shows through.
// A sidewalk runs around the edge with an entrance gap on one side; a supermarket's half under its store is
// raised too, and its entrance is on the car park side.
export function lotPavements(block: Block, buildings: Building[]): Rect[] {
  const { rect } = block;
  const [x, z] = centre(rect);
  const raised: Rect[] = [];
  let entrance: Side;
  if (block.zone === Zone.Supermarket) {
    const store = buildings.find(({ rect: b }) => {
      const [bx, bz] = centre(b);
      return bx > rect.minX && bx < rect.maxX && bz > rect.minZ && bz < rect.maxZ;
    });
    const [sx, sz] = store ? centre(store.rect) : [x, z];
    if (Math.abs(sx - x) > Math.abs(sz - z)) {
      raised.push(sx > x ? { ...rect, minX: x } : { ...rect, maxX: x });
      entrance = sx > x ? 'minX' : 'maxX';
    } else {
      raised.push(sz > z ? { ...rect, minZ: z } : { ...rect, maxZ: z });
      entrance = sz > z ? 'minZ' : 'maxZ';
    }
  } else {
    // Facing the city centre.
    entrance = Math.abs(x) > Math.abs(z) ? (x > 0 ? 'minX' : 'maxX') : z > 0 ? 'minZ' : 'maxZ';
  }
  return [...raised, ...sidewalk(rect, entrance)];
}

// A ring of SETBACK wide strips around the rect, with the entrance gap in the middle of one side.
function sidewalk(rect: Rect, entrance: Side): Rect[] {
  const w = SETBACK;
  const strips: Record<Side, Rect> = {
    minZ: { ...rect, maxZ: rect.minZ + w },
    maxZ: { ...rect, minZ: rect.maxZ - w },
    minX: { ...rect, maxX: rect.minX + w, minZ: rect.minZ + w, maxZ: rect.maxZ - w },
    maxX: { ...rect, minX: rect.maxX - w, minZ: rect.minZ + w, maxZ: rect.maxZ - w },
  };
  const result: Rect[] = [];
  for (const side of Object.keys(strips) as Side[]) {
    const strip = strips[side];
    if (side !== entrance) {
      result.push(strip);
      continue;
    }
    const [cx, cz] = centre(strip);
    const gap = ENTRANCE_WIDTH / 2;
    if (side === 'minZ' || side === 'maxZ') {
      result.push({ ...strip, maxX: cx - gap }, { ...strip, minX: cx + gap });
    } else {
      result.push({ ...strip, maxZ: cz - gap }, { ...strip, minZ: cz + gap });
    }
  }
  return result;
}
