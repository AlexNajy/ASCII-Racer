import { DEFAULT_CITY_SETTINGS, generateCity, type CitySettings } from './city.ts';
import { roadGraph } from './roadGraph.ts';
import { generateRoute, RouteError, type Route } from './route.ts';
import { blockSeed } from '../math/random.ts';

// The daily race: pure functions of a day number, shared by the client and the server that replays runs.

export const DAILY_EPOCH = 1767225600000; // ms, 2026-01-01T00:00:00Z
export const MS_PER_DAY = 86_400_000;
export const DAILY_SEEDS = 1_000_000; // city seeds are 1 to this, as unlimited's
export const DAILY_ATTEMPTS = 20; // candidate seeds tried per day before giving up
const DAILY_SALT = 0x6461696c; // keeps the daily's seeds apart from other uses of blockSeed

// Whole days since the epoch; days before it are negative (-1 is the day before).
export function dayNumber(utcMilliseconds: number): number {
  return Math.floor((utcMilliseconds - DAILY_EPOCH) / MS_PER_DAY);
}

export function millisecondsToNextDay(utcMilliseconds: number): number {
  return DAILY_EPOCH + (dayNumber(utcMilliseconds) + 1) * MS_PER_DAY - utcMilliseconds;
}

// The attempt's city seed; attempt 0 unless the day's city can't hold a route.
export function dailySeed(day: number, attempt = 0): number {
  return 1 + (blockSeed(day ^ DAILY_SALT, attempt) % DAILY_SEEDS);
}

export function dailyCitySettings(seed: number): CitySettings {
  return { ...DEFAULT_CITY_SETTINGS, seed };
}

export interface DailyRace {
  day: number;
  seed: number; // the city's seed, also the route's
  attempt: number; // 0 unless earlier seeds had no route
  route: Route;
}

// The day's city seed and route (default city settings, medium length). A seed whose city holds no route falls to the
// next attempt.
export function dailyRace(day: number): DailyRace {
  for (let attempt = 0; attempt < DAILY_ATTEMPTS; attempt++) {
    const seed = dailySeed(day, attempt);
    try {
      const route = generateRoute(roadGraph(generateCity(dailyCitySettings(seed))), seed);
      return { day, seed, attempt, route };
    } catch (error) {
      if (!(error instanceof RouteError)) throw error;
    }
  }
  throw new Error(`Day ${day} has no city that holds a route in ${DAILY_ATTEMPTS} attempts`);
}
