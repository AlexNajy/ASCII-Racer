import { describe, expect, it } from 'vitest';
import { drawHud, MS_TO_KMH } from './hud.ts';
import { TextGrid } from './textGrid.ts';

const PANEL_WIDTH = 15;
const PANEL_HEIGHT = 9;
const NUMBER_LEFT = 2; // inside the frame and its padding
const DIGIT_STRIDE = 4;

function drawn(speed: number, columns = 100, rows = 40): TextGrid {
  const grid = new TextGrid(columns, rows);
  drawHud(grid, { speed, topSpeed: 32 });
  return grid;
}

function panelLeft(grid: TextGrid): number {
  return grid.columns - 1 - PANEL_WIDTH;
}

function panelTop(grid: TextGrid): number {
  return grid.rows - 1 - PANEL_HEIGHT;
}

function row(grid: TextGrid, panelRow: number): string {
  let line = '';
  for (let x = 0; x < PANEL_WIDTH; x++) line += String.fromCharCode(grid.get(panelLeft(grid) + x, panelTop(grid) + panelRow)?.code || 32);
  return line;
}

// The 3×5 cells of one digit position (0 = hundreds) as rows of '#' and ' '.
function digitAt(grid: TextGrid, position: number): string[] {
  const rows: string[] = [];
  for (let y = 1; y <= 5; y++) rows.push(row(grid, y).slice(NUMBER_LEFT + position * DIGIT_STRIDE, NUMBER_LEFT + position * DIGIT_STRIDE + 3));
  return rows;
}

function occupied(grid: TextGrid): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.columns; x++) {
      if (grid.get(x, y)?.code) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

describe('drawHud', () => {
  it('shows a single 0 and an empty bar at a standstill', () => {
    const grid = drawn(0);
    expect(digitAt(grid, 0)).toEqual(['   ', '   ', '   ', '   ', '   ']);
    expect(digitAt(grid, 1)).toEqual(['   ', '   ', '   ', '   ', '   ']);
    expect(digitAt(grid, 2)).toEqual(['###', '# #', '# #', '# #', '###']);
    expect(row(grid, 7)).not.toContain('#');
    expect(row(grid, 7)).toContain('.');
  });

  it('draws a 2-digit speed right-aligned with a blank hundreds position', () => {
    const grid = drawn(16);
    const kmh = Math.round(16 * MS_TO_KMH);
    expect(kmh).toBe(58);
    expect(digitAt(grid, 0)).toEqual(['   ', '   ', '   ', '   ', '   ']);
    expect(digitAt(grid, 1)).toEqual(['###', '#  ', '###', '  #', '###']);
    expect(digitAt(grid, 2)).toEqual(['###', '# #', '###', '# #', '###']);
    expect(row(grid, 7).split('#').length - 1).toBe(Math.round(0.5 * 11));
  });

  it('draws a 3-digit speed', () => {
    const grid = drawn(30);
    expect(Math.round(30 * MS_TO_KMH)).toBe(108);
    expect(digitAt(grid, 0)).toEqual(['.#.'.replaceAll('.', ' '), '## ', ' # ', ' # ', '###']);
    expect(digitAt(grid, 1)).toEqual(['###', '# #', '# #', '# #', '###']);
    expect(digitAt(grid, 2)).toEqual(['###', '# #', '###', '# #', '###']);
  });

  it('caps the number at 999', () => {
    const grid = drawn(1000);
    for (const position of [0, 1, 2]) expect(digitAt(grid, position)).toEqual(['###', '# #', '###', '  #', '###']);
  });

  it('puts the unit under the number', () => {
    expect(row(drawn(5), 6)).toContain('km/h');
  });

  it('fills the bar at top speed and no further above it', () => {
    const top = drawn(32);
    const above = drawn(60);
    expect(row(top, 7)).not.toContain('.');
    expect(row(top, 7).split('#').length - 1).toBe(11);
    expect(row(above, 7)).toBe(row(top, 7));
  });

  it('shows reversing as a positive number', () => {
    expect(digitAt(drawn(-10), 1)).toEqual(digitAt(drawn(10), 1));
    expect(digitAt(drawn(-10), 2)).toEqual(digitAt(drawn(10), 2));
  });

  it('keeps the panel the same size at every speed', () => {
    expect(occupied(drawn(0))).toEqual(occupied(drawn(32)));
  });

  it('is anchored to the bottom right corner for two grid sizes', () => {
    for (const [columns, rows] of [[100, 40], [240, 90]]) {
      const box = occupied(drawn(10, columns, rows));
      expect(columns - 1 - box.maxX).toBe(1);
      expect(rows - 1 - box.maxY).toBe(1);
      expect(box.maxX - box.minX + 1).toBe(PANEL_WIDTH);
      expect(box.maxY - box.minY + 1).toBe(PANEL_HEIGHT);
    }
  });

  it('draws nothing when the grid is too small for the panel', () => {
    for (const [columns, rows] of [[0, 0], [1, 1], [5, 3], [10, 2], [PANEL_WIDTH, 40], [100, PANEL_HEIGHT]]) {
      const grid = drawn(10, columns, rows);
      expect(grid.data.every((byte) => byte === 0)).toBe(true);
    }
  });

  it('draws once the grid fits the panel and its margin', () => {
    const grid = drawn(10, PANEL_WIDTH + 2, PANEL_HEIGHT + 2);
    expect(occupied(grid).minX).toBe(1);
  });

  it('does not touch the grid when the same values are drawn again', () => {
    const grid = drawn(12);
    grid.dirty = false;
    drawHud(grid, { speed: 12, topSpeed: 32 });
    expect(grid.dirty).toBe(false);
    drawHud(grid, { speed: 13, topSpeed: 32 });
    expect(grid.dirty).toBe(true);
  });

  it('shows an empty bar when the top speed is 0', () => {
    const grid = new TextGrid(100, 40);
    drawHud(grid, { speed: 10, topSpeed: 0 });
    expect(row(grid, 7)).not.toContain('#');
  });
});
