import { blockSeed, createRandom } from '../math/random.ts';
import { Zone, type City, type CitySettings, type Rect, type WallPiece } from './city.ts';

export interface Building {
  rect: Rect;
  height: number;
}

interface Range {
  min: number;
  max: number;
}

type BlockBuilder = (rect: Rect, random: () => number, settings: CitySettings) => Building[];

const SETBACK = 3;
const ALLEY_WIDTH = 4;
const MID_RISE_HEIGHT: Range = { min: 16, max: 42 };
const SHOP_HEIGHT: Range = { min: 6.5, max: 15 };
const TOWER_HEIGHT: Range = { min: 50, max: 120 };
const TOWER_SIZE: Range = { min: 0.5, max: 0.7 }; // fraction of the block's width and depth
const HOUSE_HEIGHT: Range = { min: 7, max: 10 };
const HOUSE_SIZE: Range = { min: 14, max: 18 };
const SUPERMARKET_HEIGHT = 15;
const HOUSE_FENCE_GAP = 2; // space between each house and the block's centre lines, where the fence will go
const WALL_HEIGHT: Range = { min: 10, max: 35 };
const NARROW_WALL_HEIGHT: Range = { min: 16, max: 30 };

function between(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

export function inset(rect: Rect, metres: number): Rect {
  return {
    minX: rect.minX + metres,
    minZ: rect.minZ + metres,
    maxX: rect.maxX - metres,
    maxZ: rect.maxZ - metres,
  };
}

// Cuts a rectangle into a grid of equal lots, with gaps between columns and between rows.
export function split(rect: Rect, columns: number, rows: number, columnGap: number, rowGap: number): Rect[] {
  const width = (rect.maxX - rect.minX - columnGap * (columns - 1)) / columns;
  const depth = (rect.maxZ - rect.minZ - rowGap * (rows - 1)) / rows;
  const lots: Rect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const minX = rect.minX + column * (width + columnGap);
      const minZ = rect.minZ + row * (depth + rowGap);
      lots.push({ minX, minZ, maxX: minX + width, maxZ: minZ + depth });
    }
  }
  return lots;
}

// The smallest rectangle that covers all the given ones.
function union(rects: Rect[]): Rect {
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

// Each direction is rolled separately, so a block gets no alleys, north-south, east-west or both.
// Gaps between columns make north-south alleys, gaps between rows east-west ones.
function alleyGaps(chance: number, random: () => number): [number, number] {
  const northSouth = random() < chance;
  const eastWest = random() < chance;
  return [northSouth ? ALLEY_WIDTH : 0, eastWest ? ALLEY_WIDTH : 0];
}

const midRise: BlockBuilder = (rect, random, settings) =>
  split(rect, 2, 2, ...alleyGaps(settings.midDensityAlleyChance, random)).map((lot) => ({
    rect: lot,
    height: between(MID_RISE_HEIGHT, random),
  }));

// Lot indices of the 3×3 grid along each side of the block, corner to corner.
const SHOP_SIDES = [
  [0, 1, 2],
  [2, 5, 8],
  [8, 7, 6],
  [6, 3, 0],
] as const;
const SHOP_CORNERS = [0, 2, 6, 8] as const;
// Lots that become the car park of a strip mall: a corner and the two lots beside it.
const STRIP_MALL_PARKING = [
  [0, 1, 3],
  [1, 2, 5],
  [5, 7, 8],
  [3, 6, 7],
] as const;

// A ring of up to 8 touching shops around an empty back yard (the centre lot of the 3×3 grid).
// Empty lots are kept for small car parks later. A strip mall block turns one corner into a car park
// and keeps every other shop, so the shops form an L facing it. A side's middle shop can merge with its corners
// into one longer building; each corner joins at most one side, so merged shops stay rectangles.
const shops: BlockBuilder = (rect, random, settings) => {
  const lots = split(rect, 3, 3, 0, 0);
  // Every roll happens in a fixed order and count, so one outcome doesn't shift the others.
  const stripMall = random() < settings.lowDensityStripMallChance;
  const parking: readonly number[] = STRIP_MALL_PARKING[Math.floor(random() * STRIP_MALL_PARKING.length)];
  const filled = lots.map((_, index) => {
    const empty = random() < settings.lowDensityEmptyChance;
    if (index === 4) return false;
    return stripMall ? !parking.includes(index) : !empty;
  });
  const heights = lots.map(() => between(SHOP_HEIGHT, random));
  const used = lots.map(() => false);
  const result: Building[] = [];
  for (const [first, middle, last] of SHOP_SIDES) {
    const joinFirst = random() < settings.lowDensityMergeChance;
    const joinLast = random() < settings.lowDensityMergeChance;
    if (!filled[middle]) continue;
    const group: number[] = [middle];
    if (joinFirst && filled[first] && !used[first]) group.push(first);
    if (joinLast && filled[last] && !used[last]) group.push(last);
    group.forEach((index) => (used[index] = true));
    result.push({ rect: union(group.map((index) => lots[index])), height: heights[middle] });
  }
  for (const corner of SHOP_CORNERS) {
    if (filled[corner] && !used[corner]) result.push({ rect: lots[corner], height: heights[corner] });
  }
  return result;
};

// One tower at a random size and position inside the block.
const tower: BlockBuilder = (rect, random) => {
  const width = (rect.maxX - rect.minX) * between(TOWER_SIZE, random);
  const depth = (rect.maxZ - rect.minZ) * between(TOWER_SIZE, random);
  const minX = rect.minX + random() * (rect.maxX - rect.minX - width);
  const minZ = rect.minZ + random() * (rect.maxZ - rect.minZ - depth);
  return [{ rect: { minX, minZ, maxX: minX + width, maxZ: minZ + depth }, height: between(TOWER_HEIGHT, random) }];
};

// Four houses, one per quarter, set in the corner nearest the block centre so each yard faces the street.
const houses: BlockBuilder = (rect, random) => {
  const centreX = (rect.minX + rect.maxX) / 2;
  const centreZ = (rect.minZ + rect.maxZ) / 2;
  const result: Building[] = [];
  for (const sideZ of [-1, 1]) {
    for (const sideX of [-1, 1]) {
      const nearX = centreX + sideX * HOUSE_FENCE_GAP;
      const nearZ = centreZ + sideZ * HOUSE_FENCE_GAP;
      const farX = nearX + sideX * between(HOUSE_SIZE, random);
      const farZ = nearZ + sideZ * between(HOUSE_SIZE, random);
      result.push({
        rect: {
          minX: Math.min(nearX, farX),
          minZ: Math.min(nearZ, farZ),
          maxX: Math.max(nearX, farX),
          maxZ: Math.max(nearZ, farZ),
        },
        height: between(HOUSE_HEIGHT, random),
      });
    }
  }
  return result;
};

// The store fills the half of the block away from a random street, the other half is its car park.
const supermarket: BlockBuilder = (rect, random) => {
  const midX = (rect.minX + rect.maxX) / 2;
  const midZ = (rect.minZ + rect.maxZ) / 2;
  const halves: Rect[] = [
    { ...rect, maxZ: midZ },
    { ...rect, minZ: midZ },
    { ...rect, maxX: midX },
    { ...rect, minX: midX },
  ];
  return [{ rect: halves[Math.floor(random() * halves.length)], height: SUPERMARKET_HEIGHT }];
};

const noBuildings: BlockBuilder = () => [];

const BUILDERS: Record<Zone, BlockBuilder> = {
  [Zone.LowDensity]: shops,
  [Zone.MidDensity]: midRise,
  [Zone.HighRise]: tower,
  [Zone.Houses]: houses,
  [Zone.Park]: noBuildings,
  [Zone.Supermarket]: supermarket,
  [Zone.ParkingLot]: noBuildings,
  [Zone.Plaza]: noBuildings,
};

// One building filling the whole wall piece, so neighbours touch and the wall stays unbroken.
function wallBuilding({ rect, kind }: WallPiece, random: () => number): Building {
  return { rect, height: between(kind === 'narrow' ? NARROW_WALL_HEIGHT : WALL_HEIGHT, random) };
}

// Zones without buildings use 1.
function heightScales(settings: CitySettings): Record<Zone, number> {
  return {
    [Zone.LowDensity]: settings.lowDensityHeight,
    [Zone.MidDensity]: settings.midDensityHeight,
    [Zone.HighRise]: settings.highRiseHeight,
    [Zone.Houses]: settings.housesHeight,
    [Zone.Park]: 1,
    [Zone.Supermarket]: settings.supermarketHeight,
    [Zone.ParkingLot]: 1,
    [Zone.Plaza]: 1,
  };
}

function scaled(building: Building, scale: number): Building {
  return { ...building, height: building.height * scale };
}

// Heights are scaled after generation, so a multiplier doesn't change the random calls or the layout.
export function generateBuildings(city: City, settings: CitySettings): Building[] {
  const { seed } = settings;
  const scales = heightScales(settings);
  const blockBuildings = city.blocks.flatMap((block, index) =>
    BUILDERS[block.zone](inset(block.rect, SETBACK), createRandom(blockSeed(seed, index)), settings).map((building) =>
      scaled(building, scales[block.zone]),
    ),
  );
  // Seeds after the block and wall side seeds used in city.ts.
  const wallSeedStart = city.blocks.length + 4;
  // Flex pieces stay open as alleys.
  const wallBuildings = city.wall.flatMap((piece, index) =>
    piece.kind === 'flex'
      ? []
      : [scaled(wallBuilding(piece, createRandom(blockSeed(seed, wallSeedStart + index))), settings.wallHeight)],
  );
  return [...blockBuildings, ...wallBuildings];
}
