import { DEFAULT_CAR_SETTINGS } from '../../../src/game/car.ts';
import { dailyCitySettings, dailyRace } from '../../../src/game/daily.ts';
import { driveRace } from '../../../src/game/driver.ts';
import { encodeLogText, InputRecorder, type InputLog } from '../../../src/game/inputLog.ts';
import { COUNTDOWN_TICKS } from '../../../src/game/race.ts';
import { DEFAULT_ROUTE_OPTIONS } from '../../../src/game/route.ts';
import { createRaceWorld } from '../../../src/game/world.ts';

export { encodeLogText, inputCode, MAX_RUN_TICKS } from '../../../src/game/inputLog.ts';
export { replayDaily } from '../../../src/game/replay.ts';
export { dayNumber, DAILY_EPOCH, MS_PER_DAY } from '../../../src/game/daily.ts';
export { SIMULATION_VERSION } from '../../../src/game/version.ts';

const TICK_LIMIT = 20000;

export interface DrivenLog {
  log: InputLog;
  text: string;
  ticks: number;
}

// The day's daily driven by the test driver tapping keys, logged from go as the game records it.
export function drivenDailyLog(day: number): DrivenLog {
  const { seed } = dailyRace(day);
  const world = createRaceWorld(dailyCitySettings(seed), { ...DEFAULT_CAR_SETTINGS }, seed, DEFAULT_ROUTE_OPTIONS, false);
  const result = driveRace(world, TICK_LIMIT, true);
  if (!result.finished) throw new Error(`the test driver did not finish day ${day}`);
  const recorder = new InputRecorder();
  for (const input of result.inputs.slice(COUNTDOWN_TICKS)) recorder.record(input);
  const log = recorder.log();
  return { log, text: encodeLogText(log), ticks: result.raceTicks };
}
