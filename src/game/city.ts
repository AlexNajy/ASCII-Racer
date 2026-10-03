import { createRandom } from '../math/random.ts';

// A rectangle on the ground plane, seen from above. Units are metres.
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const Zone = {
  LowDensity: 0,
  HighDensity: 1,
  HighRise: 2,
  Houses: 3,
  Park: 4,
  Supermarket: 5,
  ParkingLot: 6,
  Plaza: 7,
} as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export interface Block {
  rect: Rect;
  column: number;
  row: number;
  zone: Zone;
}

export interface CitySettings {
  seed: number;
  blockSize: number;
  roadWidth: number;
  blocksPerSide: number;
  // Chance of high density at the downtown centre and at the downtown radius and beyond, 0 to 1.
  centreDensityChance: number;
  edgeDensityChance: number;
}

export const DEFAULT_CITY_SETTINGS: CitySettings = {
  seed: 1,
  blockSize: 60,
  roadWidth: 12,
  blocksPerSide: 8,
  centreDensityChance: 0.9,
  edgeDensityChance: 0.1,
};

export interface City {
  bounds: Rect;
  blocks: Block[];
  markings: Rect[];
}

const MARKING_WIDTH = 0.4;
const DASH_LENGTH = 3;
const DASH_GAP = 3;

// Downtown radius as a fraction of the city width, and how far from the middle its centre may land.
const DOWNTOWN_RADIUS = 0.8;
const DOWNTOWN_OFFSET = 0.15;

// How many of the 4 side neighbours must share a block's zone for it to upgrade.
const HIGH_RISE_NEIGHBOURS = 3;
const HOUSES_NEIGHBOURS = 3;
const PLAZA_NEIGHBOURS = 4;
const PLAZA_MAX = 1;

const PARK_COUNT = 1;

// Turns one random block of the `from` zone into the `to` zone. Skipped if no such block exists.
function placeSpecial(blocks: Block[], from: Zone, to: Zone, random: () => number): void {
  const candidates = blocks.filter((block) => block.zone === from);
  if (candidates.length === 0) return;
  candidates[Math.floor(random() * candidates.length)].zone = to;
}

// Indices of the blocks north, east, south and west of a block. Edge blocks have fewer.
function sideNeighbours(block: Block, blocksPerSide: number): number[] {
  const indices: number[] = [];
  for (const [columnStep, rowStep] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const column = block.column + columnStep;
    const row = block.row + rowStep;
    if (column >= 0 && column < blocksPerSide && row >= 0 && row < blocksPerSide) {
      indices.push(row * blocksPerSide + column);
    }
  }
  return indices;
}

// Blocks on a square grid, centred on the origin. Everything inside the bounds that isn't a block is road.
export function generateCity(settings: CitySettings): City {
  const { blockSize, roadWidth, blocksPerSide, centreDensityChance, edgeDensityChance } = settings;
  const random = createRandom(settings.seed);
  const spacing = blockSize + roadWidth;
  // A road runs around the outside, so there is one more road than there are blocks.
  const size = blocksPerSide * spacing + roadWidth;
  const start = -size / 2 + roadWidth;

  // Downtown centre in block units, somewhere around the middle of the grid.
  const middle = (blocksPerSide - 1) / 2;
  const downtownColumn = middle + (random() * 2 - 1) * DOWNTOWN_OFFSET * blocksPerSide;
  const downtownRow = middle + (random() * 2 - 1) * DOWNTOWN_OFFSET * blocksPerSide;

  const blocks: Block[] = [];
  for (let row = 0; row < blocksPerSide; row++) {
    for (let column = 0; column < blocksPerSide; column++) {
      const minX = start + column * spacing;
      const minZ = start + row * spacing;
      const distance = Math.hypot(column - downtownColumn, row - downtownRow) / blocksPerSide;
      const t = Math.min(distance / DOWNTOWN_RADIUS, 1);
      const highDensityChance = centreDensityChance + (edgeDensityChance - centreDensityChance) * t;
      blocks.push({
        rect: { minX, minZ, maxX: minX + blockSize, maxZ: minZ + blockSize },
        column,
        row,
        zone: random() < highDensityChance ? Zone.HighDensity : Zone.LowDensity,
      });
    }
  }

  // Upgrades only read the original zones, so the result doesn't depend on the order blocks are checked in.
  const originalZones = blocks.map((block) => block.zone);
  blocks.forEach((block, index) => {
    const zone = originalZones[index];
    const matching = sideNeighbours(block, blocksPerSide).filter((i) => originalZones[i] === zone).length;
    if (zone === Zone.HighDensity && matching >= HIGH_RISE_NEIGHBOURS) block.zone = Zone.HighRise;
    if (zone === Zone.LowDensity && matching >= HOUSES_NEIGHBOURS) block.zone = Zone.Houses;
  });

  // Breaks up walls of high-rises. Candidates are recounted after each pick, so plazas never touch.
  for (let i = 0; i < PLAZA_MAX; i++) {
    const candidates = blocks.filter(
      (block) =>
        block.zone === Zone.HighRise &&
        sideNeighbours(block, blocksPerSide).filter((n) => blocks[n].zone === Zone.HighRise).length >= PLAZA_NEIGHBOURS,
    );
    if (candidates.length === 0) break;
    candidates[Math.floor(random() * candidates.length)].zone = Zone.Plaza;
  }

  for (let i = 0; i < PARK_COUNT; i++) placeSpecial(blocks, Zone.LowDensity, Zone.Park, random);
  placeSpecial(blocks, Zone.LowDensity, Zone.Supermarket, random);
  placeSpecial(blocks, Zone.HighDensity, Zone.ParkingLot, random);

  // Centre lines run along each road segment between two intersections, so dashes don't cross junctions.
  const markings: Rect[] = [];
  const dashCount = Math.floor((blockSize + DASH_GAP) / (DASH_LENGTH + DASH_GAP));
  const dashesLength = dashCount * DASH_LENGTH + (dashCount - 1) * DASH_GAP;
  const dashStart = (blockSize - dashesLength) / 2;
  for (let road = 0; road <= blocksPerSide; road++) {
    const centre = start - roadWidth / 2 + road * spacing;
    const across = { min: centre - MARKING_WIDTH / 2, max: centre + MARKING_WIDTH / 2 };
    for (let segment = 0; segment < blocksPerSide; segment++) {
      for (let dash = 0; dash < dashCount; dash++) {
        const along = start + segment * spacing + dashStart + dash * (DASH_LENGTH + DASH_GAP);
        markings.push({ minX: along, minZ: across.min, maxX: along + DASH_LENGTH, maxZ: across.max });
        markings.push({ minX: across.min, minZ: along, maxX: across.max, maxZ: along + DASH_LENGTH });
      }
    }
  }

  const half = size / 2;
  return { bounds: { minX: -half, minZ: -half, maxX: half, maxZ: half }, blocks, markings };
}
