import { describe, expect, it } from 'vitest';
import { createLobbyScreen, LOBBY_CHOICE_MORE, LOBBY_ROWS, type CreateLobbyScreen } from '../app/createLobbyMenu.ts';
import { createLobbyLayout, createLobbyRowAt, drawCreateLobbyScreen } from './createLobbyScreen.ts';
import { TextGrid } from './textGrid.ts';

const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];
const SMALLEST: [number, number] = [40, 14]; // 640 × 400 at glyph size 16

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}
const text = (grid: TextGrid) => Array.from({ length: grid.rows }, (_, y) => line(grid, y)).join('\n');
const view = (more: Partial<CreateLobbyScreen> = {}): CreateLobbyScreen => ({ ...createLobbyScreen(), ...more });

describe('create lobby screen', () => {
  it('draws the title, every row with its value and the hint at the default size', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawCreateLobbyScreen(grid, view());
    const layout = createLobbyLayout(...DEFAULT_GRID)!;
    expect(layout.title.length).toBe(12);
    expect(line(grid, layout.rowLines[0])).toMatch(/> seed +random +</);
    expect(line(grid, layout.rowLines[1])).toMatch(/ city size +< medium > /);
    expect(line(grid, layout.rowLines[2])).toMatch(/ downtown +< medium > /);
    expect(line(grid, layout.rowLines[3])).toMatch(/ avenues +< some {3}> /);
    expect(line(grid, layout.rowLines[4])).toMatch(/ route length +< medium > /);
    expect(line(grid, layout.rowLines[5])).toMatch(/ create +/);
    expect(text(grid)).toContain('enter  type a seed');
  });

  it('shows a typed seed with a cursor, and the rule for a seed refused', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    const layout = createLobbyLayout(...DEFAULT_GRID)!;
    drawCreateLobbyScreen(grid, view({ editing: { text: '48213', invalid: false } }));
    expect(line(grid, layout.rowLines[0])).toMatch(/> seed +48213_ +</);
    expect(text(grid)).toContain('empty: random');
    drawCreateLobbyScreen(grid, view({ editing: { text: '0', invalid: true } }));
    expect(text(grid)).toContain('1 to 1000000');
    drawCreateLobbyScreen(grid, view({ draft: { ...view().draft, seed: 31 } }));
    expect(line(grid, layout.rowLines[0])).toMatch(/> seed +31 +</);
  });

  it('puts the title and the panel on a solid background', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawCreateLobbyScreen(grid, view());
    const { title, titleLeft, titleTop, panelLeft, panelTop, lines, metrics } = createLobbyLayout(...DEFAULT_GRID)!;
    for (let y = 0; y < title.length; y++) for (let x = 0; x < title[0].length; x++) expect(grid.get(titleLeft + x, titleTop + y)!.background).toBe(true);
    for (let y = 0; y < lines.length; y++) for (let x = 0; x < metrics.panelWidth; x++) expect(grid.get(panelLeft + x, panelTop + y)!.background).toBe(true);
  });

  it('fits inside the grid without the title and panel overlapping, at many sizes, and draws every cell once', () => {
    let drawnSizes = 0;
    for (let columns = 20; columns <= 120; columns += 3) {
      for (let rows = 6; rows <= 50; rows += 2) {
        const layout = createLobbyLayout(columns, rows);
        const grid = new TextGrid(columns, rows);
        drawCreateLobbyScreen(grid, view());
        if (!layout) {
          expect(Array.from(grid.data).every((byte) => byte === 0)).toBe(true);
          continue;
        }
        drawnSizes++;
        const { title, titleLeft, titleTop, panelLeft, panelTop, lines, metrics } = layout;
        expect(titleLeft).toBeGreaterThanOrEqual(0);
        expect(titleLeft + title[0].length).toBeLessThanOrEqual(columns);
        expect(panelLeft).toBeGreaterThanOrEqual(0);
        expect(panelLeft + metrics.panelWidth).toBeLessThanOrEqual(columns);
        expect(titleTop).toBeGreaterThanOrEqual(0);
        expect(titleTop + title.length).toBeLessThanOrEqual(panelTop);
        expect(panelTop + lines.length).toBeLessThanOrEqual(rows);
        const again = new TextGrid(columns, rows);
        drawCreateLobbyScreen(again, view());
        again.dirty = false;
        drawCreateLobbyScreen(again, view());
        expect(again.dirty).toBe(false);
      }
    }
    expect(drawnSizes).toBeGreaterThan(100);
  });

  it('draws at the smallest window the game supports (640 × 400 at glyph size 16) and the shots size', () => {
    expect(createLobbyLayout(...SMALLEST)).not.toBeNull();
    expect(createLobbyLayout(...SHOT_GRID)!.title.length).toBe(12);
    for (const size of [SMALLEST, SHOT_GRID, DEFAULT_GRID]) {
      const grid = new TextGrid(...size);
      drawCreateLobbyScreen(grid, view({ selected: 5 }));
      const layout = createLobbyLayout(...size)!;
      LOBBY_ROWS.forEach((_, i) => expect(layout.rowLines[i]).toBeGreaterThanOrEqual(0));
      expect(text(grid)).toContain('create');
      expect(text(grid)).toContain('route length');
    }
    expect(createLobbyLayout(20, 6)).toBeNull();
  });

  it('draws the same view again without changing anything, and only the changed rows when the selection moves', () => {
    const layout = createLobbyLayout(...DEFAULT_GRID)!;
    const grid = new TextGrid(...DEFAULT_GRID);
    drawCreateLobbyScreen(grid, view({ selected: 1 }));
    const before = grid.data.slice();
    drawCreateLobbyScreen(grid, view({ selected: 3 }));
    const changed = new Set<number>();
    for (let i = 0; i < before.length; i++) if (before[i] !== grid.data[i]) changed.add(Math.floor(i / 4 / grid.columns));
    const hintRow = layout.panelTop + layout.lines.indexOf('hint');
    expect([...changed].sort((a, b) => a - b)).toEqual([layout.rowLines[1], layout.rowLines[3], hintRow].sort((a, b) => a - b));
  });

  it('finds the row and the column into its value under a cell', () => {
    const layout = createLobbyLayout(...DEFAULT_GRID)!;
    LOBBY_ROWS.forEach((_, index) => {
      const row = layout.rowLines[index];
      expect(createLobbyRowAt(layout, layout.panelLeft + 1, row)?.index).toBe(index);
      expect(createLobbyRowAt(layout, layout.panelLeft, row)).toBeNull();
      expect(createLobbyRowAt(layout, layout.panelLeft + layout.metrics.panelWidth - 1, row)).toBeNull();
      expect(createLobbyRowAt(layout, layout.valueLeft, row)).toEqual({ index, offset: 0 });
    });
    expect(createLobbyRowAt(layout, layout.valueLeft, layout.rowLines[0] + 1)).toBeNull();
    const grid = new TextGrid(...DEFAULT_GRID);
    drawCreateLobbyScreen(grid, view());
    expect(grid.get(layout.valueLeft, layout.rowLines[1])!.code).toBe('<'.charCodeAt(0));
    expect(grid.get(layout.valueLeft + LOBBY_CHOICE_MORE, layout.rowLines[1])!.code).toBe('>'.charCodeAt(0));
  });
});
