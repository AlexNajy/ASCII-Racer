import { describe, expect, it } from 'vitest';
import { CAR_WIDTH } from './car.ts';
import { DEFAULT_CITY_SETTINGS, subtract, type Rect } from './city.ts';
import { cityColliders, type Collider } from './collision.ts';
import { DEFAULT_CAR_SETTINGS } from './car.ts';
import { createWorld, generateCityData, startJunction, type CityData } from './world.ts';

// Every daily city comes from a new seed with the default settings, so these must hold for any seed.
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const CAR_RADIUS = CAR_WIDTH / 2; // collideCar's capsule
const OVERLAP_TOLERANCE = 0.01; // m, both ways, so touching edges and rounding don't count
const FILL_CELL = 0.5; // m, smaller than any gap that matters next to the car's width
const FILL_MARGIN = 2; // m of grid beyond the wall's outer edge

const cities = new Map<number, CityData>();

function cityData(seed: number): CityData {
  let data = cities.get(seed);
  if (!data) {
    data = generateCityData({ ...DEFAULT_CITY_SETTINGS, seed }, false);
    cities.set(seed, data);
  }
  return data;
}

function overlap(a: Rect, b: Rect): Rect | null {
  const rect = { minX: Math.max(a.minX, b.minX), minZ: Math.max(a.minZ, b.minZ), maxX: Math.min(a.maxX, b.maxX), maxZ: Math.min(a.maxZ, b.maxZ) };
  return rect.maxX - rect.minX > OVERLAP_TOLERANCE && rect.maxZ - rect.minZ > OVERLAP_TOLERANCE ? rect : null;
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ;
}

const where = ({ minX, minZ, maxX, maxZ }: Rect) =>
  `x ${minX.toFixed(1)}..${maxX.toFixed(1)}, z ${minZ.toFixed(1)}..${maxZ.toFixed(1)}`;

// Props by footprint (props.ts), for the failure messages.
const PROP_SIZES: [number, number, string][] = [
  [0.5, 0.5, 'tree trunk'],
  [0.3, 0.3, 'bollard'],
  [2, 0.6, 'bench'],
  [2, 2, 'planter'],
  [2.2, 1.2, 'dumpster'],
  [4.4, 1.8, 'parked car'],
  [10, 10, 'fountain'],
  [3.2, 3.2, 'kiosk'],
];

function propName({ minX, minZ, maxX, maxZ }: Rect): string {
  const [w, d] = [maxX - minX, maxZ - minZ].sort((a, b) => b - a);
  const match = PROP_SIZES.find(([a, b]) => Math.abs(a - w) < 0.01 && Math.abs(b - d) < 0.01);
  return match ? match[2] : 'prop';
}

// What each collider is, from the lists cityColliders builds it from.
function describeColliders({ colliders, fences, streetLights, intersections }: CityData): Map<Collider, string> {
  const names = new Map<Collider, string>();
  const fenceRects = new Set(fences);
  const poles = cityColliders([], [], streetLights, intersections);
  const lightCount = streetLights.length;
  const trafficCount = intersections.trafficLights.length;
  const furnitureStart = colliders.length - poles.length;
  colliders.forEach((collider, index) => {
    const furniture = index - furnitureStart;
    let name: string;
    if (collider.building) name = 'building';
    else if (fenceRects.has(collider.rect)) name = 'fence';
    else if (furniture >= lightCount + trafficCount) name = 'stop sign pole';
    else if (furniture >= lightCount) name = 'traffic light pole';
    else if (furniture >= 0) name = 'street light pole';
    else name = propName(collider.rect);
    names.set(collider, name);
  });
  return names;
}

// Everything inside the bounds that isn't a block. Road-level lots (car parks, driveways) are inside blocks.
function roads({ city }: CityData): Rect[] {
  return subtract(city.bounds, city.blocks.map(({ rect }) => rect));
}

function onRoad(data: CityData, x: number, z: number): boolean {
  return roads(data).some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}

function solidOnRoad(data: CityData): string[] {
  const names = describeColliders(data);
  const roadRects = roads(data);
  return data.colliders.flatMap((collider) =>
    roadRects.flatMap((road) => {
      const hit = overlap(collider.rect, road);
      return hit ? [`${names.get(collider)} at ${where(collider.rect)} is on the road at ${where(hit)}`] : [];
    }),
  );
}

// Junctions reached from the start, along segments with a car-wide corridor down the middle.
function unreachableJunctions({ city, colliders }: CityData): string[] {
  const { junctions } = city;
  const start = junctions.indexOf(startJunction(city));
  const perRow = Math.round(Math.sqrt(junctions.length));
  const half = CAR_WIDTH / 2;
  const free = (corridor: Rect) => !colliders.some(({ rect }) => overlap(rect, corridor));
  const reached = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.pop()!;
    const a = junctions[index];
    const neighbours: number[] = [];
    if (a.column > 0) neighbours.push(index - 1);
    if (a.column < perRow - 1) neighbours.push(index + 1);
    if (a.row > 0) neighbours.push(index - perRow);
    if (a.row < perRow - 1) neighbours.push(index + perRow);
    for (const next of neighbours) {
      if (reached.has(next)) continue;
      const b = junctions[next];
      const corridor: Rect =
        a.row === b.row
          ? { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: a.z - half, maxZ: a.z + half }
          : { minX: a.x - half, maxX: a.x + half, minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
      if (!free(corridor)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return junctions.flatMap((j, i) => (reached.has(i) ? [] : [`junction column ${j.column} row ${j.row} at x ${j.x}, z ${j.z}`]));
}

// Flood fill of where the car's centre can go, on a grid around the wall. A cell is blocked only if one collider,
// grown by the car's radius, covers all of it, so a gap the car fits through always stays open.
// Returns where the fill first got past the wall's outer edge, or null if it never did.
function escape({ city, colliders }: CityData): string | null {
  const outer = city.wall.reduce(
    (r, { rect }) => ({ minX: Math.min(r.minX, rect.minX), minZ: Math.min(r.minZ, rect.minZ), maxX: Math.max(r.maxX, rect.maxX), maxZ: Math.max(r.maxZ, rect.maxZ) }),
    city.bounds,
  );
  const originX = outer.minX - FILL_MARGIN;
  const originZ = outer.minZ - FILL_MARGIN;
  const columns = Math.ceil((outer.maxX - outer.minX + 2 * FILL_MARGIN) / FILL_CELL);
  const rows = Math.ceil((outer.maxZ - outer.minZ + 2 * FILL_MARGIN) / FILL_CELL);
  const blocked = new Uint8Array(columns * rows);
  for (const { rect } of colliders) {
    const c0 = Math.max(0, Math.ceil((rect.minX - CAR_RADIUS - originX) / FILL_CELL));
    const c1 = Math.min(columns, Math.floor((rect.maxX + CAR_RADIUS - originX) / FILL_CELL));
    const r0 = Math.max(0, Math.ceil((rect.minZ - CAR_RADIUS - originZ) / FILL_CELL));
    const r1 = Math.min(rows, Math.floor((rect.maxZ + CAR_RADIUS - originZ) / FILL_CELL));
    for (let r = r0; r < r1; r++) blocked.fill(1, r * columns + c0, r * columns + Math.max(c0, c1));
  }
  const start = startJunction(city);
  const startCell = Math.floor((start.z - originZ) / FILL_CELL) * columns + Math.floor((start.x - originX) / FILL_CELL);
  const queue = new Int32Array(columns * rows);
  let head = 0;
  let tail = 0;
  queue[tail++] = startCell;
  blocked[startCell] = 2;
  while (head < tail) {
    const cell = queue[head++];
    const column = cell % columns;
    const row = (cell - column) / columns;
    const x = originX + (column + 0.5) * FILL_CELL;
    const z = originZ + (row + 0.5) * FILL_CELL;
    if (x < outer.minX || x > outer.maxX || z < outer.minZ || z > outer.maxZ) return `x ${x.toFixed(1)}, z ${z.toFixed(1)}`;
    const visit = (next: number) => {
      if (blocked[next] !== 0) return;
      blocked[next] = 2;
      queue[tail++] = next;
    };
    if (column > 0) visit(cell - 1);
    if (column < columns - 1) visit(cell + 1);
    if (row > 0) visit(cell - columns);
    if (row < rows - 1) visit(cell + columns);
  }
  return null;
}

// Every pair of colliders that overlap, by a sweep along x.
function overlappingPairs(colliders: Collider[]): [Collider, Collider][] {
  const sorted = [...colliders].sort((a, b) => a.rect.minX - b.rect.minX);
  const pairs: [Collider, Collider][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].rect.minX < a.rect.maxX; j++) {
      if (overlap(a.rect, sorted[j].rect)) pairs.push([a, sorted[j]]);
    }
  }
  return pairs;
}

const PLANTER_SIZE = 2; // m, props.ts
const TRUNK_SIZE = 0.5;

function isPlanterTree(planter: Rect, trunk: Rect): boolean {
  const size = ({ minX, minZ, maxX, maxZ }: Rect) => [maxX - minX, maxZ - minZ];
  const near = (sizes: number[], expected: number) => sizes.every((v) => Math.abs(v - expected) < 0.01);
  return near(size(planter), PLANTER_SIZE) && near(size(trunk), TRUNK_SIZE) && contains(planter, trunk);
}

// Props overlapping each other are fine where one stands in the other (a planter's tree) and where fences meet.
function propsInBuildings(data: CityData): string[] {
  const names = describeColliders(data);
  return overlappingPairs(data.colliders).flatMap(([a, b]) => {
    if (a.building && b.building) return [];
    if (a.building || b.building) {
      const [prop, building] = a.building ? [b, a] : [a, b];
      return [`${names.get(prop)} at ${where(prop.rect)} is inside the building at ${where(building.rect)}`];
    }
    if (isPlanterTree(a.rect, b.rect) || isPlanterTree(b.rect, a.rect)) return [];
    if (names.get(a) === 'fence' && names.get(b) === 'fence') return [];
    return [`${names.get(a)} at ${where(a.rect)} overlaps ${names.get(b)} at ${where(b.rect)}`];
  });
}

function startProblems(data: CityData): string[] {
  const problems: string[] = [];
  const { x, z } = startJunction(data.city);
  if (!onRoad(data, x, z)) problems.push('not on a road');
  const inside = data.colliders.filter(({ rect }) => x > rect.minX - CAR_RADIUS && x < rect.maxX + CAR_RADIUS && z > rect.minZ - CAR_RADIUS && z < rect.maxZ + CAR_RADIUS);
  for (const { rect } of inside) problems.push(`inside the collider at ${where(rect)}`);
  return problems;
}

function failures(check: (data: CityData) => string[]): string[] {
  return SEEDS.flatMap((seed) => check(cityData(seed)).map((problem) => `seed ${seed}: ${problem}`));
}

describe('city rules over 200 seeds', { timeout: 30000 }, () => {
  it('builds the same colliders without vertices', () => {
    for (const seed of [1, 2]) {
      const full = createWorld({ ...DEFAULT_CITY_SETTINGS, seed }, { ...DEFAULT_CAR_SETTINGS });
      expect(cityData(seed).colliders).toEqual(full.colliders);
      expect(full.models.vertices.length).toBeGreaterThan(0);
    }
  });

  it('has nothing solid on a road', () => {
    expect(failures(solidOnRoad)).toEqual([]);
  });

  it('reaches every junction from the start by road', () => {
    expect(failures(unreachableJunctions)).toEqual([]);
  });

  it('has no way out past the outer wall', () => {
    expect(failures((data) => {
      const at = escape(data);
      return at ? [`the car gets out at ${at}`] : [];
    })).toEqual([]);
  });

  it('has no props inside buildings or in each other', () => {
    expect(failures(propsInBuildings)).toEqual([]);
  });

  it('starts the car on a road, clear of every collider', () => {
    expect(failures((data) => startProblems(data).map((p) => `start ${p}`))).toEqual([]);
  });
});
