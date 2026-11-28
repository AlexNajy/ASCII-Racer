import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import {
  countdownText,
  dailyResultsLayout,
  drawDailyResultsScreen,
  drawPreRaceScreen,
  FLYOVER_HOLD_TICKS,
  FLYOVER_SPEED,
  flyoverPose,
  LEADERBOARD_STATUS,
  LEADERBOARD_TEXT,
  preRaceLayout,
  READY_TEXT,
  START_KEYS,
} from './dailyScreens.ts';
import { menuEntryAt } from './menuScreen.ts';
import { carGlyph, createMinimap, minimapCell } from './minimap.ts';
import { TextGrid } from './textGrid.ts';

const city = generateCity({ ...DEFAULT_CITY_SETTINGS });
const route = generateRoute(roadGraph(city), 1);
const DAY = 330;
// 1280 × 720 at the default 6 px cells, the shots' 1600 × 900, and 640 × 400 at glyph size 16.
const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];
const SMALL_GRID: [number, number] = [40, 21];
const HOUR = 3_600_000;

function text(grid: TextGrid): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = '';
    for (let x = 0; x < grid.columns; x++) line += String.fromCharCode(grid.get(x, y)?.code || 32);
    lines.push(line);
  }
  return lines.join('\n');
}

// Past the start, where the flyover's marker covers the S at tick 0.
const preRace = (grid: TextGrid, tick = 60) => drawPreRaceScreen(grid, { day: DAY, route, minimap: createMinimap(city), tick });

describe('flyover', () => {
  it('runs the marker from the start to the finish, waits there, then starts again', () => {
    const start = flyoverPose(route, 0);
    expect([start.x, start.z]).toEqual([route.polyline[0].x, route.polyline[0].z]);
    const travel = Math.ceil((route.length / FLYOVER_SPEED) * 60);
    const finish = route.polyline[route.polyline.length - 1];
    for (const tick of [travel, travel + FLYOVER_HOLD_TICKS - 1]) {
      const pose = flyoverPose(route, tick);
      expect(pose.x).toBeCloseTo(finish.x, 6);
      expect(pose.z).toBeCloseTo(finish.z, 6);
    }
    expect(flyoverPose(route, travel + FLYOVER_HOLD_TICKS)).toEqual(start);
  });

  it('heads the way the route goes and passes every junction in order', () => {
    const layout = createMinimap(city).layout;
    const travel = Math.ceil((route.length / FLYOVER_SPEED) * 60);
    const cells = new Set<string>();
    for (let tick = 0; tick <= travel; tick++) {
      const { x, z } = flyoverPose(route, tick);
      const { column, row } = minimapCell(layout, x, z);
      cells.add(`${column},${row}`);
    }
    for (const point of route.polyline) {
      const { column, row } = minimapCell(layout, point.x, point.z);
      expect(cells.has(`${column},${row}`)).toBe(true);
    }
    const { x, z } = route.legs[0].direction;
    const glyph = z < 0 ? 'A' : z > 0 ? 'V' : x < 0 ? '<' : '>';
    expect(carGlyph(flyoverPose(route, 1).heading)).toBe(glyph);
  });
});

describe('pre-race screen', () => {
  it('shows the day, one try, the route and the keys, and the route on the minimap', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID]) {
      const grid = new TextGrid(...size);
      preRace(grid);
      const all = text(grid);
      expect(all).toContain('the try is used the moment the countdown starts');
      expect(all).toContain(`${Math.round(route.length)} m   ${route.gates.length} gates`);
      expect(all).toContain(START_KEYS);
      expect(all).toContain('S');
      expect(all).toContain('F');
      const layout = preRaceLayout(...size, DAY, route, createMinimap(city).layout)!;
      expect(layout.minimap).not.toBeNull();
      expect(layout.blocks[1].block.rows.length).toBe(12); // ONE TRY, two rows per stroke and a backing row each side
    }
    // On the shots' grid the day is as big; at 1280 × 720 it shrinks to keep the minimap clear.
    expect(preRaceLayout(...SHOT_GRID, DAY, route, createMinimap(city).layout)!.blocks[0].block.rows.length).toBe(12);
    expect(preRaceLayout(...DEFAULT_GRID, DAY, route, createMinimap(city).layout)!.blocks[0].block.rows.length).toBe(7);
  });

  it('moves the flyover marker along the minimap and leaves the rest clean', () => {
    const grid = new TextGrid(...SHOT_GRID);
    const minimap = createMinimap(city);
    drawPreRaceScreen(grid, { day: DAY, route, minimap, tick: 0 });
    grid.dirty = false;
    drawPreRaceScreen(grid, { day: DAY, route, minimap, tick: 0 });
    expect(grid.dirty).toBe(false);
    const before = text(grid);
    drawPreRaceScreen(grid, { day: DAY, route, minimap, tick: 120 });
    const after = text(grid);
    const changed = [...before].filter((char, i) => char !== after[i]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });

  it('still says one try on a small grid, and draws nothing on a tiny one', () => {
    const grid = new TextGrid(...SMALL_GRID);
    preRace(grid);
    expect(text(grid)).toContain('ONE TRY');
    expect(text(grid)).toContain('enter: start');
    for (const [columns, rows] of [[0, 0], [5, 3], [20, 6]]) {
      const tiny = new TextGrid(columns, rows);
      expect(() => preRace(tiny)).not.toThrow();
    }
  });

  it('writes a negative day', () => {
    const grid = new TextGrid(...SHOT_GRID);
    expect(() => drawPreRaceScreen(grid, { day: -12, route, minimap: createMinimap(city), tick: 0 })).not.toThrow();
  });
});

describe('countdown to the next daily', () => {
  it('reads hh:mm:ss rounded up to whole seconds, then says the new daily is ready', () => {
    expect(countdownText(5 * HOUR + 12 * 60_000 + 44_000)).toBe('next daily in 05:12:44');
    expect(countdownText(5 * HOUR + 12 * 60_000 + 43_001)).toBe('next daily in 05:12:44');
    expect(countdownText(1)).toBe('next daily in 00:00:01');
    expect(countdownText(24 * HOUR)).toBe('next daily in 24:00:00');
    expect(countdownText(0)).toBe(READY_TEXT);
    expect(countdownText(-5000)).toBe(READY_TEXT);
    expect(countdownText(1000 * HOUR)).toBe('next daily in 99:59:59');
  });
});

describe('daily results screen', () => {
  const finished = { day: DAY, ticks: 4567, untilNext: 5 * HOUR };
  const dnf = { day: DAY, ticks: null, untilNext: 5 * HOUR };

  it('shows the time big, the day, the leaderboard line, the countdown and menu', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID]) {
      const grid = new TextGrid(...size);
      drawDailyResultsScreen(grid, finished);
      const all = text(grid);
      const layout = dailyResultsLayout(...size, finished)!;
      expect(layout.title.length).toBe(12);
      expect(layout.title.some((row) => row.includes('#'))).toBe(true);
      expect(all).toContain(`daily #${DAY}`);
      expect(all).toContain(LEADERBOARD_TEXT);
      expect(all).toContain('next daily in 05:00:00');
      expect(all).toMatch(/> menu </);
      expect(all).not.toContain('again');
      expect(all).not.toMatch(/> next/);
    }
  });

  it('says did not finish', () => {
    const grid = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(grid, dnf);
    const layout = dailyResultsLayout(...SHOT_GRID, dnf)!;
    expect(layout.title.length).toBe(12);
    const small = new TextGrid(...SMALL_GRID);
    drawDailyResultsScreen(small, dnf);
    expect(text(small)).toContain('did not finish');
  });

  it('offers to play once the next daily is ready, in the same place', () => {
    const grid = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(grid, finished);
    const before = text(grid);
    drawDailyResultsScreen(grid, { ...finished, untilNext: 0 });
    const all = text(grid);
    expect(all).toContain(READY_TEXT);
    expect(all).toMatch(/> play </);
    expect(dailyResultsLayout(...SHOT_GRID, finished)).toEqual(dailyResultsLayout(...SHOT_GRID, { ...finished, untilNext: 0 }));
    expect(before.length).toBe(all.length);
  });

  it('writes only the countdown line when a second passes, and nothing when it does not', () => {
    const grid = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(grid, finished);
    grid.dirty = false;
    drawDailyResultsScreen(grid, { ...finished, untilNext: 5 * HOUR - 300 });
    expect(grid.dirty).toBe(false);
    drawDailyResultsScreen(grid, { ...finished, untilNext: 5 * HOUR - 1300 });
    expect(grid.dirty).toBe(true);
  });

  it('shows what became of the run in one line of the same width for every state', () => {
    const statuses = Object.keys(LEADERBOARD_STATUS) as (keyof typeof LEADERBOARD_STATUS)[];
    for (const size of [SHOT_GRID, SMALL_GRID]) {
      const layout = dailyResultsLayout(...size, finished);
      for (const leaderboard of statuses) {
        const grid = new TextGrid(...size);
        drawDailyResultsScreen(grid, { ...finished, leaderboard });
        expect(text(grid)).toContain(LEADERBOARD_STATUS[leaderboard].text);
        expect(dailyResultsLayout(...size, { ...finished, leaderboard })).toEqual(layout);
      }
    }
    const plain = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(plain, finished);
    const unavailable = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(unavailable, { ...finished, leaderboard: 'unavailable' });
    expect(text(unavailable)).toBe(text(plain));
    expect(LEADERBOARD_STATUS.unavailable.text).toBe(LEADERBOARD_TEXT);
  });

  it('writes only the status line when it changes', () => {
    const grid = new TextGrid(...SHOT_GRID);
    drawDailyResultsScreen(grid, { ...finished, leaderboard: 'sending' });
    const before = text(grid).split('\n');
    drawDailyResultsScreen(grid, { ...finished, leaderboard: 'stored' });
    const after = text(grid).split('\n');
    expect(before.filter((row, i) => row !== after[i])).toHaveLength(1);
  });

  it('finds its one entry under the pointer', () => {
    const layout = dailyResultsLayout(...SHOT_GRID, finished)!;
    expect(menuEntryAt(layout, layout.listLeft + 2, layout.entryRows[0])).toBe(0);
    expect(menuEntryAt(layout, layout.listLeft + 2, layout.entryRows[0] + 1)).toBeNull();
  });

  it('draws on a small grid and nothing on a tiny one', () => {
    for (const [columns, rows] of [[0, 0], [5, 3], [20, 6], SMALL_GRID]) {
      expect(() => drawDailyResultsScreen(new TextGrid(columns, rows), finished)).not.toThrow();
    }
    expect(dailyResultsLayout(...SMALL_GRID, finished)).not.toBeNull();
  });
});
