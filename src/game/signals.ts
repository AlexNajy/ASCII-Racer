import { blockSeed, createRandom } from '../math/random.ts';
import type { City } from './city.ts';
import { TICKS_PER_SECOND } from './clock.ts';

export type Light = 'green' | 'yellow' | 'red';

// What the traffic on each road of a junction sees: the column road runs north-south, the row road east-west.
// People may walk across a road while the road beside them, running the same way they walk, has green.
export interface SignalState {
  column: Light;
  row: Light;
}

const GREEN_SECONDS = 20;
const YELLOW_SECONDS = 3;
const ALL_RED_SECONDS = 1; // both roads red, so the junction clears before the other road gets green
const WAVE_SPEED = 50 / 3.6; // metres per second: driving this fast along an avenue meets every light at green
const SIGNAL_SEED_INDEX = 1_000_000; // far past the block and wall piece indices, so it has its own sequence

const ticks = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);

// One full cycle, in order. Each phase lasts its number of ticks.
const PHASES: [number, SignalState][] = [
  [ticks(GREEN_SECONDS), { column: 'green', row: 'red' }],
  [ticks(YELLOW_SECONDS), { column: 'yellow', row: 'red' }],
  [ticks(ALL_RED_SECONDS), { column: 'red', row: 'red' }],
  [ticks(GREEN_SECONDS), { column: 'red', row: 'green' }],
  [ticks(YELLOW_SECONDS), { column: 'red', row: 'yellow' }],
  [ticks(ALL_RED_SECONDS), { column: 'red', row: 'red' }],
];
export const CYCLE_TICKS = PHASES.reduce((total, [duration]) => total + duration, 0);

// The signals at a junction on a given tick. `offset` (in ticks) shifts this junction's cycle so junctions
// don't all switch at once. Integers only, so every machine gets the same answer.
export function signalPhase(tick: number, offset: number): SignalState {
  // The double modulo keeps the result positive for negative offsets too.
  let time = (((tick + offset) % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS;
  for (const [duration, state] of PHASES) {
    if (time < duration) return state;
    time -= duration;
  }
  throw new Error('unreachable: time is always inside the cycle');
}

interface Wave {
  start: number; // random shift for the whole avenue, in ticks
  direction: number; // the way the wave travels: -1 or 1 along x (row avenues) or z (column avenues)
}

// The offset that makes a car travelling with the wave reach this junction at the same point in the cycle as
// every other junction on the avenue. `along` is the junction's x (row avenue) or z (column avenue).
// Junctions further along the wave switch later by exactly the driving time between them.
function waveOffset({ start, direction }: Wave, along: number): number {
  return start - direction * Math.round((along / WAVE_SPEED) * TICKS_PER_SECOND);
}

// One offset per junction, in the same order as `city.junctions`. Avenues get a green wave in a random
// direction; where two avenues cross, the column avenue's wave wins. All other junctions get a random offset.
export function signalOffsets(city: City, seed: number): number[] {
  const random = createRandom(blockSeed(seed, SIGNAL_SEED_INDEX));
  const randomTicks = () => Math.floor(random() * CYCLE_TICKS);
  const waves = (avenues: ReadonlySet<number>) =>
    new Map(
      [...avenues]
        .sort((a, b) => a - b)
        .map((road): [number, Wave] => [road, { start: randomTicks(), direction: random() < 0.5 ? -1 : 1 }]),
    );
  const columnWaves = waves(city.avenues.columns);
  const rowWaves = waves(city.avenues.rows);
  return city.junctions.map((junction) => {
    const columnWave = columnWaves.get(junction.column);
    if (columnWave) return waveOffset(columnWave, junction.z);
    const rowWave = rowWaves.get(junction.row);
    if (rowWave) return waveOffset(rowWave, junction.x);
    return randomTicks();
  });
}
