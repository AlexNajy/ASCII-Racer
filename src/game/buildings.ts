import { blockSeed, createRandom } from '../math/random.ts';
import { Zone, type City, type Rect } from './city.ts';

export interface Building {
  rect: Rect;
  height: number;
}

interface Range {
  min: number;
  max: number;
}

type BlockBuilder = (rect: Rect, random: () => number) => Building[];

const SETBACK = 3;
const ALLEY_WIDTH = 4;
const MID_RISE_HEIGHT: Range = { min: 15, max: 35 };
const SHOP_HEIGHT: Range = { min: 4, max: 10 };
const TOWER_HEIGHT: Range = { min: 50, max: 120 };
const TOWER_SIZE: Range = { min: 0.5, max: 0.7 }; // fraction of the block's width and depth
const HOUSE_HEIGHT: Range = { min: 5, max: 7 };
const HOUSE_SIZE: Range = { min: 10, max: 14 };
const HOUSE_FENCE_GAP = 2; // space between each house and the block's centre lines, where the fence will go

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

// Cuts a rectangle into a grid of equal lots with gaps between them.
export function split(rect: Rect, columns: number, rows: number, gap: number): Rect[] {
  const width = (rect.maxX - rect.minX - gap * (columns - 1)) / columns;
  const depth = (rect.maxZ - rect.minZ - gap * (rows - 1)) / rows;
  const lots: Rect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const minX = rect.minX + column * (width + gap);
      const minZ = rect.minZ + row * (depth + gap);
      lots.push({ minX, minZ, maxX: minX + width, maxZ: minZ + depth });
    }
  }
  return lots;
}

const midRise: BlockBuilder = (rect, random) =>
  split(rect, 2, 2, ALLEY_WIDTH).map((lot) => ({ rect: lot, height: between(MID_RISE_HEIGHT, random) }));

// A ring of 8 shops around an empty back yard (the centre lot of the 3×3 grid).
const shops: BlockBuilder = (rect, random) =>
  split(rect, 3, 3, ALLEY_WIDTH)
    .filter((_, index) => index !== 4)
    .map((lot) => ({ rect: lot, height: between(SHOP_HEIGHT, random) }));

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

const noBuildings: BlockBuilder = () => [];

const BUILDERS: Record<Zone, BlockBuilder> = {
  [Zone.LowDensity]: shops,
  [Zone.MidDensity]: midRise,
  [Zone.HighRise]: tower,
  [Zone.Houses]: houses,
  [Zone.Park]: noBuildings,
  [Zone.Supermarket]: noBuildings,
  [Zone.ParkingLot]: noBuildings,
  [Zone.Plaza]: noBuildings,
};

export function generateBuildings(city: City, seed: number): Building[] {
  return city.blocks.flatMap((block, index) =>
    BUILDERS[block.zone](inset(block.rect, SETBACK), createRandom(blockSeed(seed, index))),
  );
}
