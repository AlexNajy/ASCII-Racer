import type { OpenLot, Side } from '../../../game/buildings.ts';
import { CURB_HEIGHT, subtract, type City, type Rect } from '../../../game/city.ts';
import { POND_RADIUS } from '../../../game/park.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { MATERIAL } from '../../materials.ts';
import { box, withMaterial } from '../../shapes.ts';
import { combine, GROUND, solid, type Model } from '../model.ts';
import { plainBox } from '../facade.ts';
import { bench, bollard, CAR_LENGTH, dumpster, fountain, kiosk, parkedCar, planter, tree } from './props.ts';

const LINE_COLOR: Vec3 = [0.8, 0.8, 0.8];
const PATH_COLOR: Vec3 = [0.55, 0.55, 0.52];
const LINE_WIDTH = 0.2;
const BAY_WIDTH = 2.8;
const BAY_DEPTH = 5.4;
const AISLE_WIDTH = 7;
const PARKED_SHARE = 0.45;
const SEATING_SPACING = 7;
const MIN_SEATING_WIDTH = 4;
const PARK_PATH_WIDTH = 3;
const PARK_TREES = 22;
const TREE_CLEARANCE = 3; // m from the edges of what a tree avoids
const YARD_TREE_CHANCE = 0.6;
const YARD_TREE_MARGIN = 1.5; // m from fences and walls
const YARD_MIN_SIZE = 3 + 2 * YARD_TREE_MARGIN;
const GATE_COLOR: Vec3 = [0.3, 0.3, 0.33];
const GATE_BAR = 0.25;
const GATE_BAR_GAP = 0.9;
const GATE_HEIGHT = 3.5;
const ALLEY_END_HEIGHT = 8;
const ALLEY_END_COLOR: Vec3 = [0.3, 0.27, 0.25];

function paint(rect: Rect, y: number): number[] {
  return withMaterial(box([rect.minX, y, rect.minZ], [rect.maxX, y + 0.02, rect.maxZ], LINE_COLOR), MATERIAL.roadMarkings);
}

// Aisles run in from the entrance, so a car drives straight in. Rows of bays either side of each aisle, the middle
// aisle on the entrance gap. u runs across the entrance, v away from it.
function parking({ rect, entrance }: OpenLot, random: () => number): Model {
  const side: Side = entrance ?? (rect.maxX - rect.minX > rect.maxZ - rect.minZ ? 'minX' : 'minZ');
  const ground = entrance ? 0 : CURB_HEIGHT;
  const acrossX = side === 'minZ' || side === 'maxZ';
  const uMin = acrossX ? rect.minX : rect.minZ;
  const uMax = acrossX ? rect.maxX : rect.maxZ;
  const vMin = acrossX ? rect.minZ : rect.minX;
  const vMax = acrossX ? rect.maxZ : rect.maxX;
  const at = (u: number, v: number): [number, number] => (acrossX ? [u, v] : [v, u]);
  const mapped = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const [x0, z0] = at(u0, v0);
    const [x1, z1] = at(u1, v1);
    return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) };
  };
  const uMid = (uMin + uMax) / 2;
  // Bays hang off both sides of the middle aisle, then off both sides of further aisles.
  const rows: { start: number; direction: 1 | -1 }[] = [];
  for (const direction of [-1, 1] as const) {
    let edge = uMid + (direction * AISLE_WIDTH) / 2;
    const limit = direction < 0 ? uMin : uMax;
    while ((limit - edge) * direction >= BAY_DEPTH) {
      rows.push({ start: edge, direction });
      edge += direction * BAY_DEPTH;
      if ((limit - edge) * direction >= BAY_DEPTH) {
        rows.push({ start: edge + direction * BAY_DEPTH, direction: direction === 1 ? -1 : 1 });
        edge += direction * (BAY_DEPTH + AISLE_WIDTH);
      } else break;
    }
  }
  const models: Model[] = [];
  const vertices: number[] = [];
  const carFacing: Side = acrossX ? 'minX' : 'minZ';
  const count = Math.floor((vMax - vMin - 2) / BAY_WIDTH);
  const vStart = vMin + (vMax - vMin - count * BAY_WIDTH) / 2;
  for (const { start, direction } of rows) {
    const uEnd = start + direction * BAY_DEPTH;
    for (let bay = 0; bay <= count; bay++) {
      const v = vStart + bay * BAY_WIDTH;
      vertices.push(...paint(mapped(start, uEnd, v - LINE_WIDTH / 2, v + LINE_WIDTH / 2), ground));
    }
    for (let bay = 0; bay < count; bay++) {
      const parked = random() < PARKED_SHARE;
      const offset = random();
      if (!parked) continue;
      const u = (start + uEnd) / 2 + (offset - 0.5) * (BAY_DEPTH - CAR_LENGTH) * 0.8;
      const [x, z] = at(u, vStart + (bay + 0.5) * BAY_WIDTH);
      models.push(parkedCar(x, z, ground, carFacing, random));
    }
  }
  return combine([{ vertices, colliders: [] }, ...models]);
}

function seating({ rect }: OpenLot, random: () => number): Model {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  if (Math.min(width, depth) < MIN_SEATING_WIDTH) return { vertices: [], colliders: [] };
  const alongX = width >= depth;
  const length = alongX ? width : depth;
  const count = Math.floor(length / SEATING_SPACING);
  const models: Model[] = [];
  const [cx, cz] = [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
  for (let i = 0; i < count; i++) {
    const along = (i + 0.5) * (length / count) - length / 2;
    const [x, z] = alongX ? [cx + along, cz] : [cx, cz + along];
    const kind = i % 3;
    if (kind === 0) models.push(planter(x, z, random));
    else if (kind === 1) models.push(bench(x, z, alongX));
    else models.push(bollard(x, z));
  }
  return combine(models);
}

function plaza({ rect }: OpenLot, random: () => number): Model {
  const [cx, cz] = [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
  const reach = (rect.maxX - rect.minX) / 2 - 6;
  const models: Model[] = [fountain(cx, cz)];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    models.push(planter(cx + a * reach, cz + b * reach, random));
    models.push(bollard(cx + a * reach * 0.5, cz + b * reach * 0.5));
    models.push(bench(cx + a * reach * 0.6, cz + b * 9, true));
    models.push(bench(cx + a * 9, cz + b * reach * 0.6, false));
  }
  models.push(kiosk(cx + reach * 0.75, cz, 'minX', random));
  return combine(models);
}

// Paths from the middle of each side to the pond, trees everywhere else, lamps along the paths.
function park({ rect }: OpenLot, random: () => number): Model {
  const [cx, cz] = [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
  const half = PARK_PATH_WIDTH / 2;
  const paths: Rect[] = [
    { ...rect, minX: cx - half, maxX: cx + half },
    { ...rect, minZ: cz - half, maxZ: cz + half },
  ];
  const y = GROUND + 0.03;
  const models: Model[] = [
    { vertices: withMaterial(paths.flatMap((p) => box([p.minX, GROUND, p.minZ], [p.maxX, y, p.maxZ], PATH_COLOR)), MATERIAL.concrete), colliders: [] },
  ];
  const lampAt = POND_RADIUS + 5;
  for (const direction of [-1, 1]) {
    models.push(bollard(cx + direction * lampAt, cz + half + 0.6));
    models.push(bollard(cx - half - 0.6, cz + direction * lampAt));
    models.push(bench(cx + direction * (lampAt + 4), cz - half - 0.8, true));
  }
  models.push(kiosk(cx + half + 3, cz + POND_RADIUS + 6, 'minX', random));
  for (let i = 0; i < PARK_TREES; i++) {
    const x = rect.minX + random() * (rect.maxX - rect.minX);
    const z = rect.minZ + random() * (rect.maxZ - rect.minZ);
    const onPath = Math.abs(x - cx) < half + TREE_CLEARANCE || Math.abs(z - cz) < half + TREE_CLEARANCE;
    const nearPond = Math.hypot(x - cx, z - cz) < POND_RADIUS + TREE_CLEARANCE;
    if (!onPath && !nearPond) models.push(tree(x, z, GROUND, random));
  }
  return combine(models);
}

// Along one edge, so a car still fits past.
function alley({ rect }: OpenLot, random: () => number): Model {
  const alongX = rect.maxX - rect.minX > rect.maxZ - rect.minZ;
  const share = 0.15 + random() * 0.7;
  const flip = random() < 0.5;
  const x = alongX ? rect.minX + share * (rect.maxX - rect.minX) : flip ? rect.minX + 0.7 : rect.maxX - 0.7;
  const z = alongX ? (flip ? rect.minZ + 0.7 : rect.maxZ - 0.7) : rect.minZ + share * (rect.maxZ - rect.minZ);
  return dumpster(x, z, alongX, random);
}

function yard({ rect }: OpenLot, random: () => number): Model {
  const [cx, cz] = [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
  return combine([dumpster(cx - 3, cz, true, random), dumpster(cx + 3, cz, true, random)]);
}

const USES: Record<OpenLot['use'], (lot: OpenLot, random: () => number) => Model> = { parking, seating, plaza, park, alley, yard };

export function openLotModel(lot: OpenLot, random: () => number): Model {
  return USES[lot.use](lot, random);
}

// A few trees on the free grass of each house block, kept out of buildings, driveways and fences.
export function yardTrees(yard: Rect, taken: Rect[], random: () => number): Model {
  const free = subtract(yard, taken).filter((r) => Math.min(r.maxX - r.minX, r.maxZ - r.minZ) >= YARD_MIN_SIZE);
  return combine(
    free.flatMap((r) => {
      const planted = random() < YARD_TREE_CHANCE;
      const x = r.minX + YARD_TREE_MARGIN + random() * (r.maxX - r.minX - 2 * YARD_TREE_MARGIN);
      const z = r.minZ + YARD_TREE_MARGIN + random() * (r.maxZ - r.minZ - 2 * YARD_TREE_MARGIN);
      return planted ? [tree(x, z, GROUND, random)] : [];
    }),
  );
}

// A wall flex piece: a barred gate across its mouth and a blank wall behind, with dumpsters between.
export function flexAlley(rect: Rect, { bounds }: City, random: () => number): Model {
  const alongX = rect.maxZ <= bounds.minZ || rect.minZ >= bounds.maxZ;
  const towardsCity = alongX ? (rect.maxZ <= bounds.minZ ? 1 : -1) : rect.maxX <= bounds.minX ? 1 : -1;
  const mouth = alongX ? (towardsCity > 0 ? rect.maxZ : rect.minZ) : towardsCity > 0 ? rect.maxX : rect.minX;
  const back = alongX ? (towardsCity > 0 ? rect.minZ : rect.maxZ) : towardsCity > 0 ? rect.minX : rect.maxX;
  const across = alongX ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
  const strip = (from: number, to: number, a: number, b: number): Rect => {
    const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
    return alongX ? { minX: a, maxX: b, minZ: lo, maxZ: hi } : { minX: lo, maxX: hi, minZ: a, maxZ: b };
  };
  const gate = strip(mouth, mouth - towardsCity * GATE_BAR, across[0], across[1]);
  const rail = (y: number) => plainBox(gate, y, y + 0.25, GATE_COLOR, MATERIAL.metalWall);
  const end = strip(back, back + towardsCity * 0.5, across[0], across[1]);
  const vertices = [
    ...rail(GROUND + GATE_HEIGHT - 0.25),
    ...rail(GROUND + 1),
    ...plainBox(end, GROUND, GROUND + ALLEY_END_HEIGHT, ALLEY_END_COLOR, MATERIAL.brick),
  ];
  for (let bar = across[0] + GATE_BAR / 2; bar < across[1]; bar += GATE_BAR_GAP) {
    vertices.push(...plainBox(strip(mouth, mouth - towardsCity * GATE_BAR, bar, bar + GATE_BAR), GROUND, GROUND + GATE_HEIGHT, GATE_COLOR, MATERIAL.metalWall));
  }
  const inside = mouth - towardsCity * 8;
  const middle = (across[0] + across[1]) / 2;
  const [x, z] = alongX ? [middle - 2, inside] : [inside, middle - 2];
  const colliders = [solid(gate, GROUND + GATE_HEIGHT), solid(end, GROUND + ALLEY_END_HEIGHT)];
  return combine([{ vertices, colliders }, dumpster(x, z, alongX, random)]);
}
