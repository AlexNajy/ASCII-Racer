import { describe, expect, it } from 'vitest';
import { INPUT_LOG_VERSION } from './inputLog.ts';
import { Hasher } from './referenceRun.ts';
import { DRIVEN_RACE_HASH, PACKED_RACE_HASH, REFERENCE_HASHES, REFERENCE_RACES, REFERENCE_ROUTES, REFERENCE_SEEDS } from './referenceValues.ts';
import { SIMULATION_VERSION } from './version.ts';

// Everything a server replaying a run depends on: free-driving runs with a city digest (physics, collisions,
// generation), the driven race (race rules, routes), route digests, the daily's seeds and routes, and the packed
// log with its format version. Tooling constants (the test driver's tuning, shot spots) are not in it.
export function simulationFingerprint(): number {
  const hasher = new Hasher();
  hasher.numbers(Object.entries(REFERENCE_HASHES).flat().map(Number));
  hasher.numbers([DRIVEN_RACE_HASH, PACKED_RACE_HASH, INPUT_LOG_VERSION]);
  hasher.numbers(REFERENCE_ROUTES.flat());
  hasher.numbers(REFERENCE_SEEDS.flat());
  hasher.numbers(REFERENCE_RACES.flat());
  return hasher.value;
}

// One entry per version, kept as history. A fingerprint is never reused: a bump without a change is refused.
const SIMULATION_FINGERPRINTS: Record<number, number> = {
  1: 3556499534,
};

describe('simulation version', () => {
  const versions = Object.keys(SIMULATION_FINGERPRINTS).map(Number);

  it('is a positive integer', () => {
    expect(Number.isInteger(SIMULATION_VERSION)).toBe(true);
    expect(SIMULATION_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('has a fingerprint for every version from 1 to the current one and none beyond', () => {
    expect(
      versions,
      `SIMULATION_FINGERPRINTS must hold exactly versions 1 to ${SIMULATION_VERSION}, with no gaps. Add the fingerprint of the new version.`,
    ).toEqual(Array.from({ length: SIMULATION_VERSION }, (_, i) => i + 1));
  });

  it('never uses a fingerprint twice', () => {
    const values = Object.values(SIMULATION_FINGERPRINTS);
    expect(
      new Set(values).size,
      'Two versions share a fingerprint: a version bump needs a change in the stored reference values. Remove the bump or find what changed.',
    ).toBe(values.length);
  });

  it('matches the stored reference values to the current version', () => {
    const fingerprint = simulationFingerprint();
    const bumped = SIMULATION_FINGERPRINTS[SIMULATION_VERSION] === undefined;
    const next = bumped ? SIMULATION_VERSION : SIMULATION_VERSION + 1;
    expect(
      fingerprint,
      [
        `The stored reference values give fingerprint ${fingerprint}, version ${SIMULATION_VERSION} has ${SIMULATION_FINGERPRINTS[SIMULATION_VERSION]}.`,
        bumped
          ? `Add ${next}: ${fingerprint} to SIMULATION_FINGERPRINTS in src/game/version.test.ts.`
          : `Simulation or generation changed: bump SIMULATION_VERSION to ${next} in src/game/version.ts and add ${next}: ${fingerprint} to SIMULATION_FINGERPRINTS in src/game/version.test.ts.`,
      ].join('\n'),
    ).toBe(SIMULATION_FINGERPRINTS[SIMULATION_VERSION]);
  });
});
