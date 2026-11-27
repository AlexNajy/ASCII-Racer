import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './carInput.ts';
import { DEFAULT_CAR_SETTINGS } from './car.ts';
import { advanceClock, capFrameSeconds, createClock } from './clock.ts';
import { DEFAULT_CITY_SETTINGS } from './city.ts';
import { cityDigest, referenceInputs, runReference, hashCar, Hasher, REFERENCE_SAMPLE_EVERY, REFERENCE_TICKS } from './referenceRun.ts';
import { createRandom } from '../math/random.ts';
import { REFERENCE_HASHES } from './referenceValues.ts';
import { createWorld, stepWorld, type World } from './world.ts';

const SEEDS = [1, 42];

function newWorld(seed: number): World {
  return createWorld({ ...DEFAULT_CITY_SETTINGS, seed }, { ...DEFAULT_CAR_SETTINGS });
}

// Generation is the slow part. The templates are never stepped, so each fresh world copies their untouched car.
const cities = new Map<number, World>();

function freshWorld(seed: number): World {
  let template = cities.get(seed);
  if (!template) {
    template = newWorld(seed);
    cities.set(seed, template);
  }
  const car = { ...template.car };
  return { ...template, car, previousCar: { ...car }, tick: 0 };
}

function reference(seed: number, inputSeed = seed) {
  return runReference(freshWorld(seed), referenceInputs(inputSeed));
}

const results = new Map<number, ReturnType<typeof reference>>();

function defaultRun(seed: number) {
  let result = results.get(seed);
  if (!result) {
    result = reference(seed);
    results.set(seed, result);
  }
  return result;
}

describe('determinism', () => {
  it('gives the same car state at every sampled tick in two separately built worlds', () => {
    const a = defaultRun(1);
    const b = runReference(newWorld(1), referenceInputs(1));
    expect(a.samples.length).toBe(REFERENCE_TICKS / REFERENCE_SAMPLE_EVERY);
    expect(b.samples).toEqual(a.samples);
    expect(b.hash).toBe(a.hash);
  });

  it('is not blind: other seeds or other inputs change the hash', () => {
    const base = defaultRun(1);
    expect(defaultRun(42).hash).not.toBe(base.hash);
    expect(reference(1, 42).hash).not.toBe(base.hash);
    expect(cityDigest(freshWorld(1))).not.toBe(cityDigest(freshWorld(42)));
  });

  it('gives the same car state after the same number of ticks whatever the frame times', () => {
    const TARGET_TICKS = 2000;
    const inputs = referenceInputs(1, TARGET_TICKS);
    const irregular = (seed: number) => {
      const random = createRandom(seed);
      return () => random() * 0.25; // some frames longer than MAX_FRAME_SECONDS, cut by capFrameSeconds
    };
    const patterns: Record<string, () => number> = {
      'steady 60 Hz': () => 1 / 60,
      'steady 144 Hz': () => 1 / 144,
      'irregular a': irregular(7),
      'irregular b': irregular(8),
    };
    const hashes = Object.entries(patterns).map(([name, nextFrame]) => {
      const world = freshWorld(1);
      const clock = createClock();
      while (clock.tick < TARGET_TICKS) {
        advanceClock(clock, capFrameSeconds(nextFrame()), (tick) => {
          if (tick < TARGET_TICKS) stepWorld(world, inputs[tick] ?? NO_INPUT);
        });
      }
      expect(world.tick, name).toBeGreaterThanOrEqual(TARGET_TICKS);
      const hasher = new Hasher();
      hashCar(hasher, world.car);
      return hasher.value;
    });
    for (const hash of hashes) expect(hash).toBe(hashes[0]);
  });

  it('is a real drive: impacts and distance', () => {
    for (const seed of SEEDS) {
      const { impacts, distance } = defaultRun(seed);
      expect(impacts).toBeGreaterThanOrEqual(5);
      expect(distance).toBeGreaterThan(500);
    }
  });

  it.each(SEEDS)('matches the stored reference hash for seed %i', (seed) => {
    const { hash } = defaultRun(seed);
    expect(
      hash,
      [
        `Reference run hash for seed ${seed} changed (${hash}, stored ${REFERENCE_HASHES[seed]}).`,
        'The simulation or the city generation now gives different results. That is only fine if it was meant:',
        'a recorded run no longer replays the same, so times recorded before it are void.',
        'If it was meant, replace the numbers in REFERENCE_HASHES in src/game/referenceValues.ts with the new hashes',
        '(and bump SIMULATION_VERSION, see version.test.ts). If not, find what changed the simulation.',
      ].join('\n'),
    ).toBe(REFERENCE_HASHES[seed]);
  });
});
