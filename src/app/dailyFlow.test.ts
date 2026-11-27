import { describe, expect, it } from 'vitest';
import { dailyCitySettings, dailyRace, type DailyRace } from '../game/daily.ts';
import { decodeLogText, encodeLogText, inputCode } from '../game/inputLog.ts';
import { COUNTDOWN_TICKS } from '../game/race.ts';
import { replayDaily } from '../game/replay.ts';
import { driveRace } from '../game/driver.ts';
import { createRaceWorld } from '../game/world.ts';
import { dailyEntry, recordOnChange, resultsOfRecord, startDaily } from './dailyFlow.ts';
import { didNotFinishRecord, finishedRecord, mergeForStore, settleRecord, startedRecord } from './dailyRecord.ts';
import { DAILY_CAR_SETTINGS } from './flow.ts';
import {
  dailyRacing,
  dailyResults,
  giveUp,
  loadingDaily,
  MENU,
  menuAt,
  preRace,
  pressEnter,
  pressEscape,
  race,
  raceFinished,
  type GameState,
} from './gameState.ts';

const DAY = 329;
const today = dailyRace(DAY);
const races: number[] = [];
const raceOf = (day: number): DailyRace => {
  races.push(day);
  return day === DAY ? today : dailyRace(day);
};

describe('opening the daily', () => {
  it("goes to the day's pre-race screen while the try is open, through loading when its city isn't built", () => {
    expect(dailyEntry(DAY, null, (seed) => seed === today.seed, raceOf)).toEqual(preRace(DAY, today.route));
    expect(dailyEntry(DAY, null, () => false, raceOf)).toEqual(loadingDaily(DAY, today.route));
    expect(dailyEntry(DAY, finishedRecord(DAY - 1, 6, 'x'), () => true, raceOf)).toEqual(preRace(DAY, today.route));
  });

  it('goes straight to the results once the try is used, building nothing', () => {
    races.length = 0;
    const built: number[] = [];
    const cityBuilt = (seed: number) => (built.push(seed), false);
    expect(dailyEntry(DAY, finishedRecord(DAY, 4000, 'x'), cityBuilt, raceOf)).toEqual(dailyResults(DAY, 4000));
    expect(dailyEntry(DAY, didNotFinishRecord(DAY), cityBuilt, raceOf)).toEqual(dailyResults(DAY, null));
    expect(dailyEntry(DAY, startedRecord(DAY), cityBuilt, raceOf)).toEqual(dailyResults(DAY, null));
    expect(dailyEntry(DAY - 1, finishedRecord(DAY, 4000, 'x'), cityBuilt, raceOf)).toEqual(dailyResults(DAY, 4000));
    expect(races).toEqual([]);
    expect(built).toEqual([]);
  });

  it('opens the try under a record more than a day ahead of the clock', () => {
    expect(dailyEntry(DAY, finishedRecord(DAY + 2, 4000, 'x'), () => true, raceOf)).toEqual(preRace(DAY, today.route));
  });
});

describe('starting from the pre-race screen', () => {
  const PRE_RACE = preRace(DAY, today.route) as Extract<GameState, { kind: 'preRace' }>;
  const noCity = () => false;

  it('starts the race while the try is still open', () => {
    expect(startDaily(PRE_RACE, null, DAY, noCity, raceOf)).toEqual(dailyRacing(DAY, today.route));
    expect(startDaily(PRE_RACE, finishedRecord(DAY - 1, 6, 'x'), DAY, noCity, raceOf)).toEqual(dailyRacing(DAY, today.route));
  });

  it("goes to the results when another tab used the day's try meanwhile, writing nothing", () => {
    const finished = finishedRecord(DAY, 4000, 'x');
    const results = startDaily(PRE_RACE, finished, DAY, noCity, raceOf);
    expect(results).toEqual(dailyResults(DAY, 4000));
    expect(recordOnChange(PRE_RACE, results)).toBeNull();
    expect(startDaily(PRE_RACE, settleRecord(startedRecord(DAY)), DAY, noCity, raceOf)).toEqual(dailyResults(DAY, null));
    expect(startDaily(PRE_RACE, startedRecord(DAY), DAY, noCity, raceOf)).toEqual(dailyResults(DAY, null));
  });

  it("keeps the screen's day past midnight, but goes to the daily as it is now under a later day's record", () => {
    const late = startDaily(PRE_RACE, null, DAY + 1, noCity, raceOf);
    expect(late).toEqual(dailyRacing(DAY, today.route));
    expect(startDaily(PRE_RACE, didNotFinishRecord(DAY + 1), DAY + 1, noCity, raceOf)).toEqual(dailyResults(DAY + 1, null));
    const stale = preRace(DAY - 2, today.route) as Extract<GameState, { kind: 'preRace' }>;
    expect(startDaily(stale, finishedRecord(DAY - 1, 9, 'x'), DAY, noCity, raceOf)).toEqual(loadingDaily(DAY, today.route));
  });

  it('starts under a record too far ahead to read', () => {
    expect(startDaily(PRE_RACE, finishedRecord(DAY + 3650, 9, 'x'), DAY, noCity, raceOf)).toEqual(dailyRacing(DAY, today.route));
  });
});

describe("a second tab's try", () => {
  it('is not stored over the first finish, and its results show the stored one', () => {
    const first = finishedRecord(DAY, 5000, 'x');
    const kept = mergeForStore(first, finishedRecord(DAY, 4000, 'y'), DAY);
    expect(kept).toBe(first);
    expect(resultsOfRecord(dailyResults(DAY, 4000), kept)).toEqual(dailyResults(DAY, 5000));
    const givenUp = mergeForStore(first, didNotFinishRecord(DAY), DAY);
    expect(resultsOfRecord(dailyResults(DAY, null), givenUp)).toEqual(dailyResults(DAY, 5000));
  });

  it("leaves results of a day without a stored try, and other states, as they are", () => {
    const shown = dailyResults(DAY, 4000);
    expect(resultsOfRecord(shown, finishedRecord(DAY, 4000, 'x'))).toBe(shown);
    expect(resultsOfRecord(shown, finishedRecord(DAY + 1, 10, 'x'))).toBe(shown);
    expect(resultsOfRecord(shown, null)).toBe(shown);
    expect(resultsOfRecord(MENU, finishedRecord(DAY, 10, 'x'))).toBe(MENU);
  });
});

describe("the daily's record", () => {
  const PRE_RACE = preRace(DAY, today.route);
  const DAILY = dailyRacing(DAY, today.route);

  it('uses the try as the countdown starts, not when the pre-race screen opens', () => {
    expect(recordOnChange(MENU, PRE_RACE)).toBeNull();
    expect(recordOnChange(PRE_RACE, MENU)).toBeNull();
    expect(recordOnChange(PRE_RACE, pressEnter(PRE_RACE))).toEqual(startedRecord(DAY));
  });

  it('writes nothing while the race goes on, the give-up question included', () => {
    const asking = pressEscape(DAILY);
    expect(recordOnChange(DAILY, asking)).toBeNull();
    expect(recordOnChange(asking, pressEscape(asking))).toBeNull();
    expect(recordOnChange(DAILY, raceFinished(DAILY, 100))).toBeNull();
  });

  it('counts a daily race left without its finish as did not finish', () => {
    const asking = pressEscape(DAILY);
    expect(recordOnChange(asking, pressEnter(asking))).toEqual(didNotFinishRecord(DAY));
    expect(recordOnChange(DAILY, giveUp(DAILY))).toEqual(didNotFinishRecord(DAY));
    expect(recordOnChange(DAILY, MENU)).toEqual(didNotFinishRecord(DAY)); // the dev menu's regenerate
  });

  it('leaves the finish to the finishing tick', () => {
    const finished = raceFinished(DAILY, 100);
    expect(recordOnChange(finished, dailyResults(DAY, 100))).toBeNull();
    expect(recordOnChange(finished, pressEscape(finished))).toBeNull();
  });

  it('keeps the day of the pre-race screen, past midnight too', () => {
    const late = pressEnter(preRace(DAY - 1, today.route));
    expect(recordOnChange(preRace(DAY - 1, today.route), late)).toEqual(startedRecord(DAY - 1));
    expect(recordOnChange(late, giveUp(late))).toEqual(didNotFinishRecord(DAY - 1));
  });

  it('writes nothing for unlimited', () => {
    const route = today.route;
    const states: GameState[] = [MENU, race('unlimited', route), menuAt('unlimited'), { kind: 'results', mode: 'unlimited', route, ticks: 1, selected: 0 }];
    for (const a of states) for (const b of states) expect(recordOnChange(a, b)).toBeNull();
  });
});

describe('a daily driven with the daily car settings', () => {
  it('replays to the same finish on the day, as a server would replay it', () => {
    const world = createRaceWorld(dailyCitySettings(today.seed), DAILY_CAR_SETTINGS, today.seed, undefined, false);
    const driven = driveRace(world, 20_000, true);
    expect(driven.finished).toBe(true);
    const log = Uint8Array.from(driven.inputs.slice(COUNTDOWN_TICKS).map(inputCode));
    expect(log.length).toBe(driven.raceTicks);
    expect(replayDaily(DAY, log)).toEqual({ finished: true, ticks: driven.raceTicks, gates: today.route.gates.length });
    expect(decodeLogText(encodeLogText(log))).toEqual({ ok: true, log });
  });
});
