import { describe, expect, it } from 'vitest';
import { sampleBoard } from '../dev/sampleBoard.ts';
import { timerText } from '../hud/raceHud.ts';
import { ownBucket, RESULT_BUCKETS, type DailyResults } from './dailyResults.ts';
import { GAME_NAME, GAME_URL } from './gameName.ts';
import { BAR_RAMP, BASELINE, histogramLine, SHARE_LABEL_WIDTH, SHARE_MERGE, SHARE_LABELS, SHARE_SHOWN_MS, shareLabel, shareText } from './share.ts';

const DAY = 329;
const TICKS = 5080;
const MAX_LINE = 40;

function lines(text: string): string[] {
  return text.split('\n').slice(0, -1);
}

function board(players: number, ticks = TICKS): DailyResults {
  return sampleBoard(DAY, players, ticks, 'anon');
}

function counts(filled: Record<number, number>): number[] {
  return Array.from({ length: RESULT_BUCKETS }, (_, i) => filled[i] ?? 0);
}

describe('share text', () => {
  it('has the name and day, the time, the percentile, the histogram and the link', () => {
    const results = board(300);
    const text = shareText({ day: DAY, ticks: TICKS, results });
    const rows = lines(text);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe(`${GAME_NAME} #${DAY}`);
    expect(rows[1]).toBe(timerText(TICKS));
    expect(rows[2]).toMatch(/^faster than \d+% of players$/);
    expect(rows[3]).toBe(histogramLine(results));
    expect(rows[4]).toBe(GAME_URL);
    expect(text.endsWith(`${GAME_URL}\n`)).toBe(true);
  });

  it('draws a hand-made day exactly, the player marked', () => {
    const results: DailyResults = {
      count: 6,
      own: { ticks: 4500, rank: 4, slower: 2 },
      top: [],
      histogram: { from: 4000, to: 6000, counts: counts({ 0: 3, 1: 1, 12: 1, 24: 1, 47: 1 }) },
    };
    // Pairs of buckets 0-1 (4 runs), 12-13 (the player's) 24-25 and 46-47, scaled to 4 runs = the top of the ramp
    expect(histogramLine(results)).toBe('#' + '.'.repeat(5) + '[-]' + '.'.repeat(5) + '-' + '.'.repeat(10) + '-');
  });

  it('marks the bar of the player run, whatever the day', () => {
    for (const players of [1, 2, 3, 40, 300, 999, 1000, 2500]) {
      for (const ticks of [3000, TICKS, 7000, 40000]) {
        const results = board(players, ticks);
        const line = histogramLine(results)!;
        const merge = SHARE_MERGE;
        expect(line.match(/\[/g)).toHaveLength(1);
        const marked = line.indexOf('[');
        expect(line.replace(/[[\]]/g, '')).toHaveLength(RESULT_BUCKETS / merge);
        expect(line[marked + 2]).toBe(']');
        expect(line.slice(0, marked).length).toBe(Math.floor(ownBucket(results)! / merge));
      }
    }
  });

  it('never leaves a bucket with runs empty and scales the tallest to the top of the ramp', () => {
    const results = board(300);
    const merge = SHARE_MERGE;
    const line = histogramLine(results)!.replace(/[[\]]/g, '');
    const summed = Array.from({ length: RESULT_BUCKETS / merge }, (_, i) =>
      results.histogram!.counts.slice(i * merge, (i + 1) * merge).reduce((a, b) => a + b, 0),
    );
    summed.forEach((n, i) => (n === 0 ? expect(line[i]).toBe(BASELINE) : expect(BAR_RAMP).toContain(line[i])));
    expect(line[summed.indexOf(Math.max(...summed))]).toBe(BAR_RAMP[BAR_RAMP.length - 1]);
  });

  it('uses no character a chat app reads as formatting', () => {
    expect(BAR_RAMP).not.toContain(BASELINE);
    for (const players of [1, 2, 3, 40, 300, 2500]) {
      for (const ticks of [3000, TICKS, 7000]) {
        expect(shareText({ day: DAY, ticks, results: board(players, ticks) })).not.toMatch(/[*_~`]/);
      }
    }
  });

  it('has 24 bars on any day', () => {
    for (const players of [1, 999, 1000, 3000]) expect(histogramLine(board(players))!.length).toBe(RESULT_BUCKETS / SHARE_MERGE + 2);
  });

  it('works for the fastest run, the slowest, a run in the last bucket and a tiny day', () => {
    for (const [players, ticks] of [[300, 3000], [300, 40000], [300, 9000], [2, TICKS], [3, TICKS]] as const) {
      const text = shareText({ day: DAY, ticks, results: board(players, ticks) });
      expect(lines(text)).toHaveLength(5);
      expect(text).toContain('[');
    }
    const fastest = histogramLine(board(300, 3000))!;
    expect(fastest.startsWith('[')).toBe(true);
    const slowest = board(300, 40000);
    expect(ownBucket(slowest)).toBe(RESULT_BUCKETS - 1);
    expect(histogramLine(slowest)!.endsWith(']')).toBe(true);
    expect(lines(shareText({ day: DAY, ticks: 40000, results: slowest }))[2]).toBe('faster than 0% of players');
    expect(lines(shareText({ day: DAY, ticks: 3000, results: board(300, 3000) }))[2]).toBe('faster than 100% of players');
  });

  it('has no percentile when the player is alone, and still draws the day', () => {
    const results = board(1);
    const rows = lines(shareText({ day: DAY, ticks: TICKS, results }));
    expect(rows).toHaveLength(4);
    expect(rows.join('\n')).not.toContain('faster');
    expect(rows[2]).toContain('[');
  });

  it('has only the name, day, time and link without a board or without the own run', () => {
    expect(shareText({ day: DAY, ticks: TICKS, results: null })).toBe(`${GAME_NAME} #${DAY}\n${timerText(TICKS)}\n${GAME_URL}\n`);
    const others = sampleBoard(DAY, 300, null, 'anon');
    expect(shareText({ day: DAY, ticks: TICKS, results: others })).toBe(`${GAME_NAME} #${DAY}\n${timerText(TICKS)}\n${GAME_URL}\n`);
    expect(shareText({ day: DAY, ticks: TICKS, results: sampleBoard(DAY, 0, null, 'anon') })).not.toContain('[');
  });

  it('is plain ASCII with short lines, no trailing spaces and the link last', () => {
    for (const results of [null, board(1), board(3), board(300), board(2500)]) {
      const text = shareText({ day: DAY, ticks: TICKS, results });
      expect(text).toMatch(/^[\x20-\x7e\n]+$/);
      expect(text.endsWith('\n')).toBe(true);
      for (const row of lines(text)) {
        expect(row.length).toBeLessThanOrEqual(MAX_LINE);
        expect(row).toBe(row.trimEnd());
        expect(row).not.toBe('');
      }
      expect(lines(text).at(-1)).toBe(GAME_URL);
    }
  });

  it('says nothing about the route, the city or the seed', () => {
    const text = shareText({ day: DAY, ticks: TICKS, results: board(300) }).toLowerCase();
    for (const word of ['route', 'seed', 'city', 'gate', 'metre']) expect(text).not.toContain(word);
  });
});

describe('share label', () => {
  it('is share, then the outcome for SHARE_SHOWN_MS, then share again', () => {
    expect(shareLabel(null, 5000)).toBe('share');
    for (const outcome of ['copied', 'failed'] as const) {
      const feedback = { outcome, at: 1000 };
      expect(shareLabel(feedback, 1000)).toBe(SHARE_LABELS[outcome]);
      expect(shareLabel(feedback, 1000 + SHARE_SHOWN_MS - 1)).toBe(SHARE_LABELS[outcome]);
      expect(shareLabel(feedback, 1000 + SHARE_SHOWN_MS)).toBe('share');
    }
    expect(shareLabel({ outcome: 'copied', at: 1000 }, 999)).toBe('share');
  });

  it('has a width that fits every label', () => {
    for (const label of Object.values(SHARE_LABELS)) expect(label.length).toBeLessThanOrEqual(SHARE_LABEL_WIDTH);
    expect(SHARE_LABEL_WIDTH).toBe('copy failed'.length);
  });
});
