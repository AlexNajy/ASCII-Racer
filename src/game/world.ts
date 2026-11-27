import { generateBuildings, type Layout } from './buildings.ts';
import { collideCar, createCar, stepCar, type Car, type CarSettings, type Impact } from './car.ts';
import type { CarInput } from './carInput.ts';
import { generateCity, type City, type CitySettings, type Junction, type Rect } from './city.ts';
import { cityColliders, type Collider } from './collision.ts';
import { houseDriveways } from './driveways.ts';
import { houseFences } from './fences.ts';
import { generateIntersections, type Intersections } from './intersections.ts';
import { advanceRace, COUNTDOWN_TICKS, createRace, type Race, type RaceEvent } from './race.ts';
import { roadGraph, type RoadGraph } from './roadGraph.ts';
import { DEFAULT_ROUTE_OPTIONS, generateRoute, type Route, type RouteOptions } from './route.ts';
import { signalOffsets } from './signals.ts';
import { generateStreetLights, type StreetLight } from './streetLights.ts';
import { cityModels } from '../render/models/spawn.ts';
import type { Model } from '../render/models/model.ts';
import { withoutVertices } from '../render/shapes.ts';

// Everything generated from the seed. `models` holds the drawn vertices too, because the colliders come from
// the same models (a stepped tower is only solid where it stands). Without `vertices` they are left empty.
export interface CityData {
  city: City;
  layout: Layout;
  fences: Rect[];
  driveways: Rect[];
  streetLights: StreetLight[];
  intersections: Intersections;
  signalOffsets: number[];
  roadGraph: RoadGraph;
  models: Model;
  colliders: Collider[];
}

// The simulation: the city, the car, the tick and the race. No WebGL or DOM, so it runs in Node too.
// The settings objects are kept by reference, so the dev menu's edits apply on the next tick or rebuild.
export interface World extends CityData {
  citySettings: CitySettings;
  carSettings: CarSettings;
  car: Car;
  previousCar: Car; // the car before the last tick, for drawing between ticks
  tick: number;
  race: Race | null; // null is free driving
}

// What one tick did that the renderer reacts to.
export interface TickResult {
  impact: Impact | null;
  race: RaceEvent | null;
}

export const START_HEADING = 0;

// The middle junction. Avenues are wider than streets, so it is not always at the origin.
export function startJunction(city: City): Junction {
  const perRow = Math.round(Math.sqrt(city.junctions.length));
  const middle = Math.floor(perRow / 2);
  return city.junctions.find(({ row, column }) => row === middle && column === middle)!;
}

export function generateCityData(settings: CitySettings, vertices = true): CityData {
  const city = generateCity(settings);
  const layout = generateBuildings(city, settings);
  const fences = houseFences(city, layout.buildings);
  const driveways = houseDriveways(city, layout.buildings);
  const streetLights = generateStreetLights(city, settings);
  const intersections = generateIntersections(city, settings);
  const buildModels = () => cityModels(city, layout, driveways, fences, settings.seed);
  const models = vertices ? buildModels() : withoutVertices(buildModels);
  return {
    city,
    layout,
    fences,
    driveways,
    streetLights,
    intersections,
    signalOffsets: signalOffsets(city, settings.seed),
    roadGraph: roadGraph(city),
    models,
    colliders: cityColliders(models.colliders, fences, streetLights, intersections),
  };
}

// Without `vertices` nothing is drawn but the simulation is the same (for tests and a server).
export function createWorld(citySettings: CitySettings, carSettings: CarSettings, vertices = true): World {
  const data = generateCityData(citySettings, vertices);
  const { x, z } = startJunction(data.city);
  const car = createCar(x, z, START_HEADING);
  return { ...data, citySettings, carSettings, car, previousCar: { ...car }, tick: 0, race: null };
}

// Puts the car on the route's start pose, standing still, and begins the countdown at the current tick.
export function startRace(world: World, route: Route): void {
  const { x, z, heading } = route.pose;
  world.car = createCar(x, z, heading);
  world.previousCar = { ...world.car };
  world.race = createRace(route, world.tick);
}

export function clearRace(world: World): void {
  world.race = null;
}

// A world whose race starts at tick 0. Throws a RouteError if the city can't hold the route.
export function createRaceWorld(
  citySettings: CitySettings,
  carSettings: CarSettings,
  routeSeed: number,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  vertices = true,
): World {
  const world = createWorld(citySettings, carSettings, vertices);
  startRace(world, generateRoute(world.roadGraph, routeSeed, options));
  return world;
}

// Builds the city again from the current settings; the car, the tick and the race (on the old route) carry on.
export function regenerateCity(world: World): void {
  Object.assign(world, generateCityData(world.citySettings));
}

export function stepWorld(world: World, input: CarInput): TickResult {
  world.previousCar = { ...world.car };
  const { race } = world;
  // The countdown holds the car exactly where it stands; the input is not read at all.
  if (race?.phase === 'countdown') {
    world.tick++;
    if (world.tick - race.startTick < COUNTDOWN_TICKS) return { impact: null, race: null };
    race.phase = 'running';
    return { impact: null, race: { kind: 'go' } };
  }
  stepCar(world.car, input, world.carSettings);
  const impact = collideCar(world.car, world.previousCar.x, world.previousCar.z, world.colliders, world.carSettings);
  world.tick++;
  return { impact, race: race ? advanceRace(race, world.previousCar, world.car, world.tick) : null };
}
