import { describe, expect, it } from 'vitest';
import { CHOICE_LESS, CHOICE_MORE, GARAGE_ROWS } from '../app/garageMenu.ts';
import { DEFAULT_PLAYER_SETTINGS } from '../app/settings.ts';
import { drawGarageScreen, garageLayout, garageRowAt, type GarageView } from './garageScreen.ts';
import { TextGrid } from './textGrid.ts';

const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];
const CELL_ASPECT = 1.75;

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}

function view(selected = 0, more: Partial<GarageView['settings']> = {}): GarageView {
  return { selected, settings: { ...DEFAULT_PLAYER_SETTINGS, ...more } };
}

describe('garage screen', () => {
  it('draws the title on top and the two rows with their names in a panel at the bottom', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawGarageScreen(grid, view());
    const layout = garageLayout(...DEFAULT_GRID)!;
    expect(layout.title.length).toBe(12);
    expect(layout.titleTop).toBe(1);
    expect(layout.panelTop + layout.lines.length).toBe(DEFAULT_GRID[1] - 1);
    expect(line(grid, layout.rowLines[0])).toMatch(/> shape +< coupe +> +</);
    expect(line(grid, layout.rowLines[1])).toMatch(/ colour +< ember +> /);
    expect(line(grid, layout.rowLines[1])).not.toContain('colour <');
    drawGarageScreen(grid, view(1, { carShape: 'hatchback', carColor: 'magenta' }));
    expect(line(grid, layout.rowLines[0])).toMatch(/ shape +< hatchback > /);
    expect(line(grid, layout.rowLines[1])).toMatch(/> colour +< magenta +> +</);
  });

  it('keeps the middle of the picture clear for the car', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID]) {
      const grid = new TextGrid(...size);
      drawGarageScreen(grid, view());
      const [, rows] = size;
      const middle = Math.floor(rows / 2);
      for (let y = Math.floor(rows * 0.25); y < Math.ceil(rows * 0.8); y++) expect(line(grid, y).trim(), `row ${y} of ${middle * 2}`).toBe('');
    }
  });

  it('leaves the grid clean when the same view is drawn again', () => {
    for (const size of [DEFAULT_GRID, SHOT_GRID, [60, 30] as [number, number], [38, 12] as [number, number]]) {
      for (const shown of [view(), view(1, { carShape: 'van', carColor: 'silver' })]) {
        const grid = new TextGrid(...size);
        drawGarageScreen(grid, shown);
        grid.dirty = false;
        drawGarageScreen(grid, shown);
        expect(grid.dirty).toBe(false);
      }
    }
  });

  it('finds the row and the column into its value under a cell, the arrows where they are drawn', () => {
    const layout = garageLayout(...DEFAULT_GRID)!;
    const grid = new TextGrid(...DEFAULT_GRID);
    drawGarageScreen(grid, view());
    GARAGE_ROWS.forEach((_, index) => {
      const row = layout.rowLines[index];
      expect(garageRowAt(layout, layout.panelLeft + 1, row)?.index).toBe(index);
      expect(garageRowAt(layout, layout.panelLeft, row)).toBeNull();
      expect(garageRowAt(layout, layout.panelLeft + layout.panelWidth - 1, row)).toBeNull();
      expect(garageRowAt(layout, layout.valueLeft + CHOICE_MORE, row)).toEqual({ index, offset: CHOICE_MORE });
      expect(grid.get(layout.valueLeft + CHOICE_LESS, row)!.code).toBe('<'.charCodeAt(0));
      expect(grid.get(layout.valueLeft + CHOICE_MORE, row)!.code).toBe('>'.charCodeAt(0));
    });
    expect(garageRowAt(layout, layout.valueLeft, layout.rowLines[0] + 1)).toBeNull();
  });

  it('shrinks on smaller grids, never throws and keeps everything inside', () => {
    for (let columns = 0; columns <= 120; columns += 7) {
      for (let rows = 0; rows <= 70; rows += 3) {
        const grid = new TextGrid(columns, rows);
        expect(() => drawGarageScreen(grid, view())).not.toThrow();
        const layout = garageLayout(columns, rows);
        if (!layout) continue;
        expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
        expect(layout.panelLeft + layout.panelWidth).toBeLessThanOrEqual(columns);
        expect(layout.titleLeft + layout.title[0].length).toBeLessThanOrEqual(columns);
        expect(layout.titleTop + layout.title.length).toBeLessThanOrEqual(layout.panelTop);
        expect(layout.panelTop + layout.lines.length).toBeLessThanOrEqual(rows);
      }
    }
    expect(garageLayout(10, 10)).toBeNull();
  });

  it('draws at every glyph size in a 640 x 400 window and larger, the compact style whole', () => {
    for (let glyph = 4; glyph <= 16; glyph++) {
      for (const [width, height] of [[640, 400], [700, 450], [1280, 720]]) {
        const size: [number, number] = [Math.floor(width / glyph), Math.floor(height / Math.round(glyph * CELL_ASPECT))];
        const layout = garageLayout(...size);
        expect(layout, `${glyph} in ${width}x${height}`).not.toBeNull();
        const grid = new TextGrid(...size);
        drawGarageScreen(grid, view(1));
        expect(line(grid, layout!.rowLines[0])).toContain('< coupe');
        expect(line(grid, layout!.rowLines[1])).toMatch(/> colour +< ember/);
      }
    }
  });
});
