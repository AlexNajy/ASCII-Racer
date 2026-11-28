import { describe, expect, it } from 'vitest';
import { FIRST_ENTRY, MENU_ENTRIES } from '../app/mainMenu.ts';
import { drawMenuScreen, LIST_WIDTH, menuEntryAt, menuLayout } from './menuScreen.ts';
import { TextGrid } from './textGrid.ts';

// 1280 × 720 at the default 6 px cells (11 px tall), and the shots' 1600 × 900.
const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}

function text(grid: TextGrid): string {
  return Array.from({ length: grid.rows }, (_, y) => line(grid, y)).join('\n');
}

describe('main menu screen', () => {
  it('draws the big title and every entry in order at the default size', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawMenuScreen(grid, FIRST_ENTRY);
    const layout = menuLayout(...DEFAULT_GRID)!;
    expect(layout.title.length).toBe(12); // two rows per stroke, a backing row each side
    const all = text(grid);
    let at = -1;
    for (const { label } of MENU_ENTRIES) {
      const next = all.indexOf(label, at + 1);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(line(grid, layout.entryRows[FIRST_ENTRY])).toMatch(/> daily +</);
    expect(line(grid, layout.entryRows[1])).not.toContain('>');
  });

  it('marks the selected entry with bright yellow markers, the label grey when not built', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    const layout = menuLayout(...DEFAULT_GRID)!;
    const at = (index: number, offset: number) => grid.get(layout.listLeft + 1 + offset, layout.entryRows[index])!.color;
    const marker = 3;
    const label = 5;
    drawMenuScreen(grid, 1);
    const built = at(1, label);
    const unselected = at(2, label);
    drawMenuScreen(grid, 2);
    expect(line(grid, layout.entryRows[2])).toMatch(/> join lobby +</);
    expect(line(grid, layout.entryRows[1])).not.toContain('>');
    expect(at(2, marker)).toBe(0xffd070);
    expect(at(2, label)).toBe(unselected);
    expect(at(1, label)).not.toBe(built);
    drawMenuScreen(grid, 1);
    expect(at(1, marker)).toBe(0xffd070);
    expect(at(1, label)).toBe(0xffd070);
  });

  it('changes only the two entry rows when the selection moves', () => {
    const layout = menuLayout(...DEFAULT_GRID)!;
    const grid = new TextGrid(...DEFAULT_GRID);
    drawMenuScreen(grid, 1);
    const before = grid.data.slice();
    drawMenuScreen(grid, 2);
    const changedRows = new Set<number>();
    for (let i = 0; i < before.length; i += 4) {
      for (let k = 0; k < 4; k++) if (before[i + k] !== grid.data[i + k]) changedRows.add(Math.floor(i / 4 / grid.columns));
    }
    expect([...changedRows].sort((a, b) => a - b)).toEqual([layout.entryRows[1], layout.entryRows[2]]);
  });

  it('puts the title and the list on a solid background', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawMenuScreen(grid, FIRST_ENTRY);
    const { title, titleLeft, titleTop, listLeft, listTop, listHeight } = menuLayout(...DEFAULT_GRID)!;
    for (let y = 0; y < title.length; y++) {
      for (let x = 0; x < title[0].length; x++) expect(grid.get(titleLeft + x, titleTop + y)!.background).toBe(true);
    }
    for (let y = 0; y < listHeight; y++) {
      for (let x = 0; x < LIST_WIDTH; x++) expect(grid.get(listLeft + x, listTop + y)!.background).toBe(true);
    }
  });

  it('leaves the grid clean when the same selection is drawn again', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID, [40, 20] as [number, number]]) {
      for (let selected = 0; selected < MENU_ENTRIES.length; selected++) {
        const grid = new TextGrid(...size);
        drawMenuScreen(grid, selected);
        grid.dirty = false;
        drawMenuScreen(grid, selected);
        expect(grid.dirty).toBe(false);
      }
    }
  });

  it('finds the entry under a cell, anywhere inside the frame on its row', () => {
    const layout = menuLayout(...DEFAULT_GRID)!;
    MENU_ENTRIES.forEach((_, i) => {
      const row = layout.entryRows[i];
      expect(menuEntryAt(layout, layout.listLeft + 1, row)).toBe(i);
      expect(menuEntryAt(layout, layout.listLeft + LIST_WIDTH - 2, row)).toBe(i);
      expect(menuEntryAt(layout, layout.listLeft, row)).toBeNull();
      expect(menuEntryAt(layout, layout.listLeft + LIST_WIDTH - 1, row)).toBeNull();
      expect(menuEntryAt(layout, layout.listLeft + 5, row + 1)).toBeNull();
    });
    expect(menuEntryAt(layout, layout.titleLeft + 10, layout.titleTop + 3)).toBeNull();
  });

  it('shrinks the title on smaller grids and keeps everything inside', () => {
    for (let columns = 0; columns <= 120; columns += 7) {
      for (let rows = 0; rows <= 60; rows += 3) {
        const grid = new TextGrid(columns, rows);
        expect(() => drawMenuScreen(grid, FIRST_ENTRY)).not.toThrow();
        const layout = menuLayout(columns, rows);
        if (!layout) continue;
        expect(layout.titleLeft).toBeGreaterThanOrEqual(0);
        expect(layout.listLeft).toBeGreaterThanOrEqual(0);
        expect(layout.titleLeft + layout.title[0].length).toBeLessThanOrEqual(columns);
        expect(layout.listTop + layout.listHeight).toBeLessThanOrEqual(rows);
      }
    }
    expect(menuLayout(70, 40)!.title.length).toBe(7); // one row per stroke
    expect(menuLayout(40, 30)!.title).toHaveLength(3); // one line of text
    expect(menuLayout(40, 30)!.title[1]).toContain('driftle');
    expect(menuLayout(10, 10)).toBeNull();
  });
});
