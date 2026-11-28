import { DEFAULT_CAR_SETTINGS, type CarSettings } from './car.ts';
import { NO_INPUT } from './carInput.ts';
import type { CitySettings } from './city.ts';
import { dailyCitySettings, dailyRace } from './daily.ts';
import { checkLog, codeInput, type InputLog } from './inputLog.ts';
import { raceTicks } from './race.ts';
import { DEFAULT_ROUTE_OPTIONS, type RouteOptions } from './route.ts';
import { createRaceWorld, stepWorld, type World } from './world.ts';

// A recorded race driven again, headless. A run counts only if the finish is crossed on the log's last tick.

export type ReplayResult =
  | { finished: true; ticks: number; gates: number }
  | { finished: false; reason: 'logEnded' | 'inputsAfterFinish'; gates: number };

// Drives the world's race, which must be in its countdown, through the log: the countdown without input, then one
// logged input per tick. At most the countdown plus MAX_RUN_TICKS ticks.
export function replayInWorld(world: World, log: InputLog): ReplayResult {
  checkLog(log);
  const { race } = world;
  if (race?.phase !== 'countdown') throw new Error('replay: the world has no race in its countdown');
  while (race.phase === 'countdown') stepWorld(world, NO_INPUT);
  for (let i = 0; i < log.length; i++) {
    stepWorld(world, codeInput(log[i]));
    if (race.phase !== 'finished') continue;
    if (i < log.length - 1) return { finished: false, reason: 'inputsAfterFinish', gates: race.nextGate };
    return { finished: true, ticks: raceTicks(race, world.tick), gates: race.nextGate };
  }
  return { finished: false, reason: 'logEnded', gates: race.nextGate };
}

// The race on the city of `citySettings` and its route `routeSeed`, from tick 0 in a fresh world without vertices.
// Throws a RouteError if the city can't hold the route.
export function replayRun(
  citySettings: CitySettings,
  carSettings: CarSettings,
  routeSeed: number,
  routeOptions: RouteOptions,
  log: InputLog,
): ReplayResult {
  return replayInWorld(createRaceWorld(citySettings, carSettings, routeSeed, routeOptions, false), log);
}

export function replayDaily(day: number, log: InputLog): ReplayResult {
  const { seed } = dailyRace(day);
  return replayRun(dailyCitySettings(seed), { ...DEFAULT_CAR_SETTINGS }, seed, DEFAULT_ROUTE_OPTIONS, log);
}
