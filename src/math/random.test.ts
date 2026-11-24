import { describe, expect, it } from 'vitest';
import { blockSeed, createRandom, shuffle } from './random';

function take(random: () => number, count: number): number[] {
  return Array.from({ length: count }, random);
}

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(createRandom(42), 100)).toEqual(take(createRandom(42), 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(createRandom(1), 10)).not.toEqual(take(createRandom(2), 10));
  });

  it('stays in [0, 1)', () => {
    for (const value of take(createRandom(7), 10000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('blockSeed', () => {
  it('is stable and does not collide on swapped seed and index', () => {
    expect(blockSeed(5, 9)).toBe(blockSeed(5, 9));
    expect(blockSeed(1, 2)).not.toBe(blockSeed(2, 1));
  });
});

describe('shuffle', () => {
  it('keeps the items and is repeatable for a seed', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [...a];
    shuffle(a, createRandom(3));
    shuffle(b, createRandom(3));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
