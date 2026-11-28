// The game's own modules, imported from src/ (the CLI bundles files outside supabase/functions/). The DOM lib in
// deno.json is only for type checking: src/game/carInput.ts imports the keyboard reader, which never runs here.

export { DAILY_EPOCH, dayNumber, MS_PER_DAY } from '../../../src/game/daily.ts';
export { decodeLogText, MAX_LOG_TEXT } from '../../../src/game/inputLog.ts';
export { replayDaily } from '../../../src/game/replay.ts';
export { SIMULATION_VERSION } from '../../../src/game/version.ts';
export { validNickname } from '../../../src/app/nickname.ts';
