import { describe, expect, it } from 'vitest';
import { dailyCitySettings, DAILY_EPOCH, DAILY_SEEDS, dailyRace, dailySeed, dayNumber, MS_PER_DAY, millisecondsToNextDay } from './daily.ts';
import { Hasher } from './referenceRun.ts';
import type { Route } from './route.ts';

const DAYS_TESTED = 1000;

describe('day number', () => {
  it('starts at the epoch', () => {
    expect(DAILY_EPOCH).toBe(Date.UTC(2026, 0, 1));
    expect(dayNumber(DAILY_EPOCH)).toBe(0);
  });

  it('changes at exactly 00:00:00.000 UTC', () => {
    expect(dayNumber(DAILY_EPOCH + MS_PER_DAY - 1)).toBe(0);
    expect(dayNumber(DAILY_EPOCH + MS_PER_DAY)).toBe(1);
    expect(dayNumber(Date.UTC(2026, 4, 17, 23, 59, 59, 999))).toBe(136);
    expect(dayNumber(Date.UTC(2026, 4, 18))).toBe(137);
  });

  it('counts the leap day and far dates', () => {
    expect(dayNumber(Date.UTC(2028, 1, 29))).toBe(789);
    expect(dayNumber(Date.UTC(2028, 2, 1))).toBe(790);
    expect(dayNumber(Date.UTC(2126, 0, 1))).toBe(36524);
  });

  it('counts days before the epoch as negative', () => {
    expect(dayNumber(DAILY_EPOCH - 1)).toBe(-1);
    expect(dayNumber(Date.UTC(2025, 11, 31))).toBe(-1);
    expect(dayNumber(Date.UTC(2025, 0, 1))).toBe(-365);
  });

  it('counts down to the next day', () => {
    expect(millisecondsToNextDay(DAILY_EPOCH)).toBe(MS_PER_DAY);
    expect(millisecondsToNextDay(DAILY_EPOCH + MS_PER_DAY - 1)).toBe(1);
    expect(millisecondsToNextDay(DAILY_EPOCH + MS_PER_DAY)).toBe(MS_PER_DAY);
    expect(millisecondsToNextDay(DAILY_EPOCH - 1)).toBe(1);
  });
});

describe('daily seed', () => {
  const REFERENCE_SEEDS: [number, number][] = [
    [0, 746813],
    [1, 661912],
    [329, 424449],
    [1000, 14021],
  ];

  it.each(REFERENCE_SEEDS)('is stable for day %i', (day, stored) => {
    expect(dailySeed(day)).toBe(stored);
  });

  it('is a whole number in the city seed range and unrelated between days', () => {
    const seen = new Set<number>();
    for (let day = -50; day < DAYS_TESTED; day++) {
      const seed = dailySeed(day);
      expect(Number.isInteger(seed) && seed >= 1 && seed <= DAILY_SEEDS).toBe(true);
      seen.add(seed);
      expect(Math.abs(dailySeed(day + 1) - seed)).toBeGreaterThan(1);
    }
    expect(seen.size).toBeGreaterThan(DAYS_TESTED);
  });

  it('gives other attempts other seeds', () => {
    expect(dailySeed(5, 1)).not.toBe(dailySeed(5, 0));
  });

  it('uses the default city settings', () => {
    expect(dailyCitySettings(77)).toEqual({ ...dailyCitySettings(1), seed: 77 });
  });
});

function digest(route: Route): number {
  const hasher = new Hasher();
  for (const leg of route.legs) hasher.numbers([leg.segment, leg.from, leg.to]);
  hasher.numbers([route.start.point.x, route.start.point.z, route.pose.x, route.pose.z, route.pose.heading, route.length]);
  for (const gate of route.gates) hasher.numbers([gate.leg, gate.point.x, gate.point.z, gate.direction.x, gate.direction.z, gate.width]);
  return hasher.value;
}

describe('daily race', { timeout: 30000 }, () => {
  const REFERENCE_RACES: [number, number, number][] = [
    // day, city and route seed, route digest
    [0, 746813, 2422616063],
    [329, 424449, 1818073889],
  ];

  it.each(REFERENCE_RACES)('matches the stored seed and route for day %i', (day, seed, stored) => {
    const race = dailyRace(day);
    expect(race.seed).toBe(seed);
    expect(
      digest(race.route),
      [
        `The daily route of day ${day} changed.`,
        'The day number, seed derivation, city generation or route generation now gives another race, so runs recorded',
        'before it no longer replay on the same route. Only fine if meant: replace REFERENCE_RACES here',
        '(and bump the simulation version once it exists).',
      ].join('\n'),
    ).toBe(stored);
  });

  it('gives every one of the first days a route without falling back', () => {
    for (let day = 0; day < DAYS_TESTED; day++) {
      const race = dailyRace(day);
      expect(race.attempt, `day ${day}`).toBe(0);
      expect(race.seed).toBe(dailySeed(day));
      expect(race.route.seed).toBe(race.seed);
      expect(race.route.gates.length).toBeGreaterThan(0);
    }
  });
});
