import { describe, expect, it } from 'vitest';
import { ownBucket, type DailyResults } from '../app/dailyResults.ts';
import { sampleBoard } from '../dev/sampleBoard.ts';
import { dailyResultsLayout, drawDailyResultsScreen, FIRST_TEXT, percentText, rankText, type DailyResultsScreen } from './dailyScreens.ts';
import { menuEntryAt } from './menuScreen.ts';
import {
  BAR_STEPS,
  BAR_TOPS,
  barUnits,
  bucketsPerBar,
  FULL_BAR,
  histogramPanel,
  MARKER,
  NO_RUNS_TEXT,
  NO_TIMES_TEXT,
  SMOOTH_BELOW,
  topPanel,
  YOU_COLOR,
  type Panel,
} from './resultsBoard.ts';
import { TextGrid, type TextStyle } from './textGrid.ts';

const DAY = 329;
const HOUR = 3_600_000;

function rowText(panel: Panel, y: number): string {
  return panel.rows[y].map(({ text }) => text).join('');
}

// The colour of the cell at column x of a panel row.
function colorAt(panel: Panel, y: number, x: number): number {
  let at = 0;
  for (const { text, color } of panel.rows[y]) {
    if (x < at + text.length) return color;
    at += text.length;
  }
  throw new Error('outside the row');
}

// A board of hand-made times; `own` is the index of the caller's in `times` (sorted as given, fastest first).
function board(times: number[], own: number | null, names: string[] = []): DailyResults {
  const from = times[0];
  const to = Math.max(times[Math.ceil((95 * times.length) / 100) - 1], from + 48);
  const counts = new Array<number>(48).fill(0);
  for (const t of times) counts[Math.min(47, Math.floor(((t - from) * 48) / (to - from)))]++;
  const rank = (t: number) => 1 + times.filter((other) => other < t).length;
  return {
    count: times.length,
    own: own === null ? null : { ticks: times[own], rank: rank(times[own]), slower: times.filter((t) => t > times[own]).length },
    top: times.slice(0, 10).map((t, i) => ({ rank: rank(t), nickname: names[i] ?? `player ${i}`, ticks: t, own: i === own })),
    histogram: { from, to, counts },
  };
}

// Records every cell written, to check none is written twice in one call.
class CountingGrid extends TextGrid {
  writes = new Map<number, number>();
  override write(column: number, row: number, text: string, style: TextStyle = {}): void {
    const x = style.align === 'right' ? column - text.length + 1 : style.align === 'center' ? column - Math.floor((text.length - 1) / 2) : column;
    for (let i = 0; i < text.length; i++) this.count(x + i, row);
    super.write(column, row, text, style);
  }
  override put(column: number, row: number, char: string, color?: number, background?: boolean): void {
    this.count(column, row);
    super.put(column, row, char, color, background);
  }
  private count(x: number, y: number) {
    const key = y * 100_000 + x;
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1);
  }
}

function text(grid: TextGrid): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = '';
    for (let x = 0; x < grid.columns; x++) line += String.fromCharCode(grid.get(x, y)?.code || 32);
    lines.push(line);
  }
  return lines.join('\n');
}

const BOARD = sampleBoard(DAY, 300, 4900, 'anon');
const screen = (overrides: Partial<DailyResultsScreen> = {}): DailyResultsScreen => ({
  day: DAY,
  ticks: 4900,
  untilNext: 5 * HOUR,
  leaderboard: 'stored',
  board: BOARD,
  nickname: 'anon',
  ...overrides,
});
const DNF = screen({ ticks: null, leaderboard: 'unavailable', board: sampleBoard(DAY, 300, null, 'anon') });
const SCREENS = [
  screen(),
  DNF,
  screen({ board: sampleBoard(DAY, 300, 3420, 'anon') }),
  screen({ board: sampleBoard(DAY, 1, 4900, 'anon') }),
  screen({ board: sampleBoard(DAY, 3, 4900, 'anon') }),
  screen({ ticks: null, leaderboard: 'unavailable', board: sampleBoard(DAY, 0, null, 'anon') }),
  screen({ untilNext: 0, board: sampleBoard(DAY, 5000, 35_999, 'twelve chars') }),
  screen({ leaderboard: 'sending', board: sampleBoard(DAY, 300, null, 'anon') }),
];

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function overlap(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe('histogram bars', () => {
  it('scales the tallest bucket to the full height and never hides a bucket with runs', () => {
    expect(barUnits([0, 1, 2, 4], 4)).toEqual([0, BAR_STEPS, 2 * BAR_STEPS, 4 * BAR_STEPS]);
    expect(barUnits([1, 1000], 2)).toEqual([1, 2 * BAR_STEPS]);
    expect(barUnits([3, 0, 1], 5)).toEqual([5 * BAR_STEPS, 0, Math.round((5 * BAR_STEPS) / 3)]);
    expect(barUnits([0, 0], 4)).toEqual([0, 0]);
  });

  it('sums neighbours in pairs on days with few runs, and in the smallest style', () => {
    expect(bucketsPerBar(SMOOTH_BELOW - 1, 3)).toBe(2);
    expect(bucketsPerBar(SMOOTH_BELOW, 3)).toBe(1);
    expect(bucketsPerBar(SMOOTH_BELOW, 0.5)).toBe(2);
  });

  it("draws known counts and marks the player's bucket in colour and with a marker under it", () => {
    // 1200 runs: one bar per bucket. Bucket 0 holds 400 (the tallest), the player's (bucket 24) 200.
    const times = [...new Array<number>(400).fill(1000), ...new Array<number>(200).fill(1024), ...new Array<number>(600).fill(1048)];
    const results = board(times, 400);
    expect(results.histogram!.counts.slice(0, 2)).toEqual([400, 0]);
    expect(ownBucket(results)).toBe(24);
    const panel = histogramPanel(results, { bucketColumns: 1, barRows: 4, compact: true });
    const barRow = (fromBottom: number) => 1 + 3 - fromBottom; // the frame, then the bars from the top
    const column = (bucket: number) => 1 + 1 + bucket; // frame, padding
    expect(rowText(panel, barRow(3))[column(47)]).toBe(FULL_BAR); // the last bucket: 600, tallest
    expect(rowText(panel, barRow(0))[column(0)]).toBe(FULL_BAR);
    // 400 of 600: 8 of 12 steps, two full rows and two thirds of the third; 200 of 600: one row and a third.
    expect(rowText(panel, barRow(1))[column(0)]).toBe(FULL_BAR);
    expect(rowText(panel, barRow(2))[column(0)]).toBe(BAR_TOPS[1]);
    expect(rowText(panel, barRow(3))[column(0)]).toBe(' ');
    expect(rowText(panel, barRow(0))[column(24)]).toBe(FULL_BAR);
    expect(rowText(panel, barRow(1))[column(24)]).toBe(BAR_TOPS[0]);
    expect(rowText(panel, barRow(2))[column(24)]).toBe(' ');
    expect(rowText(panel, barRow(0))[column(1)]).toBe(' ');
    expect(colorAt(panel, barRow(0), column(24))).toBe(YOU_COLOR);
    expect(colorAt(panel, barRow(0), column(23))).not.toBe(YOU_COLOR);
    const marker = rowText(panel, barRow(0) + 2);
    expect(marker.indexOf('^')).toBe(column(24));
    expect(marker).toContain(MARKER);
    const labels = rowText(panel, barRow(0) + 3);
    expect(labels).toContain('0:16.6'); // from: 1000 ticks
    expect(labels).toMatch(/0:17\.4\+ *\|$/); // to: 1048 ticks, and slower
    for (let y = 0; y < panel.rows.length; y++) expect(rowText(panel, y)).toHaveLength(panel.width);
  });

  it('puts the marker to the left of the bar at the right end, and none without an own run', () => {
    const times = Array.from({ length: 1200 }, (_, i) => 1000 + Math.floor(i / 25));
    const last = histogramPanel(board(times, 1199), { bucketColumns: 2, barRows: 4, compact: false });
    const markerRow = last.rows.map((_, y) => rowText(last, y)).find((row) => row.includes('^'))!;
    expect(markerRow).toContain('you ^');
    const none = histogramPanel(board(times, null), { bucketColumns: 2, barRows: 4, compact: false });
    expect(none.rows.some((_, y) => rowText(none, y).includes('^'))).toBe(false);
    for (let y = 0; y < none.rows.length; y++) {
      const row = rowText(none, y);
      for (let x = 0; x < row.length; x++) if (row[x] !== ' ') expect(colorAt(none, y, x)).not.toBe(YOU_COLOR);
    }
  });

  it('says there are no runs on an empty day', () => {
    const empty: DailyResults = { count: 0, own: null, top: [], histogram: null };
    const panel = histogramPanel(empty, { bucketColumns: 1, barRows: 4, compact: false });
    expect(panel.rows.some((_, y) => rowText(panel, y).includes(NO_RUNS_TEXT))).toBe(true);
    const top = topPanel(empty, 'anon', { topRows: 10, compact: false });
    expect(top.rows.some((_, y) => rowText(top, y).includes(NO_TIMES_TEXT))).toBe(true);
  });
});

describe('top times', () => {
  it('shares ranks between ties and highlights the own row', () => {
    const results = board([3000, 3000, 3100, 3200], 2, ['alpha', 'bravo', 'charlie', 'delta']);
    const panel = topPanel(results, 'charlie', { topRows: 10, compact: false });
    const rows = panel.rows.map((_, y) => rowText(panel, y));
    expect(rows.find((row) => row.includes('alpha'))).toMatch(/\b1 {2}alpha/);
    expect(rows.find((row) => row.includes('bravo'))).toMatch(/\b1 {2}bravo/);
    const own = rows.findIndex((row) => row.includes('charlie'));
    expect(rows[own]).toMatch(/\b3 {2}charlie +0:51\.666/);
    expect(colorAt(panel, own, 4)).toBe(YOU_COLOR);
    expect(rows.some((row) => row.includes('...'))).toBe(false);
  });

  it("adds the player's own row after a gap when it is not among the top times, with the settings' nickname", () => {
    const times = Array.from({ length: 40 }, (_, i) => 3000 + 10 * i);
    const results = board(times, 33);
    const panel = topPanel(results, 'my name', { topRows: 10, compact: false });
    const rows = panel.rows.map((_, y) => rowText(panel, y));
    const own = rows.findIndex((row) => row.includes('my name'));
    expect(rows[own]).toMatch(/\b34 {2}my name/);
    expect(rows[own - 1]).toContain('...');
    expect(colorAt(panel, own, 3)).toBe(YOU_COLOR);
    // Fewer rows shown: the own row of rank 4 comes after the gap too.
    const short = topPanel(board(times, 3), 'me', { topRows: 3, compact: true });
    expect(short.rows.map((_, y) => rowText(short, y)).filter((row) => /\bme\b/.test(row)).length).toBe(1);
    expect(short.rows.some((_, y) => rowText(short, y).includes('...'))).toBe(true);
  });

  it('fits the longest nickname and the longest time in their columns', () => {
    const results = board([35_998, 35_999], 1, ['abcdefghijkl', 'twelve chars']);
    const panel = topPanel(results, 'twelve chars', { topRows: 10, compact: true });
    const rows = panel.rows.map((_, y) => rowText(panel, y));
    expect(rows.some((row) => row.includes('abcdefghijkl  9:59.966'))).toBe(true);
    expect(rows.some((row) => row.includes('twelve chars  9:59.983'))).toBe(true);
    for (const row of rows) expect(row).toHaveLength(panel.width);
  });
});

describe('standing', () => {
  it('gives the rank and the percentile, something fitting when alone, nothing without an own run', () => {
    const results = board([3000, 3100, 3100, 3200, 3300], 1);
    expect(rankText(results)).toBe('#2 of 5');
    expect(percentText(results)).toBe('faster than 50% of players');
    const alone = board([3000], 0);
    expect(rankText(alone)).toBe('#1 of 1');
    expect(percentText(alone)).toBe(FIRST_TEXT);
    expect(rankText(board([3000, 3100], null))).toBeNull();
    expect(percentText(board([3000, 3100], null))).toBeNull();
  });
});

describe('daily results board screen', () => {
  it('shows the time, the rank, the curve with the marker and the top times at 1280 × 720', () => {
    const grid = new TextGrid(213, 65);
    drawDailyResultsScreen(grid, screen());
    const all = text(grid);
    const layout = dailyResultsLayout(213, 65, screen())!;
    expect(layout.style).not.toBeNull();
    expect(layout.style!.panels).toBe('side');
    expect(layout.title.length).toBe(12);
    expect(all).toContain(`#${BOARD.own!.rank} of 300   faster than`);
    expect(all).toContain(MARKER);
    expect(all).toContain('300 players');
    expect(all).toContain('top times');
    expect(all).toContain(BOARD.top[0].nickname);
    expect(all).toMatch(/> share\s+</);
    expect(all).toMatch(/ menu /);
  });

  it('shows the board without a marker, rank or percentile when the try did not finish', () => {
    const grid = new TextGrid(213, 65);
    drawDailyResultsScreen(grid, DNF);
    const all = text(grid);
    expect(all).not.toContain(MARKER);
    expect(all).not.toContain('faster than');
    expect(all).not.toContain('run not recorded');
    expect(all).toContain('300 players');
  });

  it('says what became of a finished run that is not on the board yet', () => {
    const grid = new TextGrid(213, 65);
    drawDailyResultsScreen(grid, screen({ leaderboard: 'sending', board: sampleBoard(DAY, 300, null, 'anon') }));
    expect(text(grid)).toContain('sending run...');
    expect(text(grid)).not.toContain(MARKER);
  });

  it('says so on an empty day and when the player is the only one', () => {
    const empty = new TextGrid(213, 65);
    drawDailyResultsScreen(empty, SCREENS[5]);
    expect(text(empty)).toContain(NO_RUNS_TEXT);
    const alone = new TextGrid(213, 65);
    drawDailyResultsScreen(alone, SCREENS[3]);
    expect(text(alone)).toContain(`#1 of 1   ${FIRST_TEXT}`);
  });

  it('falls back to the plain screen without a board', () => {
    const plain = new TextGrid(213, 65);
    drawDailyResultsScreen(plain, screen({ board: null }));
    expect(text(plain)).toContain('run recorded');
    expect(dailyResultsLayout(213, 65, screen({ board: null }))!.style).toBeNull();
  });

  it('fits inside the grid without overlapping, writes every cell once, and the same state leaves the grid clean', () => {
    const sizes: [number, number][] = [];
    for (let columns = 20; columns <= 280; columns += 13) for (let rows = 8; rows <= 90; rows += 7) sizes.push([columns, rows]);
    sizes.push([213, 65], [266, 81], [100, 32], [40, 14], [22, 12], [64, 22], [80, 25]);
    const styles = new Set<string>();
    for (const [columns, rows] of sizes) {
      for (const shown of SCREENS) {
        const layout = dailyResultsLayout(columns, rows, shown);
        const grid = new CountingGrid(columns, rows);
        drawDailyResultsScreen(grid, shown);
        if (!layout) {
          expect(grid.writes.size).toBe(0);
          continue;
        }
        styles.add(JSON.stringify(layout.style));
        for (const count of grid.writes.values()) expect(count, `${columns} × ${rows}`).toBe(1);
        for (const key of grid.writes.keys()) {
          const [x, y] = [key % 100_000, Math.floor(key / 100_000)];
          expect(x >= 0 && x < columns && y >= 0 && y < rows, `${columns} × ${rows} cell ${x}, ${y}`).toBe(true);
        }
        const rects: Rect[] = [
          { left: layout.titleLeft, top: layout.titleTop, width: layout.title[0].length, height: layout.title.length },
          { left: layout.listLeft, top: layout.listTop, width: layout.listWidth, height: layout.listHeight },
          ...layout.panels.map(({ left, top, panel }) => ({ left, top, width: panel.width, height: panel.rows.length })),
        ];
        if (layout.linesHeight > 0) rects.push({ left: layout.linesLeft, top: layout.linesTop, width: layout.linesWidth, height: layout.linesHeight });
        for (const [i, a] of rects.entries()) {
          expect(a.left >= 1 && a.top >= 1 && a.left + a.width <= columns - 1 && a.top + a.height <= rows - 1, `${columns} × ${rows}`).toBe(true);
          for (const b of rects.slice(i + 1)) expect(overlap(a, b), `${columns} × ${rows}`).toBe(false);
        }
        expect(menuEntryAt(layout, layout.listLeft + 2, layout.entryRows[0])).toBe(0);
        grid.dirty = false;
        drawDailyResultsScreen(grid, shown);
        expect(grid.dirty).toBe(false);
      }
    }
    expect(styles.size).toBeGreaterThan(8);
  });

  it('rewrites only its own rows when the countdown runs out or the status changes', () => {
    for (const [columns, rows] of [[213, 65], [100, 32], [64, 22], [40, 14]] as const) {
      for (const shown of [screen(), DNF, screen({ leaderboard: 'sending', board: sampleBoard(DAY, 300, null, 'anon') })]) {
        const grid = new TextGrid(columns, rows);
        drawDailyResultsScreen(grid, shown);
        const before = text(grid).split('\n');
        const fresh = new TextGrid(columns, rows);
        const ready = { ...shown, untilNext: 0, leaderboard: shown.leaderboard === 'sending' ? ('updateNeeded' as const) : shown.leaderboard };
        drawDailyResultsScreen(grid, ready);
        drawDailyResultsScreen(fresh, ready);
        expect(text(grid), `${columns} × ${rows}`).toBe(text(fresh)); // nothing of the old state is left over
        const changed = text(grid).split('\n').filter((row, i) => row !== before[i]).length;
        expect(changed).toBeLessThanOrEqual(3); // the countdown, the entry, and the status line
      }
    }
  });

  it('draws something sensible at 640 × 400 with glyph size 16', () => {
    const grid = new TextGrid(40, 14);
    drawDailyResultsScreen(grid, screen());
    const all = text(grid);
    expect(all).toContain(`#${BOARD.own!.rank} of 300`);
    expect(all).toContain('faster than');
    expect(all).toMatch(/> share\s+</);
    expect(all).toMatch(/ menu /);
  });

  it('holds share and menu in the list, and a try that did not finish lays out the same around its one entry', () => {
    for (const [columns, rows] of [[213, 65], [100, 32], [64, 22], [40, 14]] as const) {
      const layout = dailyResultsLayout(columns, rows, screen())!;
      expect(layout.entryRows).toHaveLength(2);
      expect(layout.listTop + layout.listHeight).toBeLessThanOrEqual(rows - 1);
      const dnf = dailyResultsLayout(columns, rows, DNF)!;
      expect(dnf.entryRows).toHaveLength(1);
    }
  });
});
