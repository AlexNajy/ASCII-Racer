import { NO_INPUT, type CarInput } from './carInput.ts';
import type { Car } from './car.ts';
import { stepWorld, type World } from './world.ts';
import type { JunctionControl } from './city.ts';
import { hypot } from '../math/deterministic.ts';
import { blockSeed, createRandom } from '../math/random.ts';

// A scripted drive for tests: the same seed always gives the same inputs, held for random stretches, so the
// car accelerates, steers, drifts, brakes, reverses and hits walls.

export const REFERENCE_TICKS = 10000;
export const REFERENCE_SAMPLE_EVERY = 500;
const INPUT_SEED_INDEX = 0x1f00;
const MIN_STRETCH_TICKS = 15;
const MAX_STRETCH_TICKS = 150;

const JUNCTION_CONTROLS: readonly JunctionControl[] = ['none', 'lights', 'allWayStop', 'twoWayStop'];

const MANOEUVRES: readonly CarInput[] = [
  { throttle: 1, brake: 0, steer: 0, drift: 0 },
  { throttle: 1, brake: 0, steer: 1, drift: 0 },
  { throttle: 1, brake: 0, steer: -1, drift: 0 },
  { throttle: 1, brake: 0, steer: 1, drift: 1 },
  { throttle: 1, brake: 0, steer: -1, drift: 1 },
  { throttle: 0.6, brake: 0, steer: 0.5, drift: 0 },
  { throttle: 0, brake: 1, steer: 0, drift: 0 },
  { throttle: 0, brake: 1, steer: 1, drift: 0 },
  { throttle: 0, brake: 1, steer: -1, drift: 0 },
  { throttle: 0, brake: 0, steer: 0, drift: 0 },
];

export function referenceInputs(seed: number, ticks: number = REFERENCE_TICKS): CarInput[] {
  const random = createRandom(blockSeed(seed, INPUT_SEED_INDEX));
  const inputs: CarInput[] = [];
  while (inputs.length < ticks) {
    const manoeuvre = MANOEUVRES[Math.floor(random() * MANOEUVRES.length)] ?? NO_INPUT;
    const length = MIN_STRETCH_TICKS + Math.floor(random() * (MAX_STRETCH_TICKS - MIN_STRETCH_TICKS));
    for (let i = 0; i < length && inputs.length < ticks; i++) inputs.push(manoeuvre);
  }
  return inputs;
}

// FNV-1a over the exact bytes of the numbers (little endian doubles), so no rounding hides a change.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export class Hasher {
  private hash = FNV_OFFSET;
  private readonly view = new DataView(new ArrayBuffer(8));

  number(value: number): void {
    this.view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) {
      this.hash = Math.imul(this.hash ^ this.view.getUint8(i), FNV_PRIME);
    }
  }

  numbers(values: readonly number[]): void {
    for (const value of values) this.number(value);
  }

  get value(): number {
    return this.hash >>> 0;
  }
}

export function hashCar(hasher: Hasher, car: Car): void {
  hasher.numbers([car.x, car.z, car.heading, car.velocityX, car.velocityZ, car.traction, car.drifting ? 1 : 0]);
}

// Everything generation decided that the simulation or its verification can see.
export function cityDigest(world: World): number {
  const hasher = new Hasher();
  const { colliders, layout, city, fences, driveways, streetLights, intersections, signalOffsets } = world;
  hasher.numbers([colliders.length, layout.buildings.length, fences.length, driveways.length, streetLights.length]);
  for (const { rect, top } of colliders) hasher.numbers([rect.minX, rect.minZ, rect.maxX, rect.maxZ, top]);
  for (const { rect, base, height } of layout.buildings) hasher.numbers([rect.minX, rect.minZ, rect.maxX, rect.maxZ, base, height]);
  hasher.numbers([city.bounds.minX, city.bounds.minZ, city.bounds.maxX, city.bounds.maxZ]);
  for (const junction of city.junctions) {
    hasher.numbers([junction.column, junction.row, junction.x, junction.z, JUNCTION_CONTROLS.indexOf(junction.control)]);
    for (const leg of Object.keys(junction.stops).sort()) {
      hasher.numbers([junction.stops[leg as keyof typeof junction.stops] ? 1 : 0, junction.crosswalks[leg as keyof typeof junction.crosswalks] ? 1 : 0]);
    }
  }
  hasher.numbers([intersections.trafficLights.length, intersections.stopSigns.length]);
  hasher.numbers(signalOffsets);
  return hasher.value;
}

export interface ReferenceResult {
  hash: number;
  samples: number[]; // the car's hash every REFERENCE_SAMPLE_EVERY ticks
  impacts: number;
  distance: number; // metres, summed along the path
}

// Steps the world through `inputs` and hashes the city, the car along the way
// (sampled and at the end) and every impact.
export function runReference(world: World, inputs: readonly CarInput[]): ReferenceResult {
  const hasher = new Hasher();
  hasher.number(cityDigest(world));
  const samples: number[] = [];
  let impacts = 0;
  let distance = 0;
  for (let index = 0; index < inputs.length; index++) {
    const { x, z } = world.car;
    const { impact } = stepWorld(world, inputs[index] ?? NO_INPUT);
    distance += hypot(world.car.x - x, world.car.z - z);
    if (impact) {
      impacts++;
      hasher.numbers([index, impact.speed, impact.normalX, impact.normalZ]);
    }
    if ((index + 1) % REFERENCE_SAMPLE_EVERY === 0) {
      const sample = new Hasher();
      hashCar(sample, world.car);
      samples.push(sample.value);
      hasher.number(sample.value);
    }
  }
  hashCar(hasher, world.car);
  return { hash: hasher.value, samples, impacts, distance };
}
