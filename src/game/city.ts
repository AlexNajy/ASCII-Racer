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
  avenueWidth: number;
  avenueDensity: number; // chance of an extra avenue one road over from a downtown avenue, 0 to 1
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
  avenueWidth: 20,
  avenueDensity: 0.4,
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

const AVENUE_FALLOFF = 0.25; // an extra avenue's chance drops by this per road line further from downtown

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

// The road line nearest the downtown point (in block units) along one axis. Never an outer road.
// Road line `road` lies between blocks road - 1 and road.
function avenueRoad(blocksPerSide: number, downtown: number): number {
  return Math.min(Math.max(Math.round(downtown + 0.5), 1), blocksPerSide - 1);
}

// The downtown avenue, plus extra avenues with a chance that falls off further from it. Never an outer road.
// Every road line rolls, so changing the density doesn't reshuffle the rolls.
function pickAvenues(blocksPerSide: number, downtown: number, density: number, random: () => number): Set<number> {
  const downtownAvenue = avenueRoad(blocksPerSide, downtown);
  const avenues = new Set([downtownAvenue]);
  for (let road = 1; road < blocksPerSide; road++) {
    const chance = density - AVENUE_FALLOFF * (Math.abs(road - downtownAvenue) - 1);
    if (random() < chance && road !== downtownAvenue) avenues.add(road);
  }
  return avenues;
}

// Positions along one axis, centred on the origin: roads and blocks take turns, starting and ending with a road.
interface AxisLayout {
  blockStarts: number[];
  roadCentres: number[];
  half: number;
}

function layoutAxis(roadWidths: number[], blockSize: number): AxisLayout {
  const size = roadWidths.reduce((sum, width) => sum + width, 0) + (roadWidths.length - 1) * blockSize;
  const blockStarts: number[] = [];
  const roadCentres: number[] = [];
  let at = -size / 2;
  roadWidths.forEach((width, i) => {
    roadCentres.push(at + width / 2);
    at += width;
    if (i < roadWidths.length - 1) {
      blockStarts.push(at);
      at += blockSize;
    }
  });
  return { blockStarts, roadCentres, half: size / 2 };
}

// The same counts on every side of a length: equal sets of the three widths, a few extras, and the flex piece.
// Needs a side of at least one set (84 m).
function wallKinds(sideLength: number): { kinds: (WallWidthKind | 'flex')[]; flexWidth: number } {
  let units = Math.floor(sideLength / WALL_UNIT);
  if (sideLength - units * WALL_UNIT < FLEX_MIN_WIDTH) units -= 1;
  const setUnits = (WALL_WIDTHS.narrow + WALL_WIDTHS.medium + WALL_WIDTHS.wide) / WALL_UNIT;
  let sets = Math.floor(units / setUnits);
  let rest = units - sets * setUnits;
  if (rest === 1 || rest === 2) {
    sets -= 1;
    rest += setUnits;
  }
  return {
    kinds: [
      ...(['narrow', 'medium', 'wide'] as const).flatMap((kind) => Array<WallWidthKind>(sets).fill(kind)),
      ...WALL_EXTRAS[rest],
      'flex',
    ],
    flexWidth: sideLength - units * WALL_UNIT,
  };
}

// Blocks on a grid, centred on the origin. Everything inside the bounds that isn't a block is road.
export function generateCity(settings: CitySettings): City {
  const { blockSize, roadWidth, avenueWidth, avenueDensity, blocksPerSide, centreDensityChance, edgeDensityChance } = settings;
  const random = createRandom(settings.seed);

  // Downtown centre in block units, somewhere around the middle of the grid.
  const middle = (blocksPerSide - 1) / 2;
  const downtownColumn = middle + (random() * 2 - 1) * DOWNTOWN_OFFSET * blocksPerSide;
  const downtownRow = middle + (random() * 2 - 1) * DOWNTOWN_OFFSET * blocksPerSide;

  // A road runs around the outside, so there is one more road line than there are blocks.
  // Column roads run north-south (west of each column, plus the east edge), row roads east-west.
  // Avenues get their own generator, seeded after the blocks and the 4 wall sides.
  const avenueRandom = createRandom(blockSeed(settings.seed, blocksPerSide * blocksPerSide + 4));
  const columnAvenues = pickAvenues(blocksPerSide, downtownColumn, avenueDensity, avenueRandom);
  const rowAvenues = pickAvenues(blocksPerSide, downtownRow, avenueDensity, avenueRandom);
  const roadWidths = (avenues: Set<number>) =>
    Array.from({ length: blocksPerSide + 1 }, (_, road) => (avenues.has(road) ? avenueWidth : roadWidth));
  const columns = layoutAxis(roadWidths(columnAvenues), blockSize);
  const rows = layoutAxis(roadWidths(rowAvenues), blockSize);

  const blocks: Block[] = [];
  for (let row = 0; row < blocksPerSide; row++) {
    for (let column = 0; column < blocksPerSide; column++) {
      const minX = columns.blockStarts[column];
      const minZ = rows.blockStarts[row];
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

  // Markings run along each road segment between two intersections, so they don't cross junctions.
  const markings: Rect[] = [];
  const dashCount = Math.floor((blockSize + DASH_GAP) / (DASH_LENGTH + DASH_GAP));
  const dashesLength = dashCount * DASH_LENGTH + (dashCount - 1) * DASH_GAP;
  const dashStart = (blockSize - dashesLength) / 2;
  // Streets get a dashed centre line. Avenues get a solid centre line and a dashed divider in each half: 4 lanes.
  const addRoadMarkings = (roads: AxisLayout, segments: AxisLayout, avenues: Set<number>, runsAlong: 'x' | 'z') => {
    const line = (centre: number, from: number, to: number) =>
      markings.push(
        runsAlong === 'x'
          ? { minX: from, minZ: centre - MARKING_WIDTH / 2, maxX: to, maxZ: centre + MARKING_WIDTH / 2 }
          : { minX: centre - MARKING_WIDTH / 2, minZ: from, maxX: centre + MARKING_WIDTH / 2, maxZ: to },
      );
    const dashedLine = (centre: number, segmentStart: number) => {
      for (let dash = 0; dash < dashCount; dash++) {
        const along = segmentStart + dashStart + dash * (DASH_LENGTH + DASH_GAP);
        line(centre, along, along + DASH_LENGTH);
      }
    };
    roads.roadCentres.forEach((centre, road) => {
      for (const segmentStart of segments.blockStarts) {
        if (!avenues.has(road)) {
          dashedLine(centre, segmentStart);
          continue;
        }
        line(centre, segmentStart + dashStart, segmentStart + blockSize - dashStart);
        dashedLine(centre - avenueWidth / 4, segmentStart);
        dashedLine(centre + avenueWidth / 4, segmentStart);
      }
    });
  };
  addRoadMarkings(rows, columns, rowAvenues, 'x');
  addRoadMarkings(columns, rows, columnAvenues, 'z');

  // One block deep and unbroken, set back behind a pavement. Opposite sides hold the same set of pieces
  // in a shuffled order, so the total length still fits exactly between the corners.
  const halfX = columns.half;
  const halfZ = rows.half;
  const innerX = halfX + WALL_SETBACK;
  const innerZ = halfZ + WALL_SETBACK;
  const outerX = halfX + blockSize;
  const outerZ = halfZ + blockSize;
  const cornerSize = blockSize - WALL_SETBACK;
  const wall: WallPiece[] = [
    { minX: -outerX, minZ: -outerZ },
    { minX: innerX, minZ: -outerZ },
    { minX: -outerX, minZ: innerZ },
    { minX: innerX, minZ: innerZ },
  ].map(({ minX, minZ }) => ({
    rect: { minX, minZ, maxX: minX + cornerSize, maxZ: minZ + cornerSize },
    kind: 'corner',
  }));

  // North and south strips run the full length, so they cover the pavement's corners.
  const wallPavement: Rect[] = [
    { minX: -innerX, minZ: -innerZ, maxX: innerX, maxZ: -halfZ },
    { minX: -innerX, minZ: halfZ, maxX: innerX, maxZ: innerZ },
    { minX: -innerX, minZ: -halfZ, maxX: -halfX, maxZ: halfZ },
    { minX: halfX, minZ: -halfZ, maxX: innerX, maxZ: halfZ },
  ];

  // Each side turns a stretch [from, to] along it into its rectangle. North and south run along x.
  const sides: { inner: number; rect: (from: number, to: number) => Rect }[] = [
    { inner: innerX, rect: (from, to) => ({ minX: from, minZ: -outerZ, maxX: to, maxZ: -innerZ }) },
    { inner: innerX, rect: (from, to) => ({ minX: from, minZ: innerZ, maxX: to, maxZ: outerZ }) },
    { inner: innerZ, rect: (from, to) => ({ minX: -outerX, minZ: from, maxX: -innerX, maxZ: to }) },
    { inner: innerZ, rect: (from, to) => ({ minX: innerX, minZ: from, maxX: outerX, maxZ: to }) },
  ];

  sides.forEach((side, sideIndex) => {
    // Seeds after the block indices, so a side never shares a sequence with a block.
    const sideRandom = createRandom(blockSeed(settings.seed, blocksPerSide * blocksPerSide + sideIndex));
    const { kinds, flexWidth } = wallKinds(2 * side.inner);
    shuffle(kinds, sideRandom);
    let along = -side.inner;
    for (const kind of kinds) {
      const width = kind === 'flex' ? flexWidth : WALL_WIDTHS[kind];
      wall.push({ rect: side.rect(along, along + width), kind });
      along += width;
    }
  });

  return { bounds: { minX: -halfX, minZ: -halfZ, maxX: halfX, maxZ: halfZ }, blocks, markings, wall, wallPavement };
}
