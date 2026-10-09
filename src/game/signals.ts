import { blockSeed, createRandom } from '../math/random.ts';
import type { City } from './city.ts';
import { TICKS_PER_SECOND } from './clock.ts';

export type Light = 'green' | 'yellow' | 'red';
export type WalkLight = 'walker' | 'hand' | 'off'; // what a crosswalk light shows right now

// What the traffic on each road of a junction sees: the column road runs north-south, the row road east-west.
// `columnWalk` is for people walking alongside the column road (across the row road), `rowWalk` the other way.
export interface SignalState {
  column: Light;
  row: Light;
  columnWalk: WalkLight;
  rowWalk: WalkLight;
}

// Walking person, then a flashing hand (don't start crossing) for the end of the green, then a steady hand.
type Walk = 'walk' | 'flashing' | 'hand';

interface Phase {
  column: Light;
  row: Light;
  columnWalk: Walk;
  rowWalk: Walk;
}

const GREEN_SECONDS = 20;
const FLASHING_SECONDS = 8; // the last part of the green, while the hand flashes
const YELLOW_SECONDS = 3;
const ALL_RED_SECONDS = 1; // both roads red, so the junction clears before the other road gets green
const FLASH_SECONDS = 0.5; // the flashing hand is on this long, then off this long
const WAVE_SPEED = 50 / 3.6; // metres per second: driving this fast along an avenue meets every light at green
const SIGNAL_SEED_INDEX = 1_000_000; // far past the block and wall piece indices, so it has its own sequence

const ticks = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);
const FLASH_TICKS = ticks(FLASH_SECONDS);

// One full cycle, in order. Each phase lasts its number of ticks.
const PHASES: [number, Phase][] = [
  [ticks(GREEN_SECONDS - FLASHING_SECONDS), { column: 'green', row: 'red', columnWalk: 'walk', rowWalk: 'hand' }],
  [ticks(FLASHING_SECONDS), { column: 'green', row: 'red', columnWalk: 'flashing', rowWalk: 'hand' }],
  [ticks(YELLOW_SECONDS), { column: 'yellow', row: 'red', columnWalk: 'hand', rowWalk: 'hand' }],
  [ticks(ALL_RED_SECONDS), { column: 'red', row: 'red', columnWalk: 'hand', rowWalk: 'hand' }],
  [ticks(GREEN_SECONDS - FLASHING_SECONDS), { column: 'red', row: 'green', columnWalk: 'hand', rowWalk: 'walk' }],
  [ticks(FLASHING_SECONDS), { column: 'red', row: 'green', columnWalk: 'hand', rowWalk: 'flashing' }],
  [ticks(YELLOW_SECONDS), { column: 'red', row: 'yellow', columnWalk: 'hand', rowWalk: 'hand' }],
  [ticks(ALL_RED_SECONDS), { column: 'red', row: 'red', columnWalk: 'hand', rowWalk: 'hand' }],
];
export const CYCLE_TICKS = PHASES.reduce((total, [duration]) => total + duration, 0);

// `time` is the ticks since the phase began, so every flash starts with the hand on.
function walkLight(walk: Walk, time: number): WalkLight {
  if (walk === 'walk') return 'walker';
  if (walk === 'hand') return 'hand';
  return Math.floor(time / FLASH_TICKS) % 2 === 0 ? 'hand' : 'off';
}

// The signals at a junction on a given tick. `offset` (in ticks) shifts this junction's cycle so junctions
// don't all switch at once. Integers only, so every machine gets the same answer.
export function signalPhase(tick: number, offset: number): SignalState {
  // The double modulo keeps the result positive for negative offsets too.
  let time = (((tick + offset) % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS;
  for (const [duration, { column, row, columnWalk, rowWalk }] of PHASES) {
    if (time < duration) {
      return { column, row, columnWalk: walkLight(columnWalk, time), rowWalk: walkLight(rowWalk, time) };
    }
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
