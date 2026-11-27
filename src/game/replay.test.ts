import { describe, expect, it } from 'vitest';
import { DEFAULT_CAR_SETTINGS } from './car.ts';
import { NO_INPUT } from './carInput.ts';
import { DEFAULT_CITY_SETTINGS, type CitySettings } from './city.ts';
import { dailyCitySettings, dailyRace } from './daily.ts';
import { driveRace } from './driver.ts';
import { COUNTDOWN_TICKS } from './race.ts';
import { decodeLogText, encodeLog, encodeLogText, inputCode, InputLogError, InputRecorder, type InputLog } from './inputLog.ts';
import { replayDaily, replayInWorld, replayRun } from './replay.ts';
import { Hasher } from './referenceRun.ts';
import { DEFAULT_ROUTE_OPTIONS, ROUTE_LENGTHS, type RouteLengthName, type RouteOptions } from './route.ts';
import { createRaceWorld, createWorld, startRace, stepWorld, type World } from './world.ts';
import { enterState } from '../app/flow.ts';
import { MENU, race as raceState } from '../app/gameState.ts';

const TICK_LIMIT = 20000;

interface Case {
  seed: number;
  length: RouteLengthName;
  blocksPerSide: number;
}

// The driver test's races, as city seed = route seed.
const CASES: Case[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed): Case => ({ seed, length: 'medium', blocksPerSide: 8 })),
  { seed: 13, length: 'short', blocksPerSide: 8 },
  { seed: 14, length: 'long', blocksPerSide: 8 },
  { seed: 15, length: 'short', blocksPerSide: 6 },
  { seed: 16, length: 'long', blocksPerSide: 10 },
];

function settingsOf({ seed, blocksPerSide }: Case): CitySettings {
  return { ...DEFAULT_CITY_SETTINGS, seed, blocksPerSide };
}

function optionsOf({ length }: Case): RouteOptions {
  return { length: ROUTE_LENGTHS[length] };
}

interface Recorded {
  world: World;
  log: InputLog;
  ticks: number;
  gates: number;
}

// The test driver tapping keys, from the start of the countdown; the log holds the ticks after it.
function recordRace(world: World): Recorded {
  const result = driveRace(world, TICK_LIMIT, true);
  expect(result.finished).toBe(true);
  const recorder = new InputRecorder();
  for (const input of result.inputs.slice(COUNTDOWN_TICKS)) recorder.record(input);
  return { world, log: recorder.log(), ticks: result.raceTicks, gates: result.gates };
}

const recorded = new Map<number, Recorded>();
function recordedCase(c: Case): Recorded {
  let found = recorded.get(c.seed);
  if (!found) {
    found = recordRace(createRaceWorld(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), false));
    recorded.set(c.seed, found);
  }
  return found;
}

function freshReplayWorld(c: Case, vertices = false): World {
  return createRaceWorld(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), vertices);
}

describe('replay', { timeout: 30000 }, () => {
  it.each(CASES)('gives the live finish for the recorded race in city $seed ($length, $blocksPerSide blocks)', (c) => {
    const { log, ticks, gates } = recordedCase(c);
    expect(log.length).toBe(ticks);
    const text = encodeLogText(log);
    const decoded = decodeLogText(text);
    if (!decoded.ok) throw new Error(decoded.fault);
    expect(replayRun(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), decoded.log)).toEqual({ finished: true, ticks, gates });
  });

  it('gives a different result for a log with one input changed mid-race', () => {
    const c = CASES[0];
    const { log, ticks } = recordedCase(c);
    const tampered = log.slice();
    const middle = Math.floor(log.length / 2);
    tampered[middle] = inputCode({ throttle: 0, brake: 1, steer: 0, drift: 0 });
    const result = replayRun(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), tampered);
    expect(result).not.toEqual({ finished: true, ticks, gates: recordedCase(c).gates });
  });

  it('does not finish a log cut short, and refuses one that goes on past the finish', () => {
    const c = CASES[0];
    const { log, gates } = recordedCase(c);
    const short = replayRun(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), log.slice(0, log.length - 1));
    expect(short).toEqual({ finished: false, reason: 'logEnded', gates: gates - 1 });
    const longer = new Uint8Array(log.length + 1);
    longer.set(log);
    longer[log.length] = log[log.length - 1];
    expect(replayRun(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), longer)).toEqual({ finished: false, reason: 'inputsAfterFinish', gates });
    expect(replayRun(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, c.seed, optionsOf(c), new Uint8Array(0))).toEqual({ finished: false, reason: 'logEnded', gates: 0 });
  });

  it('refuses a log with codes no input has, and a world without a race in its countdown', () => {
    const c = CASES[0];
    expect(() => replayInWorld(freshReplayWorld(c), new Uint8Array([31]))).toThrow(InputLogError);
    expect(() => replayInWorld(createWorld(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, false), new Uint8Array(0))).toThrow();
  });

  // The browser starts a race at whatever tick the player pressed Enter, in a world with vertices that has been
  // ticking in the menu, maybe after another race; the server from tick 0 in a fresh world without vertices.
  it('finishes the same whenever and wherever the race starts', () => {
    const c = CASES[1];
    const { log, ticks, gates } = recordedCase(c);
    const expected = { finished: true, ticks, gates };

    const fresh = freshReplayWorld(c);
    expect(replayInWorld(fresh, log)).toEqual(expected);

    const browser = createWorld(settingsOf(c), { ...DEFAULT_CAR_SETTINGS }, true);
    expect(browser.models.vertices.length).toBeGreaterThan(0);
    enterState(browser, MENU, MENU);
    for (let i = 0; i < 12345; i++) stepWorld(browser, NO_INPUT);
    const race = raceState('unlimited', fresh.race!.route);
    enterState(browser, race, MENU);
    expect(browser.race!.startTick).toBe(12345);
    expect(replayInWorld(browser, log)).toEqual(expected);
    expect(browser.car).toEqual(fresh.car);
    expect(browser.previousCar).toEqual(fresh.previousCar);

    // Driving on after the finish, then "again".
    const throttle = { throttle: 1, brake: 0, steer: 1, drift: 1 };
    for (let i = 0; i < 301; i++) stepWorld(browser, throttle);
    startRace(browser, browser.race!.route);
    expect(replayInWorld(browser, log)).toEqual(expected);
    expect(browser.car).toEqual(fresh.car);
  });

  it('replays a daily', () => {
    const day = 0;
    const { seed } = dailyRace(day);
    const world = createRaceWorld(dailyCitySettings(seed), { ...DEFAULT_CAR_SETTINGS }, seed, DEFAULT_ROUTE_OPTIONS, false);
    const { log, ticks, gates } = recordRace(world);
    expect(replayDaily(day, log)).toEqual({ finished: true, ticks, gates });
    expect(replayDaily(day + 1, log).finished).toBe(false);
  });

  // Update on purpose only: the packed form of a recorded race. A change here means the format changed (bump
  // INPUT_LOG_VERSION) or the recorded race did.
  const PACKED_RACE_HASH = 3079937558;

  it('matches the stored hash of the packed driven race in city 1', () => {
    const bytes = encodeLog(recordedCase(CASES[0]).log);
    const hasher = new Hasher();
    hasher.numbers([...bytes]);
    expect(hasher.value, `packed race hash ${hasher.value}, ${bytes.length} bytes`).toBe(PACKED_RACE_HASH);
  });
});
