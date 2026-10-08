import { blockSeed, createRandom, shuffle } from '../math/random.ts';

// A rectangle on the ground plane, seen from above. Units are metres.
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const Zone = {
  LowDensity: 0,
  MidDensity: 1,
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

// Corners fill the four corner squares; the sides are made of three fixed widths of piece, one building each,
// plus one flex piece per side that takes up the remainder and stays open as an alley.
type WallWidthKind = 'narrow' | 'medium' | 'wide';
export type WallKind = 'corner' | 'flex' | WallWidthKind;

export interface WallPiece {
  rect: Rect;
  kind: WallKind;
}

export interface CitySettings {
  seed: number;
  blockSize: number;
  roadWidth: number;
  blocksPerSide: number;
  // Chance of mid density at the downtown centre and at the downtown radius and beyond, 0 to 1.
  centreDensityChance: number;
  edgeDensityChance: number;
  // Building height multipliers per zone, 1 = the ranges in buildings.ts.
  wallHeight: number;
  housesHeight: number;
  lowDensityHeight: number;
  midDensityHeight: number;
  highRiseHeight: number;
  supermarketHeight: number;
  midDensityAlleyChance: number; // per direction, 0 to 1
  lowDensityEmptyChance: number; // per shop lot, 0 to 1
  lowDensityMergeChance: number; // per side and corner, 0 to 1
  lowDensityStripMallChance: number; // per block, 0 to 1
  streetLightSpacing: number; // metres between lights along a lit road
}

export const DEFAULT_CITY_SETTINGS: CitySettings = {
  seed: 1,
  blockSize: 60,
  roadWidth: 12,
  blocksPerSide: 8,
  centreDensityChance: 0.9,
  edgeDensityChance: 0.1,
  wallHeight: 1,
  housesHeight: 1,
  lowDensityHeight: 1,
  midDensityHeight: 1,
  highRiseHeight: 1,
  supermarketHeight: 1,
  midDensityAlleyChance: 0.5,
  lowDensityEmptyChance: 0.125,
  lowDensityMergeChance: 0.2,
  lowDensityStripMallChance: 0.1,
  streetLightSpacing: 25,
};

export interface City {
  bounds: Rect; // the drivable area: blocks and roads, inside the wall
  blocks: Block[];
  markings: Rect[];
  wall: WallPiece[];
  wallPavement: Rect[]; // the strip between the outer road and the wall buildings
}

export const CURB_HEIGHT = 0.15; // pavements are raised this far above the road, and buildings stand on them
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

// Fixed widths so prefabs fit. All are multiples of WALL_UNIT (3, 4 and 5 units), so together they make
// any multiple of it; the remainder goes to the flex piece.
const WALL_WIDTHS: Record<WallWidthKind, number> = { narrow: 21, medium: 28, wide: 35 };
const WALL_UNIT = 7;
const FLEX_MIN_WIDTH = 7; // below this the flex piece takes one more unit, so it always fits a gate and a dumpster
// Extra pieces for the units left after the equal sets (a set is 12 units). 1 and 2 can't be made from 3, 4 and 5,
// so those borrow a set and use 13 and 14 instead.
const WALL_EXTRAS: Record<number, WallWidthKind[]> = {
  0: [],
  3: ['narrow'],
  4: ['medium'],
  5: ['wide'],
  6: ['narrow', 'narrow'],
  7: ['narrow', 'medium'],
  8: ['narrow', 'wide'],
  9: ['medium', 'wide'],
  10: ['wide', 'wide'],
  11: ['narrow', 'medium', 'medium'],
  13: ['medium', 'medium', 'wide'],
  14: ['medium', 'wide', 'wide'],
};
const WALL_SETBACK = 3; // pavement between the outer road and the wall buildings, like the blocks' setback

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
      const midDensityChance = centreDensityChance + (edgeDensityChance - centreDensityChance) * t;
      blocks.push({
        rect: { minX, minZ, maxX: minX + blockSize, maxZ: minZ + blockSize },
        column,
        row,
        zone: random() < midDensityChance ? Zone.MidDensity : Zone.LowDensity,
      });
    }
  }

  // Neighbour counts read the original zones, so the result doesn't depend on the order blocks are checked in.
  const originalZones = blocks.map((block) => block.zone);
  const matchingNeighbours = (block: Block, index: number) =>
    sideNeighbours(block, blocksPerSide).filter((i) => originalZones[i] === originalZones[index]).length;

  blocks.forEach((block, index) => {
    if (originalZones[index] === Zone.MidDensity && matchingNeighbours(block, index) >= HIGH_RISE_NEIGHBOURS) {
      block.zone = Zone.HighRise;
    }
  });

  // Houses never share a side with a high-rise; those blocks stay shops as a buffer.
  blocks.forEach((block, index) => {
    const besideHighRise = sideNeighbours(block, blocksPerSide).some((i) => blocks[i].zone === Zone.HighRise);
    if (originalZones[index] === Zone.LowDensity && matchingNeighbours(block, index) >= HOUSES_NEIGHBOURS && !besideHighRise) {
      block.zone = Zone.Houses;
    }
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
  placeSpecial(blocks, Zone.MidDensity, Zone.ParkingLot, random);

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

  // One block deep and unbroken, set back behind a pavement. Each side holds the same set of pieces
  // in a shuffled order, so the total length still fits exactly between the corners.
  const half = size / 2;
  const inner = half + WALL_SETBACK;
  const outer = half + blockSize;
  const wall: WallPiece[] = [
    { minX: -outer, minZ: -outer },
    { minX: inner, minZ: -outer },
    { minX: -outer, minZ: inner },
    { minX: inner, minZ: inner },
  ].map(({ minX, minZ }) => ({
    rect: { minX, minZ, maxX: minX + outer - inner, maxZ: minZ + outer - inner },
    kind: 'corner',
  }));

  // North and south strips run the full length, so they cover the pavement's corners.
  const wallPavement: Rect[] = [
    { minX: -inner, minZ: -inner, maxX: inner, maxZ: -half },
    { minX: -inner, minZ: half, maxX: inner, maxZ: inner },
    { minX: -inner, minZ: -half, maxX: -half, maxZ: half },
    { minX: half, minZ: -half, maxX: inner, maxZ: half },
  ];

  // Turns a stretch [from, to] along a side into that side's rectangle.
  const sides: ((from: number, to: number) => Rect)[] = [
    (from, to) => ({ minX: from, minZ: -outer, maxX: to, maxZ: -inner }),
    (from, to) => ({ minX: from, minZ: inner, maxX: to, maxZ: outer }),
    (from, to) => ({ minX: -outer, minZ: from, maxX: -inner, maxZ: to }),
    (from, to) => ({ minX: inner, minZ: from, maxX: outer, maxZ: to }),
  ];
  // The same counts on every side: equal sets of the three widths, a few extras, and the flex piece.
  // Needs a side of at least one set (84 m).
  const sideLength = 2 * inner;
  let units = Math.floor(sideLength / WALL_UNIT);
  if (sideLength - units * WALL_UNIT < FLEX_MIN_WIDTH) units -= 1;
  const flexWidth = sideLength - units * WALL_UNIT;
  const setUnits = (WALL_WIDTHS.narrow + WALL_WIDTHS.medium + WALL_WIDTHS.wide) / WALL_UNIT;
  let sets = Math.floor(units / setUnits);
  let rest = units - sets * setUnits;
  if (rest === 1 || rest === 2) {
    sets -= 1;
    rest += setUnits;
  }
  const sideKinds: (WallWidthKind | 'flex')[] = [
    ...(['narrow', 'medium', 'wide'] as const).flatMap((kind) => Array<WallWidthKind>(sets).fill(kind)),
    ...WALL_EXTRAS[rest],
    'flex',
  ];

  sides.forEach((side, sideIndex) => {
    // Seeds after the block indices, so a side never shares a sequence with a block.
    const sideRandom = createRandom(blockSeed(settings.seed, blocksPerSide * blocksPerSide + sideIndex));
    const kinds = [...sideKinds];
    shuffle(kinds, sideRandom);
    let along = -inner;
    for (const kind of kinds) {
      const width = kind === 'flex' ? flexWidth : WALL_WIDTHS[kind];
      wall.push({ rect: side(along, along + width), kind });
      along += width;
    }
  });

  return { bounds: { minX: -half, minZ: -half, maxX: half, maxZ: half }, blocks, markings, wall, wallPavement };
}
