import { generateBuildings, type Layout } from './buildings.ts';
import { collideCar, createCar, stepCar, type Car, type CarSettings, type Impact } from './car.ts';
import type { CarInput } from './carInput.ts';
import { generateCity, type City, type CitySettings, type Rect } from './city.ts';
import { cityColliders, type Collider } from './collision.ts';
import { houseDriveways } from './driveways.ts';
import { houseFences } from './fences.ts';
import { generateIntersections, type Intersections } from './intersections.ts';
import { signalOffsets } from './signals.ts';
import { generateStreetLights, type StreetLight } from './streetLights.ts';
import { cityModels } from '../render/models/spawn.ts';
import type { Model } from '../render/models/model.ts';

// Everything generated from the seed. `models` holds the drawn vertices too, because the colliders come from
// the same models (a stepped tower is only solid where it stands).
export interface CityData {
  city: City;
  layout: Layout;
  fences: Rect[];
  driveways: Rect[];
  streetLights: StreetLight[];
  intersections: Intersections;
  signalOffsets: number[];
  models: Model;
  colliders: Collider[];
}

// The simulation: the city, the car and the tick. No WebGL or DOM, so it runs in Node too.
// The settings objects are kept by reference, so the dev menu's edits apply on the next tick or rebuild.
export interface World extends CityData {
  citySettings: CitySettings;
  carSettings: CarSettings;
  car: Car;
  previousCar: Car; // the car before the last tick, for drawing between ticks
  tick: number;
}

// What one tick did that the renderer reacts to.
export interface TickResult {
  impact: Impact | null;
}

const START_X = 0;
const START_Z = 0;
const START_HEADING = 0;

export function generateCityData(settings: CitySettings): CityData {
  const city = generateCity(settings);
  const layout = generateBuildings(city, settings);
  const fences = houseFences(city, layout.buildings);
  const driveways = houseDriveways(city, layout.buildings);
  const streetLights = generateStreetLights(city, settings);
  const intersections = generateIntersections(city, settings);
  const models = cityModels(city, layout, driveways, settings.seed);
  return {
    city,
    layout,
    fences,
    driveways,
    streetLights,
    intersections,
    signalOffsets: signalOffsets(city, settings.seed),
    models,
    colliders: cityColliders(models.colliders, fences, streetLights, intersections),
  };
}

export function createWorld(citySettings: CitySettings, carSettings: CarSettings): World {
  const car = createCar(START_X, START_Z, START_HEADING);
  return { ...generateCityData(citySettings), citySettings, carSettings, car, previousCar: { ...car }, tick: 0 };
}

// Builds the city again from the current settings; the car and the tick carry on.
export function regenerateCity(world: World): void {
  Object.assign(world, generateCityData(world.citySettings));
}

export function stepWorld(world: World, input: CarInput): TickResult {
  world.previousCar = { ...world.car };
  stepCar(world.car, input, world.carSettings);
  const impact = collideCar(world.car, world.colliders, world.carSettings);
  world.tick++;
  return { impact };
}
