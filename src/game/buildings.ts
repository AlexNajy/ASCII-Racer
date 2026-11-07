import { blockSeed, createRandom } from '../math/random.ts';
import { subtract, Zone, type Block, type City, type CitySettings, type Rect, type WallPiece } from './city.ts';

export type BuildingKind = 'shop' | 'midRise' | 'tower' | 'mall' | 'supermarket' | 'house' | 'garage' | 'wall';

export interface Building {
  kind: BuildingKind;
  rect: Rect;
  base: number; // m, a raised ground floor (house steps)
  floors: number;
  floorHeight: number; // m
  height: number; // base + floors × floorHeight
  merged?: boolean; // made of several lots
  entrance?: Side; // the street a house's lot opens to, the car park a supermarket opens to
  door?: Side; // garages only: the wall the door is on
  garage?: Rect; // houses only: the garage against it, so the front door can keep clear
  driveway?: Rect; // houses without a garage: a dead-end driveway
  streets: Side[]; // the sides on the block's street edge, so 2 is a corner
  avenues: Side[]; // the ones of `streets` that face an avenue
  zone?: Zone; // block buildings only
  neighbourhood: number; // 0 to 1, shared by nearby blocks, so styles and colours cluster
}

export type Side = 'minX' | 'maxX' | 'minZ' | 'maxZ';

// Ground without a building, kept as data so models know what to put there.
export type OpenUse = 'yard' | 'parking' | 'seating' | 'plaza' | 'park' | 'alley';

export interface OpenLot {
  use: OpenUse;
  rect: Rect;
  entrance?: Side; // car parks: the side cars come in from, so no bays go there
}

// What a filler or block puts on its ground.
export interface Layout {
  buildings: Building[];
  open: OpenLot[];
}

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

// Builders give everything but what depends on the block around them; generateBuildings fills that in.
type Placed = Omit<Building, 'streets' | 'avenues' | 'neighbourhood'>;

interface PlacedLayout {
  buildings: Placed[];
  open: OpenLot[];
}

// Fills one lot. Zones are made of these, so they can mix.
type Filler = (lot: Rect, random: () => number, settings: CitySettings) => PlacedLayout;
type BlockBuilder = Filler;

export const SETBACK = 3;
const EDGE_TOLERANCE = 1e-6; // m, lot edges come from sums that can miss the block edge by rounding
const ALLEY_WIDTH = 4;
const SHOP: FloorPlan = { floorHeights: [6, 7, 8], floors: { min: 1, max: 2 } };
const MERGED_SHOP: FloorPlan = { ...SHOP, floors: { min: 1, max: 3 } };
const STRIP_MALL_SHOP: FloorPlan = { ...SHOP, floors: { min: 1, max: 1 } };
const MID_RISE: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 5, max: 10 } };
const MERGED_MID_RISE: FloorPlan = { ...MID_RISE, floors: { min: 8, max: 14 } };
const TOWER: FloorPlan = { floorHeights: [3.5, 4], floors: { min: 15, max: 40 } };
const BIG_TOWER: FloorPlan = { ...TOWER, floors: { min: 12, max: 26 } };
const MALL: FloorPlan = { floorHeights: [6, 7], floors: { min: 2, max: 3 } };
const HOUSE: FloorPlan = { floorHeights: [3.4, 3.7, 4], floors: { min: 1, max: 1 }, base: { min: 0.5, max: 1.2 } };
const TWO_STOREY_HOUSE: FloorPlan = { ...HOUSE, floors: { min: 2, max: 2 } };
const HOUSE_TWO_STOREY_CHANCE = 0.15;
const BIG_HOUSE_GARAGE_CHANCE = 0.8;
const SUPERMARKET: FloorPlan = { floorHeights: [6, 7, 8], floors: { min: 1, max: 1 } };
const WALL: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 3, max: 10 } };
const NARROW_WALL: FloorPlan = { floorHeights: [3, 3.5], floors: { min: 5, max: 9 } };
const TOWER_SIZE: Range = { min: 0.5, max: 0.7 }; // fraction of the block's width and depth
const FILLER_TOWER_SIZE: Range = { min: 0.8, max: 1 }; // fraction of a quarter of the block
const WIDE_SIDEWALK = 5; // m, around one big building
const HOUSE_SIZE: Range = { min: 10, max: 13 };
const WIDE_HOUSE_CHANCE = 0.5;
const WIDE_HOUSE_LENGTH: Range = { min: 16, max: 20 };
const WIDE_HOUSE_DEPTH: Range = { min: 9, max: 11 };
const GARAGE: FloorPlan = { floorHeights: [3.7], floors: { min: 1, max: 1 } };
const GARAGE_WIDTH: Range = { min: 6, max: 7 }; // garages are square
const BIG_HOUSE_GARAGE_WIDTH: Range = { min: 8, max: 9 };
const GARAGE_SPOTS = [0, 0.5, 1]; // along the wall: one end, the middle, the other end
const WIDE_HOUSE_GARAGE_SPOTS = [0, 1]; // a garage in the middle of a long front would cover the front door
const DEAD_END_WIDTH = 5; // m, a driveway without a garage
const DEAD_END_GAP = 3; // m, grass between a dead end that leads to its house and the house, for a path to the door later
const HOUSE_FENCE_GAP = 2; // space between each house and the block's centre lines, where the fence will go

function between(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

type Storeys = Pick<Building, 'base' | 'floors' | 'floorHeight' | 'height'>;

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

// The strips between the lots of a 2×2 split, for alleys.
function alleys(rect: Rect, [columnGap, rowGap]: [number, number]): OpenLot[] {
  const x = (rect.minX + rect.maxX) / 2;
  const z = (rect.minZ + rect.maxZ) / 2;
  const open: OpenLot[] = [];
  if (columnGap > 0) open.push({ use: 'alley', rect: { ...rect, minX: x - columnGap / 2, maxX: x + columnGap / 2 } });
  if (rowGap > 0) open.push({ use: 'alley', rect: { ...rect, minZ: z - rowGap / 2, maxZ: z + rowGap / 2 } });
  return open;
}

// Neighbours in a 2×2 split, in the order they are checked: north, south, west and east pairs.
const MID_RISE_PAIRS = [
  [0, 1, 'x'],
  [2, 3, 'x'],
  [0, 2, 'z'],
  [1, 3, 'z'],
] as const;

// Four mid-rises. Neighbours with no alley between them can merge into one taller building; each lot joins at most one.
const midRises: BlockBuilder = (rect, random, settings) => {
  const gaps = alleyGaps(settings.midDensityAlleyChance, random);
  const lots = split(rect, 2, 2, ...gaps);
  const lotStoreys = lots.map(() => storeys(MID_RISE, random));
  const used = lots.map(() => false);
  const buildings: Placed[] = [];
  for (const [first, second, axis] of MID_RISE_PAIRS) {
    const merge = random() < settings.midDensityMergeChance;
    const mergedStoreys = storeys(MERGED_MID_RISE, random);
    const touching = (axis === 'x' ? gaps[0] : gaps[1]) === 0;
    if (!merge || !touching || used[first] || used[second]) continue;
    used[first] = used[second] = true;
    buildings.push({ kind: 'midRise', rect: union([lots[first], lots[second]]), merged: true, ...mergedStoreys });
  }
  lots.forEach((lot, index) => {
    if (!used[index]) buildings.push({ kind: 'midRise', rect: lot, ...lotStoreys[index] });
  });
  return { buildings, open: alleys(rect, gaps) };
};

const midRise: Filler = (lot, random) => ({ buildings: [{ kind: 'midRise', rect: lot, ...storeys(MID_RISE, random) }], open: [] });

const mall: Filler = (lot, random) => ({ buildings: [{ kind: 'mall', rect: lot, ...storeys(MALL, random) }], open: [] });

// Two touching low-rises along the lot's longer side.
const lowRises: Filler = (lot, random) => {
  const alongX = lot.maxX - lot.minX >= lot.maxZ - lot.minZ;
  const pieces = split(lot, alongX ? 2 : 1, alongX ? 1 : 2, 0, 0);
  return { buildings: pieces.map((rect) => ({ kind: 'shop' as const, rect, ...storeys(SHOP, random) })), open: [] };
};

const seating: Filler = (lot) => ({ buildings: [], open: [{ use: 'seating', rect: lot }] });

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
  const result: Placed[] = [];
  for (const [first, middle, last] of SHOP_SIDES) {
    const joinFirst = random() < settings.lowDensityMergeChance;
    const joinLast = random() < settings.lowDensityMergeChance;
    const mergedStoreys = storeys(stripMall ? STRIP_MALL_SHOP : MERGED_SHOP, random);
    if (!filled[middle]) continue;
    const group: number[] = [middle];
    if (joinFirst && filled[first] && !used[first]) group.push(first);
    if (joinLast && filled[last] && !used[last]) group.push(last);
    group.forEach((index) => (used[index] = true));
    const merged = group.length > 1;
    result.push({ kind: 'shop', rect: union(group.map((index) => lots[index])), merged, ...(merged ? mergedStoreys : lotStoreys[middle]) });
  }
  for (const corner of SHOP_CORNERS) {
    if (filled[corner] && !used[corner]) result.push({ kind: 'shop', rect: lots[corner], ...lotStoreys[corner] });
  }
  // The back yard is walled in; the other empty lots are small car parks.
  const open = lots.flatMap((rect, index): OpenLot[] => {
    if (index === 4) return [{ use: 'yard', rect }];
    return filled[index] ? [] : [{ use: 'parking', rect }];
  });
  return { buildings: result, open };
};

// A rectangle of the given size at a random spot inside `rect`.
function placedIn(rect: Rect, width: number, depth: number, random: () => number): Rect {
  const minX = rect.minX + random() * (rect.maxX - rect.minX - width);
  const minZ = rect.minZ + random() * (rect.maxZ - rect.minZ - depth);
  return { minX, minZ, maxX: minX + width, maxZ: minZ + depth };
}

// A tower `size` of the lot's width and depth at a random spot in it; what is left around it is for seating.
function towerIn(lot: Rect, size: Range, random: () => number): PlacedLayout {
  const width = (lot.maxX - lot.minX) * between(size, random);
  const depth = (lot.maxZ - lot.minZ) * between(size, random);
  const rect = placedIn(lot, width, depth, random);
  return { buildings: [{ kind: 'tower', rect, ...storeys(TOWER, random) }], open: subtract(lot, [rect]).map((r) => ({ use: 'seating', rect: r })) };
}

const combine = (layouts: PlacedLayout[]): PlacedLayout => ({
  buildings: layouts.flatMap(({ buildings }) => buildings),
  open: layouts.flatMap(({ open }) => open),
});

// Weighted: picks an item by its share of the total weight.
function weighted<T>(items: readonly (readonly [number, T])[], roll: number): T {
  let left = roll * items.reduce((sum, [weight]) => sum + weight, 0);
  for (const [weight, item] of items) {
    left -= weight;
    if (left < 0) return item;
  }
  return items[items.length - 1][1];
}

const singleTower: BlockBuilder = (rect, random) => towerIn(rect, TOWER_SIZE, random);

// One big building with wide sidewalks all round.
const bigTower: BlockBuilder = (rect, random) => {
  const footprint = inset(rect, WIDE_SIDEWALK);
  return {
    buildings: [{ kind: 'tower', rect: footprint, ...storeys(BIG_TOWER, random) }],
    open: subtract(rect, [footprint]).map((r) => ({ use: 'seating', rect: r })),
  };
};

const TOWER_NEIGHBOURS: readonly (readonly [number, Filler])[] = [
  [3, mall],
  [3, midRise],
  [3, lowRises],
  [2, seating],
];

// A tower on one quarter of the block, a filler each on the other three.
const towerAndFillers: BlockBuilder = (rect, random, settings) => {
  const gaps = alleyGaps(settings.midDensityAlleyChance, random);
  const quarters = split(rect, 2, 2, ...gaps);
  const towerQuarter = Math.floor(random() * quarters.length);
  const layouts = quarters.map((quarter, index) => {
    const filler = weighted(TOWER_NEIGHBOURS, random());
    return index === towerQuarter ? towerIn(quarter, FILLER_TOWER_SIZE, random) : filler(quarter, random, settings);
  });
  return combine([...layouts, { buildings: [], open: alleys(rect, gaps) }]);
};

// Two towers on opposite corners with an alley between them, seating on the other two.
const twoTowers: BlockBuilder = (rect, random) => {
  const gaps: [number, number] = [ALLEY_WIDTH, ALLEY_WIDTH];
  const quarters = split(rect, 2, 2, ...gaps);
  const [first, second, ...others] = random() < 0.5 ? [0, 3, 1, 2] : [1, 2, 0, 3];
  const open: OpenLot[] = [...others.map((index) => ({ use: 'seating' as const, rect: quarters[index] })), ...alleys(rect, gaps)];
  return combine([towerIn(quarters[first], FILLER_TOWER_SIZE, random), towerIn(quarters[second], FILLER_TOWER_SIZE, random), { buildings: [], open }]);
};

const HIGH_RISE_LAYOUTS: readonly (readonly [number, BlockBuilder])[] = [
  [2, singleTower],
  [2, bigTower],
  [4, towerAndFillers],
  [3, twoTowers],
];

const highRise: BlockBuilder = (rect, random, settings) => weighted(HIGH_RISE_LAYOUTS, random())(rect, random, settings);

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

const OPPOSITE: Record<Side, Side> = { minX: 'maxX', maxX: 'minX', minZ: 'maxZ', maxZ: 'minZ' };

// From `from` out to the yard's edge on `side`, between `a` and `b` across.
function toStreet(yard: Rect, side: Side, from: number, a: number, b: number): Rect {
  const [min, max] = [Math.min(from, yard[side]), Math.max(from, yard[side])];
  const [acrossMin, acrossMax] = [Math.min(a, b), Math.max(a, b)];
  return side === 'minX' || side === 'maxX'
    ? { minX: min, maxX: max, minZ: acrossMin, maxZ: acrossMax }
    : { minX: acrossMin, maxX: acrossMax, minZ: min, maxZ: max };
}

interface Home {
  core: Rect; // the square on the lot's inner corner, the part a big house is made of
  house: Rect;
  entrance: Side;
  garage?: Rect;
  garageDoor: Side;
  deadEnd?: Rect;
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
      const spot = garageSpot(wide ? WIDE_HOUSE_GARAGE_SPOTS : GARAGE_SPOTS, random);
      const garage = attached(house, garageSide, garageSize, garageSize, spot);
      const homeStoreys = houseStoreys(random);
      const garageStoreys = storeys(GARAGE, random);
      // A square house's garage, equally likely: door and lot on the garage's street; lot on the other street with
      // the driveway running past the door; or door and lot both on the other street.
      const layoutRoll = Math.floor(random() * 3);
      const layout = !wide && hasGarage ? layoutRoll : 0;
      const otherSide = garageSide === xSide ? zSide : xSide;
      const deadEndRoll = Math.floor(random() * 4);
      // Without a garage, a dead-end driveway to park on, kept clear of the house. One that runs past the house is
      // centred between it and the yard edge.
      const clearX = house[xSide] + sideX * DEAD_END_GAP;
      const clearZ = house[zSide] + sideZ * DEAD_END_GAP;
      const pastX = (house[xSide] + rect[xSide] - DEAD_END_WIDTH) / 2;
      const pastZ = (house[zSide] + rect[zSide] - DEAD_END_WIDTH) / 2;
      const spotX = house.minX + spot * (house.maxX - house.minX - DEAD_END_WIDTH);
      const spotZ = house.minZ + spot * (house.maxZ - house.minZ - DEAD_END_WIDTH);
      // A square house's, equally likely: straight up to either street wall, or past either of them from the other
      // street, through the lot's street corner.
      const squareDeadEnds: [Side, Rect][] = [
        [xSide, toStreet(rect, xSide, clearX, spotZ, spotZ + DEAD_END_WIDTH)],
        [zSide, toStreet(rect, zSide, clearZ, spotX, spotX + DEAD_END_WIDTH)],
        [zSide, toStreet(rect, zSide, nearZ, pastX, pastX + DEAD_END_WIDTH)],
        [xSide, toStreet(rect, xSide, nearX, pastZ, pastZ + DEAD_END_WIDTH)],
      ];
      // A wide house's goes up to the street end of its front.
      const wideDeadEnd =
        garageSide === zSide
          ? toStreet(rect, zSide, clearZ, house[xSide], house[xSide] - sideX * DEAD_END_WIDTH)
          : toStreet(rect, xSide, clearX, house[zSide], house[zSide] - sideZ * DEAD_END_WIDTH);
      const [entrance, deadEnd]: [Side, Rect | undefined] = hasGarage
        ? [layout === 0 ? garageSide : otherSide, undefined]
        : wide
          ? [garageSide, wideDeadEnd]
          : squareDeadEnds[deadEndRoll];
      homes.push({
        core,
        house,
        entrance,
        garage: hasGarage ? garage : undefined,
        garageDoor: layout === 2 ? otherSide : garageSide,
        deadEnd,
        storeys: homeStoreys,
        garageStoreys,
      });
    }
  }
  const used = homes.map(() => false);
  const result: Placed[] = [];
  const addHome = ({ house, entrance, storeys, garage, garageDoor, deadEnd, garageStoreys }: Omit<Home, 'core'>) => {
    result.push({ kind: 'house', rect: house, entrance, driveway: deadEnd, garage, ...storeys });
    if (garage) result.push({ kind: 'garage', rect: garage, entrance, door: garageDoor, ...garageStoreys });
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
    const deadEndSide = random() < 0.5 ? left : right;
    if (!bigHouse || used[first] || used[second]) continue;
    used[first] = used[second] = true;
    const house = union([homes[first].core, homes[second].core]);
    const garage = hasGarage ? attached(house, garageSide, garageWidth, garageWidth, garageShare) : undefined;
    // Without a garage, a dead end beside one end wall, from the back of the house to the street, centred between
    // the wall and the yard edge.
    const past = (house[deadEndSide] + rect[deadEndSide] - DEAD_END_WIDTH) / 2;
    const deadEnd = hasGarage ? undefined : toStreet(rect, front, house[OPPOSITE[front]], past, past + DEAD_END_WIDTH);
    addHome({
      house,
      entrance: front,
      storeys: bigHouseStoreys,
      garage,
      garageDoor: front,
      deadEnd,
      garageStoreys: homes[first].garageStoreys,
    });
  }
  homes.forEach((home, index) => {
    if (!used[index]) addHome(home);
  });
  return { buildings: result, open: [] };
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
  const store = Math.floor(random() * halves.length);
  // Opposite halves are neighbours in the list. The car park opens away from the store, where the sidewalk has its gap.
  const OTHER_HALF = [1, 0, 3, 2];
  const ENTRANCES: Side[] = ['maxZ', 'minZ', 'maxX', 'minX'];
  return {
    buildings: [{ kind: 'supermarket', rect: halves[store], entrance: ENTRANCES[store], ...storeys(SUPERMARKET, random) }],
    open: [{ use: 'parking', rect: halves[OTHER_HALF[store]], entrance: ENTRANCES[store] }],
  };
};

const openGround = (use: OpenUse): BlockBuilder => (rect) => ({ buildings: [], open: [{ use, rect }] });

// The side of a car park block that faces the city centre.
export function centreFacingSide(rect: Rect): Side {
  const x = (rect.minX + rect.maxX) / 2;
  const z = (rect.minZ + rect.maxZ) / 2;
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'minX' : 'maxX') : z > 0 ? 'minZ' : 'maxZ';
}

const carPark: BlockBuilder = (rect) => ({ buildings: [], open: [{ use: 'parking', rect, entrance: centreFacingSide(rect) }] });

const BUILDERS: Record<Zone, BlockBuilder> = {
  [Zone.LowDensity]: shops,
  [Zone.MidDensity]: midRises,
  [Zone.HighRise]: highRise,
  [Zone.Houses]: houses,
  [Zone.Park]: openGround('park'),
  [Zone.Supermarket]: supermarket,
  [Zone.ParkingLot]: carPark,
  [Zone.Plaza]: openGround('plaza'),
};

// The side facing into the city. Only for side pieces: a corner piece is outside two sides of the bounds.
function wallStreet(rect: Rect, bounds: Rect): Side {
  if (rect.maxZ <= bounds.minZ) return 'maxZ';
  if (rect.minZ >= bounds.maxZ) return 'minZ';
  return rect.maxX <= bounds.minX ? 'maxX' : 'minX';
}

// One building filling the whole wall piece, so neighbours touch and the wall stays unbroken.
// Corner pieces sit behind the ends of two sides and only touch the pavement at a point, so they face no street.
function wallBuilding({ rect, kind }: WallPiece, random: () => number, bounds: Rect): Building {
  const streets = kind === 'corner' ? [] : [wallStreet(rect, bounds)];
  return { kind: 'wall', rect, ...storeys(kind === 'narrow' ? NARROW_WALL : WALL, random), streets, avenues: [], neighbourhood: random() };
}

const SIDES: Side[] = ['minX', 'maxX', 'minZ', 'maxZ'];

function streetSides(building: Rect, lots: Rect): Side[] {
  return SIDES.filter((side) => Math.abs(building[side] - lots[side]) < EDGE_TOLERANCE);
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
function scaled<T extends Storeys>(building: T, floorScale: number, ceilingScale: number): T {
  const floors = Math.max(1, Math.round(building.floors * floorScale));
  const floorHeight = building.floorHeight * ceilingScale;
  return { ...building, floors, floorHeight, height: building.base + floors * floorHeight };
}

const NEIGHBOURHOOD_BLOCKS = 3; // blocks per side of a neighbourhood
const NEIGHBOURHOOD_SEED = 1 << 20; // above any block index

// Blocks in the same square of the grid share a value.
function neighbourhood(block: Block, seed: number): number {
  const x = Math.floor(block.column / NEIGHBOURHOOD_BLOCKS);
  const z = Math.floor(block.row / NEIGHBOURHOOD_BLOCKS);
  return createRandom(blockSeed(seed, NEIGHBOURHOOD_SEED + z * 256 + x))();
}

// A block's sides lie along the road lines west and east of its column, north and south of its row.
function avenueSides({ column, row }: Block, { avenues }: City): Side[] {
  const sides: [Side, boolean][] = [
    ['minX', avenues.columns.has(column)],
    ['maxX', avenues.columns.has(column + 1)],
    ['minZ', avenues.rows.has(row)],
    ['maxZ', avenues.rows.has(row + 1)],
  ];
  return sides.flatMap(([side, avenue]) => (avenue ? [side] : []));
}

// Scaled after generation, so a multiplier doesn't change the random calls or the layout.
export function generateBuildings(city: City, settings: CitySettings): Layout {
  const { seed } = settings;
  const scales = floorScales(settings);
  const blocks = city.blocks.map((block, index) => {
    const lots = inset(block.rect, SETBACK);
    const { buildings, open } = BUILDERS[block.zone](lots, createRandom(blockSeed(seed, index)), settings);
    const blockAvenues = avenueSides(block, city);
    return {
      open,
      buildings: buildings.map((building) => {
        const streets = streetSides(building.rect, lots);
        return {
          ...scaled(building, scales[block.zone], settings.ceilingHeight),
          streets,
          avenues: streets.filter((side) => blockAvenues.includes(side)),
          zone: block.zone,
          neighbourhood: neighbourhood(block, seed),
        };
      }),
    };
  });
  // Seeds after the block and wall side seeds used in city.ts.
  const wallSeedStart = city.blocks.length + 4;
  // Flex pieces stay open as alleys.
  const wallBuildings = city.wall.flatMap((piece, index) =>
    piece.kind === 'flex'
      ? []
      : [
          scaled(
            wallBuilding(piece, createRandom(blockSeed(seed, wallSeedStart + index)), city.bounds),
            settings.wallFloors,
            settings.ceilingHeight,
          ),
        ],
  );
  return {
    buildings: [...blocks.flatMap(({ buildings }) => buildings), ...wallBuildings],
    open: blocks.flatMap(({ open }) => open),
  };
}
