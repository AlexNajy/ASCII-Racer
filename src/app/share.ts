import { GAME_NAME, GAME_URL } from './gameName.ts';
import { ownBucket, percentFaster, type DailyResults } from './dailyResults.ts';
import { shownBuckets } from '../hud/resultsBoard.ts';
import { timerText } from '../hud/raceHud.ts';

// The text the daily results' share entry copies, and the entry's label while and after copying. Plain ASCII, nothing
// about the route, the city or the seed.

// Bar characters by rising density; a bucket without runs is the baseline, one with runs is never that. None that
// chat apps read as formatting (* _ ~ `), which would vanish when the text is pasted.
export const BASELINE = '.';
export const BAR_RAMP = ':-=+#';
const MARK_LEFT = '[';
const MARK_RIGHT = ']';
export const SHARE_MERGE = 2; // buckets per bar: 24 bars, so the line stays short on any day

export interface ShareInput {
  day: number;
  ticks: number;
  results: DailyResults | null;
}

// One character per pair of buckets, scaled to the tallest, the player's bar in brackets.
export function histogramLine(results: DailyResults): string | null {
  const { histogram } = results;
  const own = ownBucket(results);
  if (!histogram || own === null) return null;
  const buckets = shownBuckets(histogram.counts, SHARE_MERGE);
  const tallest = Math.max(1, ...buckets);
  const marked = Math.floor(own / SHARE_MERGE);
  return buckets
    .map((n, i) => {
      const bar = n === 0 ? BASELINE : BAR_RAMP[Math.max(0, Math.ceil((n * BAR_RAMP.length) / tallest) - 1)];
      return i === marked ? `${MARK_LEFT}${bar}${MARK_RIGHT}` : bar;
    })
    .join('');
}

export function shareText({ day, ticks, results }: ShareInput): string {
  const lines = [`${GAME_NAME} #${day}`, timerText(ticks)];
  const percent = results ? percentFaster(results) : null;
  if (percent !== null) lines.push(`faster than ${percent}% of players`);
  const bars = results ? histogramLine(results) : null;
  if (bars) lines.push(bars);
  lines.push(GAME_URL);
  return lines.map((line) => `${line}\n`).join('');
}

export const SHARE_SHOWN_MS = 2000;
export type ShareOutcome = 'copied' | 'failed';
export interface ShareFeedback {
  outcome: ShareOutcome;
  at: number; // browser time of the copy, ms
}
export const SHARE_LABELS: Record<ShareOutcome | 'idle', string> = { idle: 'share', copied: 'copied', failed: 'copy failed' };
export const SHARE_LABEL_WIDTH = Math.max(...Object.values(SHARE_LABELS).map((label) => label.length));

// The entry's label: the outcome for SHARE_SHOWN_MS after the copy, then `share` again.
export function shareLabel(feedback: ShareFeedback | null, nowMs: number): string {
  const age = feedback ? nowMs - feedback.at : -1;
  return feedback && age >= 0 && age < SHARE_SHOWN_MS ? SHARE_LABELS[feedback.outcome] : SHARE_LABELS.idle;
}
