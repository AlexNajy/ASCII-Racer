import { describe, expect, it } from 'vitest';
import { drawLoadingScreen, LOADING_TEXT } from './loadingScreen.ts';
import { TextGrid } from './textGrid.ts';

function row(grid: TextGrid, y: number): string {
  let line = '';
  for (let x = 0; x < grid.columns; x++) line += String.fromCharCode(grid.get(x, y)?.code || 32);
  return line;
}

describe('loading screen', () => {
  it('draws the line centred in the middle row on a solid block', () => {
    const grid = new TextGrid(80, 30);
    drawLoadingScreen(grid);
    expect(row(grid, 15).trim()).toBe(LOADING_TEXT);
    const left = row(grid, 15).indexOf(LOADING_TEXT);
    expect(Math.abs(left + LOADING_TEXT.length / 2 - 40)).toBeLessThanOrEqual(1);
    for (const y of [14, 15, 16]) {
      for (let x = left - 2; x < left + LOADING_TEXT.length + 2; x++) expect(grid.get(x, y)?.background).toBe(true);
      expect(grid.get(left - 3, y)?.code).toBe(0);
    }
    expect(grid.get(left, 13)?.code).toBe(0);
    expect(grid.get(left, 17)?.code).toBe(0);
  });

  it('leaves the grid clean when drawn again', () => {
    const grid = new TextGrid(120, 50);
    drawLoadingScreen(grid);
    grid.dirty = false;
    drawLoadingScreen(grid);
    expect(grid.dirty).toBe(false);
  });

  it('draws on tiny grids without throwing or wrapping round', () => {
    for (const [columns, rows] of [[0, 0], [1, 1], [5, 3], [30, 2]]) {
      const grid = new TextGrid(columns, rows);
      expect(() => drawLoadingScreen(grid)).not.toThrow();
      if (rows === 1) expect(grid.get(0, 0)?.background).toBe(true);
    }
  });
});
