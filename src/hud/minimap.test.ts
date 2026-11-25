import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity, type City, type CitySettings } from '../game/city.ts';
import { drawHud } from './hud.ts';
import { BLOCK_COLUMNS, BLOCK_ROWS, carGlyph, createMinimap, minimapCell, minimapLayout, minimapPosition } from './minimap.ts';
import { TextGrid } from './textGrid.ts';

function city(settings: Partial<CitySettings> = {}): City {
  return generateCity({ ...DEFAULT_CITY_SETTINGS, ...settings });
}

const CITIES: Partial<CitySettings>[] = [
  {},
  { blocksPerSide: 3, seed: 2 },
  { blocksPerSide: 5, seed: 7, avenueDensity: 1 },
  { blocksPerSide: 14, seed: 11, avenueDensity: 1 },
];

const ROAD_CHARS = new Set(['-', '|', '+', '=', 'H', '#']);

function charAt(layout: ReturnType<typeof minimapLayout>, column: number, row: number): string {
  return layout.map[row * layout.columns + column].char;
}

describe('minimapLayout', () => {
  it('gives every road line one cell and every block the same number of cells', () => {
    for (const settings of CITIES) {
      const c = city(settings);
      const layout = minimapLayout(c);
      const blocks = settings.blocksPerSide ?? DEFAULT_CITY_SETTINGS.blocksPerSide;
      expect(layout.roadColumns.length).toBe(blocks + 1);
      expect(layout.roadRows.length).toBe(blocks + 1);
      expect(layout.columns).toBe(blocks * (BLOCK_COLUMNS + 1) + 1);
      expect(layout.rows).toBe(blocks * (BLOCK_ROWS + 1) + 1);
      for (let row = 0; row < layout.rows; row++) {
        for (let column = 0; column < layout.columns; column++) {
          const onRoad = layout.roadColumns.includes(column) || layout.roadRows.includes(row);
          expect(ROAD_CHARS.has(charAt(layout, column, row))).toBe(onRoad);
        }
      }
    }
  });

  it('marks avenues with their own glyphs', () => {
    for (const settings of CITIES) {
      const c = city(settings);
      const layout = minimapLayout(c);
      layout.roadColumns.forEach((column, road) => {
        const between = layout.roadRows[0] + 1;
        expect(charAt(layout, column, between)).toBe(c.avenues.columns.has(road) ? 'H' : '|');
      });
      layout.roadRows.forEach((row, road) => {
        const between = layout.roadColumns[0] + 1;
        expect(charAt(layout, between, row)).toBe(c.avenues.rows.has(road) ? '=' : '-');
      });
      for (const junction of c.junctions) {
        const avenue = c.avenues.columns.has(junction.column) || c.avenues.rows.has(junction.row);
        expect(charAt(layout, layout.roadColumns[junction.column], layout.roadRows[junction.row])).toBe(avenue ? '#' : '+');
      }
    }
    expect(city().avenues.columns.size + city().avenues.rows.size).toBeGreaterThan(0);
  });
});

describe('minimapPosition', () => {
  it('puts the corners of the bounds in the corner cells', () => {
    for (const settings of CITIES) {
      const layout = minimapLayout(city(settings));
      const { bounds } = city(settings);
      expect(minimapCell(layout, bounds.minX, bounds.minZ)).toEqual({ column: 0, row: 0 });
      expect(minimapCell(layout, bounds.maxX, bounds.maxZ)).toEqual({ column: layout.columns - 1, row: layout.rows - 1 });
      expect(minimapCell(layout, bounds.maxX, bounds.minZ)).toEqual({ column: layout.columns - 1, row: 0 });
    }
  });

  it('puts a junction exactly on the crossing of its road cells', () => {
    for (const settings of CITIES) {
      const c = city(settings);
      const layout = minimapLayout(c);
      for (const junction of c.junctions) {
        const position = minimapPosition(layout, junction.x, junction.z);
        expect(position.column).toBeCloseTo(layout.roadColumns[junction.column], 9);
        expect(position.row).toBeCloseTo(layout.roadRows[junction.row], 9);
      }
    }
  });

  it('keeps a car anywhere across a road in the road cell', () => {
    const c = city({ avenueDensity: 1 });
    const layout = minimapLayout(c);
    const avenue = [...c.avenues.columns][0];
    const junction = c.junctions.find((j) => j.column === avenue && j.row === 0)!;
    for (const offset of [-9.9, 0, 9.9]) {
      expect(minimapCell(layout, junction.x + offset, 0).column).toBe(layout.roadColumns[avenue]);
    }
  });

  it('moves a car smoothly between the junction cells along a segment', () => {
    const c = city();
    const layout = minimapLayout(c);
    const perRow = DEFAULT_CITY_SETTINGS.blocksPerSide + 1;
    const from = c.junctions[2 * perRow + 3];
    const to = c.junctions[2 * perRow + 4];
    // The block south-east of `from` spans the segment to `to` and the one down to the next row road.
    const block = c.blocks.find((b) => b.column === 3 && b.row === 2)!.rect;
    const middle = minimapPosition(layout, (block.minX + block.maxX) / 2, from.z);
    expect(middle.column).toBeCloseTo((layout.roadColumns[3] + layout.roadColumns[4]) / 2, 9);
    expect(middle.row).toBeCloseTo(layout.roadRows[2], 9);
    const halfway = minimapPosition(layout, from.x, (block.minZ + block.maxZ) / 2);
    expect(halfway.row).toBeCloseTo((layout.roadRows[2] + layout.roadRows[3]) / 2, 9);
    let last = layout.roadColumns[3];
    for (let step = 1; step <= 20; step++) {
      const { column } = minimapPosition(layout, from.x + ((to.x - from.x) * step) / 20, from.z);
      expect(column).toBeGreaterThanOrEqual(last);
      expect(column - last).toBeLessThan(1);
      last = column;
    }
    expect(last).toBeCloseTo(layout.roadColumns[4], 9);
  });

  it('clamps positions outside the bounds to the edge of the map', () => {
    const c = city();
    const layout = minimapLayout(c);
    expect(minimapCell(layout, c.bounds.minX - 100, c.bounds.maxZ + 100)).toEqual({ column: 0, row: layout.rows - 1 });
    expect(minimapCell(layout, c.bounds.maxX + 1, 0).column).toBe(layout.columns - 1);
  });
});

describe('carGlyph', () => {
  it('points the way the car faces, north up', () => {
    expect(carGlyph(0)).toBe('A');
    expect(carGlyph(Math.PI / 2)).toBe('<');
    expect(carGlyph(Math.PI)).toBe('V');
    expect(carGlyph(-Math.PI)).toBe('V');
    expect(carGlyph(-Math.PI / 2)).toBe('>');
    expect(carGlyph(2 * Math.PI + 0.3)).toBe('A');
    expect(carGlyph(-5 * Math.PI / 2)).toBe('>');
    expect(carGlyph(0.7)).toBe('A');
    expect(carGlyph(0.9)).toBe('<');
  });
});

describe('drawing through drawHud', () => {
  const c = city();
  const perRow = DEFAULT_CITY_SETTINGS.blocksPerSide + 1;
  const junction = c.junctions[4 * perRow + 4];
  const values = (minimap: ReturnType<typeof createMinimap>, x: number, z: number, heading = 0) => ({
    speed: 0,
    topSpeed: 32,
    minimap: { minimap, car: { x, z, heading } },
  });
  // Map cell (0, 0) on the grid: bottom left panel, inside the frame and padding.
  const origin = (grid: TextGrid, minimap: ReturnType<typeof createMinimap>) => ({
    column: 1 + 1 + 2,
    row: grid.rows - 1 - minimap.layout.height + 1 + 1,
  });

  it('draws the map and the car in the bottom left corner', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, junction.x, junction.z));
    const o = origin(grid, minimap);
    expect(grid.get(1, grid.rows - 2)?.code).toBe('+'.charCodeAt(0));
    expect(grid.get(o.column, o.row)?.code).toBe('+'.charCodeAt(0));
    const car = grid.get(o.column + minimap.layout.roadColumns[4], o.row + minimap.layout.roadRows[4]);
    expect(String.fromCharCode(car!.code)).toBe('A');
  });

  it('leaves the grid clean when the same state is drawn again', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, junction.x, junction.z));
    grid.dirty = false;
    drawHud(grid, values(minimap, junction.x, junction.z));
    expect(grid.dirty).toBe(false);
    drawHud(grid, values(minimap, junction.x, junction.z, Math.PI));
    expect(grid.dirty).toBe(true);
  });

  it('restores the road cell the car left', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    const fresh = new TextGrid(266, 81);
    const elsewhere = c.junctions[0];
    drawHud(fresh, values(createMinimap(c), elsewhere.x, elsewhere.z));
    drawHud(grid, values(minimap, junction.x, junction.z));
    drawHud(grid, values(minimap, elsewhere.x, elsewhere.z));
    expect(grid.data).toEqual(fresh.data);
  });

  it('draws everything again after the grid is cleared or resized', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, junction.x, junction.z));
    const before = grid.data.slice();
    grid.clear();
    drawHud(grid, values(minimap, junction.x, junction.z));
    expect(grid.data).toEqual(before);
    grid.resize(200, 70);
    drawHud(grid, values(minimap, junction.x, junction.z));
    const o = origin(grid, minimap);
    expect(grid.get(o.column, o.row)?.code).toBe('+'.charCodeAt(0));
  });

  it('draws no map when the grid is too small for it beside the speedometer', () => {
    const minimap = createMinimap(c);
    const { width, height } = minimap.layout;
    const speedometer = 15;
    for (const [columns, rows] of [[width + 2 + speedometer, 81], [266, height]]) {
      const grid = new TextGrid(columns, rows);
      drawHud(grid, values(minimap, junction.x, junction.z));
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < 1 + width; column++) expect(grid.get(column, row)?.code).toBe(0);
      }
    }
    const fits = new TextGrid(width + 3 + speedometer, height + 1);
    drawHud(fits, values(minimap, junction.x, junction.z));
    expect(fits.get(1, 0)?.code).toBe('+'.charCodeAt(0));
  });
});
