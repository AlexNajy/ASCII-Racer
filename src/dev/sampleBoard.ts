import { CAP_PERCENTILE, RESULT_BUCKETS, TOP_ROWS, type DailyResults } from '../app/dailyResults.ts';
import { TICKS_PER_SECOND } from '../game/clock.ts';
import { MAX_RUN_TICKS } from '../game/inputLog.ts';
import { blockSeed, createRandom } from '../math/random.ts';

// A made-up day of results for pictures without a backend (URL parameter board=N): N finished runs, the player's
// among them when given, answered as daily_results would answer it. Seeded by the day, so every load is the same.

const SAMPLE_SEED_INDEX = 0x5a3b1e;
const MEAN_SECONDS = 82; // the test driver takes medium routes in 70–94 s
const SPREAD_SECONDS = 7;
const TAIL_SHARE = 0.12; // runs with a crash or a wrong turn in them
const TAIL_SECONDS = 70; // at most this much slower again
const SYLLABLES = ['ka', 'zo', 'mi', 'ro', 'ta', 'vex', 'nu', 'lo', 'dri', 'ft', 'ne', 'on', 'ax', 'el', 'sy', 'qu', 'ri', 'ba'];
const WORDS = ['night', 'racer', 'neon', 'drift', 'turbo', 'ghost', 'apex', 'byte', 'comet', 'pixel', 'storm', 'glyph'];

function nickname(random: () => number): string {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const kind = random();
  let name: string;
  if (kind < 0.35) name = pick(WORDS) + pick(WORDS);
  else if (kind < 0.6) name = `${pick(WORDS)} ${pick(SYLLABLES)}${pick(SYLLABLES)}`;
  else if (kind < 0.85) name = pick(SYLLABLES) + pick(SYLLABLES) + pick(SYLLABLES) + String(Math.floor(random() * 100));
  else name = pick(SYLLABLES).toUpperCase() + pick(WORDS);
  name = name.slice(0, 12).trim();
  return name.length >= 3 ? name : `${name}xyz`;
}

function sampleTicks(random: () => number): number {
  let normal = 0;
  for (let i = 0; i < 4; i++) normal += random();
  normal = (normal - 2) * Math.sqrt(3); // mean 0, spread 1
  let seconds = MEAN_SECONDS + normal * SPREAD_SECONDS;
  if (random() < TAIL_SHARE) seconds += random() * random() * TAIL_SECONDS;
  return Math.min(MAX_RUN_TICKS, Math.max(1, Math.round(seconds * TICKS_PER_SECOND)));
}

export function sampleBoard(day: number, players: number, ownTicks: number | null, ownNickname: string): DailyResults {
  if (ownTicks !== null && players < 1) throw new Error('a sample board with the player on it needs at least one player');
  const random = createRandom(blockSeed(day, SAMPLE_SEED_INDEX));
  // In finishing order; the player finished last, so a tie puts the others first.
  const runs: { ticks: number; nickname: string; own: boolean }[] = [];
  for (let i = 0; i < players - (ownTicks === null ? 0 : 1); i++) runs.push({ ticks: sampleTicks(random), nickname: nickname(random), own: false });
  if (ownTicks !== null) runs.push({ ticks: ownTicks, nickname: ownNickname, own: true });
  const count = runs.length;
  if (count === 0) return { count, own: null, top: [], histogram: null };
  const sorted = runs.map((run, order) => ({ ...run, order })).sort((a, b) => a.ticks - b.ticks || a.order - b.order);
  const rankOf = (ticks: number) => 1 + runs.filter((run) => run.ticks < ticks).length;
  const from = sorted[0].ticks;
  const to = Math.max(sorted[Math.ceil((CAP_PERCENTILE * count) / 100) - 1].ticks, from + RESULT_BUCKETS);
  const counts = new Array<number>(RESULT_BUCKETS).fill(0);
  for (const { ticks } of runs) counts[Math.min(RESULT_BUCKETS - 1, Math.floor(((ticks - from) * RESULT_BUCKETS) / (to - from)))]++;
  return {
    count,
    own: ownTicks === null ? null : { ticks: ownTicks, rank: rankOf(ownTicks), slower: runs.filter((run) => run.ticks > ownTicks).length },
    top: sorted.slice(0, TOP_ROWS).map(({ ticks, nickname: name, own }) => ({ rank: rankOf(ticks), nickname: name, ticks, own })),
    histogram: { from, to, counts },
  };
}
