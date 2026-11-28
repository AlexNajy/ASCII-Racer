import { dailyRace, type DailyRace } from '../game/daily.ts';
import { dailyTry, didNotFinishRecord, readableRecord, recordTicks, startedRecord, type DailyRecord } from './dailyRecord.ts';
import { dailyResults, loadingDaily, preRace, pressEnter, type GameState } from './gameState.ts';

// Where opening the daily leads: a used try to its results; an open one to the pre-race screen, through the loading
// line when the day's city isn't the one built. `record` is the latest known, settled (a started try did not finish).
export function dailyEntry(
  today: number,
  record: DailyRecord | null,
  cityBuilt: (seed: number) => boolean,
  raceOf: (day: number) => DailyRace = dailyRace,
): GameState {
  const tried = dailyTry(record, today);
  if (tried.used) return dailyResults(tried.day, tried.ticks);
  const { seed, route } = raceOf(tried.day);
  return cityBuilt(seed) ? preRace(tried.day, route) : loadingDaily(tried.day, route);
}

// Enter on the pre-race screen, with the record read again just before (another tab may have used the try): a used
// try of its day goes to its results; a record of a later day (the screen was left open past midnight) to what
// opening the daily shows now; otherwise the race starts, on the screen's day.
export function startDaily(
  state: Extract<GameState, { kind: 'preRace' }>,
  record: DailyRecord | null,
  today: number,
  cityBuilt: (seed: number) => boolean,
  raceOf: (day: number) => DailyRace = dailyRace,
): GameState {
  const known = readableRecord(record, today);
  if (known && known.day > state.day) return dailyEntry(today, known, cityBuilt, raceOf);
  if (known?.day === state.day) return dailyResults(state.day, recordTicks(known));
  return pressEnter(state);
}

// The results of a day show its stored try, which may be another tab's that came first.
export function resultsOfRecord(state: GameState, record: DailyRecord | null): GameState {
  if (state.kind !== 'dailyResults' || record?.day !== state.day) return state;
  const ticks = recordTicks(record);
  return ticks === state.ticks ? state : dailyResults(state.day, ticks);
}

// What a change of state writes to the daily's record, null for nothing: the try is used as the countdown starts,
// before its first tick, and a daily race left without a finish (given up, run past the timer's cap) did not finish.
// The finish is written at the finishing tick, with the log, not here.
export function recordOnChange(previous: GameState, next: GameState): DailyRecord | null {
  const wasDaily = previous.kind === 'race' && previous.mode === 'daily';
  if (next.kind === 'race' && next.mode === 'daily' && !wasDaily) return startedRecord(next.day);
  if (wasDaily && next.kind !== 'race' && previous.finished === null) return didNotFinishRecord(previous.day);
  return null;
}
