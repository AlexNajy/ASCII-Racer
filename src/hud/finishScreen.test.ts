import { describe, expect, it } from 'vitest';
import { FIRST_OPTION, RESULTS_OPTIONS } from '../app/gameState.ts';
import { drawFinishScreen, finishLayout } from './finishScreen.ts';
import { menuEntryAt } from './menuScreen.ts';
import { TextGrid } from './textGrid.ts';

// 1280 × 720 at the default 6 px cells (11 px tall), and the shots' 1600 × 900.
const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];
const TICKS = 4567; // 1:16.116

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}

describe('finish screen', () => {
  it('draws the time in big characters above again, next and menu', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID]) {
      const grid = new TextGrid(...size);
      drawFinishScreen(grid, TICKS, FIRST_OPTION);
      const layout = finishLayout(...size, TICKS)!;
      expect(layout.title.length).toBe(12);
      expect(layout.titleTop + layout.title.length).toBeLessThan(layout.listTop);
      RESULTS_OPTIONS.forEach((option, i) => expect(line(grid, layout.entryRows[i])).toContain(option));
      expect(line(grid, layout.entryRows[0])).toMatch(/> again +</);
      expect(line(grid, layout.entryRows[1])).not.toContain('>');
      expect(layout.title.some((row) => row.includes('#'))).toBe(true);
      expect(grid.get(layout.titleLeft, layout.titleTop)!.background).toBe(true);
    }
  });

  it('shows the time as text on a small grid', () => {
    const layout = finishLayout(40, 30, TICKS)!;
    expect(layout.title).toHaveLength(3);
    expect(layout.title[1]).toContain('1:16.116');
  });

  it('finds the option under a cell', () => {
    const layout = finishLayout(...DEFAULT_GRID, TICKS)!;
    RESULTS_OPTIONS.forEach((_, i) => {
      const row = layout.entryRows[i];
      expect(menuEntryAt(layout, layout.listLeft + 1, row)).toBe(i);
      expect(menuEntryAt(layout, layout.listLeft + layout.listWidth - 2, row)).toBe(i);
      expect(menuEntryAt(layout, layout.listLeft + layout.listWidth - 1, row)).toBeNull();
      expect(menuEntryAt(layout, layout.listLeft + 3, row + 1)).toBeNull();
    });
    expect(menuEntryAt(layout, layout.titleLeft + 5, layout.titleTop + 3)).toBeNull();
  });

  it('leaves the grid clean when drawn again', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID, [40, 20] as [number, number]]) {
      for (let selected = 0; selected < RESULTS_OPTIONS.length; selected++) {
        const grid = new TextGrid(...size);
        drawFinishScreen(grid, TICKS, selected);
        grid.dirty = false;
        drawFinishScreen(grid, TICKS, selected);
        expect(grid.dirty).toBe(false);
      }
    }
  });

  it('changes only the two option rows when the selection moves', () => {
    const layout = finishLayout(...DEFAULT_GRID, TICKS)!;
    const grid = new TextGrid(...DEFAULT_GRID);
    drawFinishScreen(grid, TICKS, 0);
    const before = grid.data.slice();
    drawFinishScreen(grid, TICKS, 2);
    const changedRows = new Set<number>();
    for (let i = 0; i < before.length; i += 4) {
      for (let k = 0; k < 4; k++) if (before[i + k] !== grid.data[i + k]) changedRows.add(Math.floor(i / 4 / grid.columns));
    }
    expect([...changedRows].sort((a, b) => a - b)).toEqual([layout.entryRows[0], layout.entryRows[2]]);
  });

  it('never throws and stays inside small grids', () => {
    for (let columns = 0; columns <= 120; columns += 7) {
      for (let rows = 0; rows <= 60; rows += 3) {
        expect(() => drawFinishScreen(new TextGrid(columns, rows), TICKS, 1)).not.toThrow();
        const layout = finishLayout(columns, rows, TICKS);
        if (!layout) continue;
        expect(layout.titleLeft).toBeGreaterThanOrEqual(0);
        expect(layout.listLeft).toBeGreaterThanOrEqual(0);
        expect(layout.titleLeft + layout.title[0].length).toBeLessThanOrEqual(columns);
        expect(layout.listTop + layout.listHeight).toBeLessThanOrEqual(rows);
      }
    }
    expect(finishLayout(10, 10, TICKS)).toBeNull();
  });
});
