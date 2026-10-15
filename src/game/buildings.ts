import { blockSeed, createRandom } from '../math/random.ts';
import { Zone, type City, type CitySettings, type Rect, type WallPiece } from './city.ts';

export interface Building {
  rect: Rect;
  base: number; // m, a raised ground floor (house steps)
  floors: number;
  floorHeight: number; // m
  height: number; // base + floors × floorHeight
  part?: 'house' | 'garage'; // only on houses blocks
  entrance?: Side; // the street a house's lot opens to
  door?: Side; // garages only: the wall the door is on
}

export type Side = 'minX' | 'maxX' | 'minZ' | 'maxZ';

// One floor height is picked from the list per building. Floors are whole, both ends included.
interface FloorPlan {
  floorHeights: readonly number[];
  floors: Range;
  base?: Range;
}

interface Range {
  min: number;
  max: number;
}

type BlockBuilder = (rect: Rect, random: () => number, settings: CitySettings) => Building[];

export const SETBACK = 3;
const ALLEY_WIDTH = 4;
const SHOP: FloorPlan = { floorHeights: [6, 7, 8], floors: { min: 1, max: 2 } };
const MERGED_SHOP: FloorPlan = { ...SHOP, floors: { min: 1, max: 3 } };
const STRIP_MALL_SHOP: FloorPlan = { ...SHOP, floors: { min: 1, max: 1 } };
const MID_RISE: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 5, max: 10 } };
const TOWER: FloorPlan = { floorHeights: [3.5, 4], floors: { min: 15, max: 30 } };
const HOUSE: FloorPlan = { floorHeights: [3.4, 3.7, 4], floors: { min: 1, max: 1 }, base: { min: 0.5, max: 1.2 } };
const TWO_STOREY_HOUSE: FloorPlan = { ...HOUSE, floors: { min: 2, max: 2 } };
const HOUSE_TWO_STOREY_CHANCE = 0.15;
const BIG_HOUSE_GARAGE_CHANCE = 0.8;
const SUPERMARKET: FloorPlan = { floorHeights: [6, 7, 8], floors: { min: 1, max: 1 } };
const WALL: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 3, max: 10 } };
const NARROW_WALL: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 5, max: 9 } };
const TOWER_SIZE: Range = { min: 0.5, max: 0.7 }; // fraction of the block's width and depth
const HOUSE_SIZE: Range = { min: 10, max: 13 };
const WIDE_HOUSE_CHANCE = 0.5;
const WIDE_HOUSE_LENGTH: Range = { min: 16, max: 20 };
const WIDE_HOUSE_DEPTH: Range = { min: 9, max: 11 };
const GARAGE: FloorPlan = { floorHeights: [3.7], floors: { min: 1, max: 1 } };
const GARAGE_WIDTH: Range = { min: 6, max: 7 }; // garages are square
const BIG_HOUSE_GARAGE_WIDTH: Range = { min: 8, max: 9 };
const GARAGE_SPOTS = [0, 0.5, 1]; // along the wall: one end, the middle, the other end
const WIDE_HOUSE_GARAGE_SPOTS = [0, 1]; // a garage in the middle of a long front would cover the front door
const HOUSE_FENCE_GAP = 2; // space between each house and the block's centre lines, where the fence will go

function between(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

type Storeys = Omit<Building, 'rect'>;

function storeys(plan: FloorPlan, random: () => number): Storeys {
  const floorHeight = plan.floorHeights[Math.floor(random() * plan.floorHeights.length)];
  const floors = plan.floors.min + Math.floor(random() * (plan.floors.max - plan.floors.min + 1));
  const base = plan.base ? between(plan.base, random) : 0;
  return { base, floors, floorHeight, height: base + floors * floorHeight };
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
    ...storeys(MID_RISE, random),
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
  const shopPlan = stripMall ? STRIP_MALL_SHOP : SHOP;
  const lotStoreys = lots.map(() => storeys(shopPlan, random));
  const used = lots.map(() => false);
  const result: Building[] = [];
  for (const [first, middle, last] of SHOP_SIDES) {
    const joinFirst = random() < settings.lowDensityMergeChance;
    const joinLast = random() < settings.lowDensityMergeChance;
    const mergedStoreys = storeys(stripMall ? STRIP_MALL_SHOP : MERGED_SHOP, random);
    if (!filled[middle]) continue;
    const group: number[] = [middle];
    if (joinFirst && filled[first] && !used[first]) group.push(first);
    if (joinLast && filled[last] && !used[last]) group.push(last);
    group.forEach((index) => (used[index] = true));
    result.push({ rect: union(group.map((index) => lots[index])), ...(group.length > 1 ? mergedStoreys : lotStoreys[middle]) });
  }
  for (const corner of SHOP_CORNERS) {
    if (filled[corner] && !used[corner]) result.push({ rect: lots[corner], ...lotStoreys[corner] });
  }
  return result;
};

// One tower at a random size and position inside the block.
const tower: BlockBuilder = (rect, random) => {
  const width = (rect.maxX - rect.minX) * between(TOWER_SIZE, random);
  const depth = (rect.maxZ - rect.minZ) * between(TOWER_SIZE, random);
  const minX = rect.minX + random() * (rect.maxX - rect.minX - width);
  const minZ = rect.minZ + random() * (rect.maxZ - rect.minZ - depth);
  return [{ rect: { minX, minZ, maxX: minX + width, maxZ: minZ + depth }, ...storeys(TOWER, random) }];
};

// Neighbouring houses either side of a block centre line, and the street a big house of them faces:
// north, south, west and east pairs.
const HOUSE_PAIRS = [
  [0, 1, 'minZ'],
  [2, 3, 'maxZ'],
  [0, 2, 'minX'],
  [1, 3, 'maxX'],
] as const;

function houseStoreys(random: () => number): Storeys {
  return storeys(random() < HOUSE_TWO_STOREY_CHANCE ? TWO_STOREY_HOUSE : HOUSE, random);
}

// A rectangle from the corner (x, z), sizes signed by the direction it grows in.
function fromCorner(x: number, z: number, sizeX: number, sizeZ: number): Rect {
  return { minX: Math.min(x, x + sizeX), minZ: Math.min(z, z + sizeZ), maxX: Math.max(x, x + sizeX), maxZ: Math.max(z, z + sizeZ) };
}

// A box against `side` of `rect`, `width` along that side and sticking out `depth`, `share` (0 to 1) of the way along.
function garageSpot(spots: readonly number[], random: () => number): number {
  return spots[Math.floor(random() * spots.length)];
}

function attached(rect: Rect, side: Side, width: number, depth: number, share: number): Rect {
  if (side === 'minX' || side === 'maxX') {
    const minX = side === 'minX' ? rect.minX - depth : rect.maxX;
    const minZ = rect.minZ + share * (rect.maxZ - rect.minZ - width);
    return { minX, minZ, maxX: minX + depth, maxZ: minZ + width };
  }
  const minX = rect.minX + share * (rect.maxX - rect.minX - width);
  const minZ = side === 'minZ' ? rect.minZ - depth : rect.maxZ;
  return { minX, minZ, maxX: minX + width, maxZ: minZ + depth };
}

interface Home {
  core: Rect; // the square on the lot's inner corner, the part a big house is made of
  house: Rect;
  entrance: Side;
  garage?: Rect;
  garageDoor: Side;
  storeys: Storeys;
  garageStoreys: Storeys;
}

// Four houses, one per quarter, set in the corner nearest the block centre so each yard faces the street.
// A house is a square or a wide house along either street, with an optional garage on a wall facing a street.
// That street is the lot's entrance. Two neighbours can join across the centre line into a big house, which faces
// the street they share and can have a garage on its front or either end; each house joins at most one.
const houses: BlockBuilder = (rect, random, settings) => {
  const centreX = (rect.minX + rect.maxX) / 2;
  const centreZ = (rect.minZ + rect.maxZ) / 2;
  const homes: Home[] = [];
  for (const sideZ of [-1, 1]) {
    for (const sideX of [-1, 1]) {
      const nearX = centreX + sideX * HOUSE_FENCE_GAP;
      const nearZ = centreZ + sideZ * HOUSE_FENCE_GAP;
      const xSide: Side = sideX < 0 ? 'minX' : 'maxX';
      const zSide: Side = sideZ < 0 ? 'minZ' : 'maxZ';
      const core = fromCorner(nearX, nearZ, sideX * between(HOUSE_SIZE, random), sideZ * between(HOUSE_SIZE, random));
      const wide = random() < WIDE_HOUSE_CHANCE;
      const alongX = random() < 0.5;
      const length = between(WIDE_HOUSE_LENGTH, random);
      const depth = between(WIDE_HOUSE_DEPTH, random);
      const house = !wide
        ? core
        : alongX
          ? fromCorner(nearX, nearZ, sideX * length, sideZ * depth)
          : fromCorner(nearX, nearZ, sideX * depth, sideZ * length);
      // A wide house's end wall is left out: a garage there wouldn't fit before the sidewalk.
      const towardsX = random() < 0.5;
      const garageSide = wide ? (alongX ? zSide : xSide) : towardsX ? xSide : zSide;
      const hasGarage = random() < settings.housesGarageChance;
      const garageSize = between(GARAGE_WIDTH, random);
      const garage = attached(house, garageSide, garageSize, garageSize, garageSpot(wide ? WIDE_HOUSE_GARAGE_SPOTS : GARAGE_SPOTS, random));
      const homeStoreys = houseStoreys(random);
      const garageStoreys = storeys(GARAGE, random);
      // A square house's garage, equally likely: door and lot on the garage's street; lot on the other street with
      // the driveway running past the door; or door and lot both on the other street.
      const layoutRoll = Math.floor(random() * 3);
      const layout = !wide && hasGarage ? layoutRoll : 0;
      const otherSide = garageSide === xSide ? zSide : xSide;
      homes.push({
        core,
        house,
        entrance: layout === 0 ? garageSide : otherSide,
        garage: hasGarage ? garage : undefined,
        garageDoor: layout === 2 ? otherSide : garageSide,
        storeys: homeStoreys,
        garageStoreys,
      });
    }
  }
  const used = homes.map(() => false);
  const result: Building[] = [];
  const addHome = (
    house: Rect,
    entrance: Side,
    houseStoreys: Storeys,
    garage: Rect | undefined,
    door: Side,
    garageStoreys: Storeys,
  ) => {
    result.push({ rect: house, part: 'house', entrance, ...houseStoreys });
    if (garage) result.push({ rect: garage, part: 'garage', entrance, door, ...garageStoreys });
  };
  for (const [first, second, front] of HOUSE_PAIRS) {
    const bigHouse = random() < settings.housesBigHouseChance;
    const bigHouseStoreys = storeys(TWO_STOREY_HOUSE, random);
    const hasGarage = random() < BIG_HOUSE_GARAGE_CHANCE;
    const [left, right]: Side[] = front === 'minZ' || front === 'maxZ' ? ['minX', 'maxX'] : ['minZ', 'maxZ'];
    // Garages on an end wall sit flush with the front, so the driveway can reach them.
    const frontShare = front === 'minX' || front === 'minZ' ? 0 : 1;
    const spots: [Side, number][] = [
      [left, frontShare],
      [front, 0],
      [front, 1],
      [right, frontShare],
    ];
    const [garageSide, garageShare] = spots[Math.floor(random() * spots.length)];
    const garageWidth = between(BIG_HOUSE_GARAGE_WIDTH, random);
    if (!bigHouse || used[first] || used[second]) continue;
    used[first] = used[second] = true;
    const house = union([homes[first].core, homes[second].core]);
    const garage = hasGarage ? attached(house, garageSide, garageWidth, garageWidth, garageShare) : undefined;
    addHome(house, front, bigHouseStoreys, garage, front, homes[first].garageStoreys);
  }
  homes.forEach((home, index) => {
    if (!used[index]) addHome(home.house, home.entrance, home.storeys, home.garage, home.garageDoor, home.garageStoreys);
  });
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
  return [{ rect: halves[Math.floor(random() * halves.length)], ...storeys(SUPERMARKET, random) }];
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
  return { rect, ...storeys(kind === 'narrow' ? NARROW_WALL : WALL, random) };
}

// Zones without buildings use 1.
function floorScales(settings: CitySettings): Record<Zone, number> {
  return {
    [Zone.LowDensity]: settings.lowDensityFloors,
    [Zone.MidDensity]: settings.midDensityFloors,
    [Zone.HighRise]: settings.highRiseFloors,
    [Zone.Houses]: settings.housesFloors,
    [Zone.Park]: 1,
    [Zone.Supermarket]: settings.supermarketFloors,
    [Zone.ParkingLot]: 1,
    [Zone.Plaza]: 1,
  };
}

// Floors stay whole, at least 1.
function scaled(building: Building, floorScale: number, ceilingScale: number): Building {
  const floors = Math.max(1, Math.round(building.floors * floorScale));
  const floorHeight = building.floorHeight * ceilingScale;
  return { ...building, floors, floorHeight, height: building.base + floors * floorHeight };
}

// Scaled after generation, so a multiplier doesn't change the random calls or the layout.
export function generateBuildings(city: City, settings: CitySettings): Building[] {
  const { seed } = settings;
  const scales = floorScales(settings);
  const blockBuildings = city.blocks.flatMap((block, index) =>
    BUILDERS[block.zone](inset(block.rect, SETBACK), createRandom(blockSeed(seed, index)), settings).map((building) =>
      scaled(building, scales[block.zone], settings.ceilingHeight),
    ),
  );
  // Seeds after the block and wall side seeds used in city.ts.
  const wallSeedStart = city.blocks.length + 4;
  // Flex pieces stay open as alleys.
  const wallBuildings = city.wall.flatMap((piece, index) =>
    piece.kind === 'flex'
      ? []
      : [scaled(wallBuilding(piece, createRandom(blockSeed(seed, wallSeedStart + index))), settings.wallFloors, settings.ceilingHeight)],
  );
  return [...blockBuildings, ...wallBuildings];
}
