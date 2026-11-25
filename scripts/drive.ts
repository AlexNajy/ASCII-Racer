// Drives the test driver through many routes headless and prints how it went, for tuning route lengths.
// Usage: npm run drive [-- first last] [--length short|medium|long] [--blocks N]
// City seed and route seed are the same (as the daily uses them), default settings otherwise.
import { DEFAULT_CAR_SETTINGS } from '../src/game/car.ts';
import { DEFAULT_CITY_SETTINGS } from '../src/game/city.ts';
import { TICKS_PER_SECOND } from '../src/game/clock.ts';
import { driveRace } from '../src/game/driver.ts';
import { ROUTE_LENGTHS, type RouteLengthName } from '../src/game/route.ts';
import { createRaceWorld } from '../src/game/world.ts';

const MAX_SECONDS = 600;
const SLOWEST_SHOWN = 5;

const args = process.argv.slice(2);
const numbers: number[] = [];
let lengthName: RouteLengthName = 'medium';
let blocksPerSide = DEFAULT_CITY_SETTINGS.blocksPerSide;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--length') lengthName = args[++i] as RouteLengthName;
  else if (args[i] === '--blocks') blocksPerSide = Number(args[++i]);
  else numbers.push(Number(args[i]));
}
const [first = 1, last = 500] = numbers;
const length = ROUTE_LENGTHS[lengthName];
if (!length || !Number.isInteger(first) || !Number.isInteger(last) || last < first) {
  console.error('Usage: npm run drive [-- first last] [--length short|medium|long] [--blocks N]');
  process.exit(1);
}

interface Run {
  seed: number;
  seconds: number;
  speed: number; // m/s along the route
  impacts: number;
  backOuts: number;
}

const runs: Run[] = [];
const failed: string[] = [];
const started = Date.now();
for (let seed = first; seed <= last; seed++) {
  try {
    const world = createRaceWorld({ ...DEFAULT_CITY_SETTINGS, seed, blocksPerSide }, { ...DEFAULT_CAR_SETTINGS }, seed, { length }, false);
    const route = world.race!.route;
    const result = driveRace(world, MAX_SECONDS * TICKS_PER_SECOND);
    if (!result.finished) {
      failed.push(`${seed} (${result.gates}/${route.gates.length} gates, car at ${world.car.x.toFixed(0)}, ${world.car.z.toFixed(0)})`);
      continue;
    }
    const seconds = result.raceTicks / TICKS_PER_SECOND;
    runs.push({ seed, seconds, speed: route.length / seconds, impacts: result.impacts, backOuts: result.backOuts });
  } catch (error) {
    failed.push(`${seed} (${(error as Error).message})`);
  }
}

const count = last - first + 1;
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
const seconds = runs.map((run) => run.seconds);
const slowest = [...runs].sort((a, b) => b.seconds - a.seconds).slice(0, SLOWEST_SHOWN);
console.log(`${lengthName} routes (${length} m), ${blocksPerSide}×${blocksPerSide} blocks, seeds ${first}–${last}`);
console.log(`finished ${runs.length}/${count} (${((100 * runs.length) / count).toFixed(1)}%)`);
console.log(`time min ${Math.min(...seconds).toFixed(1)} s, mean ${mean(seconds).toFixed(1)} s, max ${Math.max(...seconds).toFixed(1)} s`);
console.log(`average speed ${mean(runs.map((run) => run.speed)).toFixed(1)} m/s (${(mean(runs.map((run) => run.speed)) * 3.6).toFixed(0)} km/h)`);
console.log(`impacts per race ${mean(runs.map((run) => run.impacts)).toFixed(2)} (ticks touching something), back-outs per race ${mean(runs.map((run) => run.backOuts)).toFixed(2)}`);
console.log(`slowest: ${slowest.map((run) => `${run.seed} (${run.seconds.toFixed(1)} s)`).join(', ')}`);
console.log(`failed: ${failed.length > 0 ? failed.join(', ') : 'none'}`);
console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failed.length > 0 ? 1 : 0);
