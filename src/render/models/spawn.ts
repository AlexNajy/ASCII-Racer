import type { Building, BuildingKind, Layout } from '../../game/buildings.ts';
import { inset, SETBACK } from '../../game/buildings.ts';
import { Zone, type City, type Rect } from '../../game/city.ts';
import { blockSeed, createRandom } from '../../math/random.ts';
import { mall, superstore } from './buildings/bigBoxes.ts';
import { garage, house } from './buildings/houses.ts';
import { brickWalkup, concreteFlats, hotel, steppedFlats, wallBlock } from './buildings/midRises.ts';
import { neonShop, sleepyShop } from './buildings/shops.ts';
import { glassSlab, podiumTower, steppedDeco, twinSlab } from './buildings/towers.ts';
import { combine, type BuildingModel, type Model } from './model.ts';
import { flexAlley, openLotModel, yardTrees } from './props/openLots.ts';

// How often a style comes up for a building; 0 means never. Depends on the lot and its neighbourhood.
interface Rule {
  model: BuildingModel;
  weight: (building: Building) => number;
}

const always = (weight: number) => () => weight;
const onAvenue = (building: Building) => building.avenues.length > 0;
const shortSide = ({ rect }: Building) => Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
const OLD_TOWN = 0.5; // neighbourhoods below this are mostly brick, above it mostly newer

const RULES: Record<BuildingKind, readonly Rule[]> = {
  shop: [
    { model: neonShop, weight: (b) => (onAvenue(b) ? 8 : 3) },
    { model: sleepyShop, weight: (b) => (onAvenue(b) ? 1 : 2) },
  ],
  midRise: [
    { model: brickWalkup, weight: (b) => (b.neighbourhood < OLD_TOWN ? 6 : 2) },
    { model: concreteFlats, weight: (b) => (b.neighbourhood < OLD_TOWN ? 2 : 4) },
    { model: steppedFlats, weight: (b) => (shortSide(b) >= 20 ? 2 : 0) },
    { model: hotel, weight: (b) => (onAvenue(b) ? 3 : 0.5) },
  ],
  tower: [
    { model: glassSlab, weight: always(4) },
    { model: steppedDeco, weight: (b) => (shortSide(b) >= 26 ? 3 : 0) },
    { model: podiumTower, weight: (b) => (shortSide(b) >= 24 ? 3 : 1) },
    { model: twinSlab, weight: (b) => (shortSide(b) >= 18 ? 2 : 0) },
  ],
  mall: [{ model: mall, weight: always(1) }],
  supermarket: [{ model: superstore, weight: always(1) }],
  house: [{ model: house, weight: always(1) }],
  garage: [{ model: garage, weight: always(1) }],
  wall: [{ model: wallBlock, weight: always(1) }],
};

function choose(building: Building, roll: number): BuildingModel {
  const rules = RULES[building.kind];
  let left = roll * rules.reduce((sum, { weight }) => sum + weight(building), 0);
  for (const { model, weight } of rules) {
    left -= weight(building);
    if (left < 0) return model;
  }
  return rules[0].model;
}

// Seeds above the block, wall and neighbourhood seeds, so what is drawn never changes the layout.
const MODEL_SEED = 1 << 21;
const OPEN_LOT_SEED = 1 << 22;
const YARD_SEED = 1 << 23;
const FLEX_SEED = 1 << 24;

// Everything standing on the city's lots, drawn as one mesh.
export function cityModels(city: City, { buildings, open }: Layout, driveways: Rect[], seed: number): Model {
  const generator = (base: number, index: number) => createRandom(blockSeed(seed, base + index));
  const buildingModels = buildings.map((building, index) => {
    const random = generator(MODEL_SEED, index);
    return choose(building, random())(building, random);
  });
  const openModels = open.map((lot, index) => openLotModel(lot, generator(OPEN_LOT_SEED, index)));
  const houses = buildings.filter(({ kind }) => kind === 'house' || kind === 'garage').map(({ rect }) => rect);
  const yards = city.blocks
    .filter(({ zone }) => zone === Zone.Houses)
    .map(({ rect }, index) => yardTrees(inset(rect, SETBACK), [...houses, ...driveways], generator(YARD_SEED, index)));
  const flexAlleys = city.wall
    .filter(({ kind }) => kind === 'flex')
    .map(({ rect }, index) => flexAlley(rect, city, generator(FLEX_SEED, index)));
  return combine([...buildingModels, ...openModels, ...yards, ...flexAlleys]);
}
