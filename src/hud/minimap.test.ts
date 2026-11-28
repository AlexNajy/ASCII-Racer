import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity, type City, type CitySettings } from '../game/city.ts';
import { createRace, type Race } from '../game/race.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import { drawHud } from './hud.ts';
import {
  BLOCK_COLUMNS,
  BLOCK_ROWS,
  MINIMAP_MAX_HEIGHT_SHARE,
  MINIMAP_SCALES,
  carGlyph,
  chooseMinimapScale,
  createMinimap,
  minimapCell,
  minimapLayout,
  minimapPosition,
  routeCells,
  routeOverlay,
  type Minimap,
} from './minimap.ts';
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

function cellsText(grid: TextGrid): string {
  let text = '';
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.columns; x++) text += String.fromCharCode((grid.get(x, y)?.code ?? 32) & 127 || 32);
  }
  return text;
}

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
    const smallest = minimapLayout(c, MINIMAP_SCALES[MINIMAP_SCALES.length - 1]);
    const { width, height } = smallest;
    const speedometer = 15;
    for (const [columns, rows] of [[width + 2 + speedometer, 81], [266, height]]) {
      const grid = new TextGrid(columns, rows);
      drawHud(grid, values(minimap, junction.x, junction.z));
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < 1 + width; column++) expect(grid.get(column, row)?.code).toBe(0);
      }
    }
    const fits = new TextGrid(width + 3 + speedometer, height + 10);
    drawHud(fits, values(minimap, junction.x, junction.z));
    expect(fits.get(1, fits.rows - 1 - height)?.code).toBe('+'.charCodeAt(0));
  });

  it('uses a smaller scale where the full one does not fit', () => {
    const minimap = createMinimap(c);
    const grid = new TextGrid(100, 30);
    drawHud(grid, values(minimap, junction.x, junction.z));
    expect(minimap.layout.scale).not.toBe(MINIMAP_SCALES[0]);
    expect(grid.get(1, grid.rows - 1 - minimap.layout.height)?.code).toBe('+'.charCodeAt(0));
  });
});

const GRIDS: [number, number][] = [[213, 68], [240, 85], [240, 74], [320, 102], [80, 25], [40, 14]];
const SIZES = [6, 8, 10];

describe('the minimap scale', () => {
  const scaleName = (blocks: number, columns: number, rows: number) => {
    const scale = chooseMinimapScale(blocks, rows, columns - 20);
    return scale ? `${scale.columns}x${scale.rows}` : 'none';
  };

  it('keeps 5 x 2 for the default city at 1280 x 720 and shrinks 10 x 10 there', () => {
    expect(chooseMinimapScale(8, 68, 213 - 20)).toBe(MINIMAP_SCALES[0]);
    expect(minimapLayout(city()).scale).toBe(MINIMAP_SCALES[0]);
    expect(scaleName(10, 213, 68)).toBe('3x1');
  });

  it('is the largest scale within the height share, in the table of sizes and grids', () => {
    const table: Record<string, string> = {};
    for (const blocks of SIZES) {
      for (const [columns, rows] of GRIDS) {
        const scale = chooseMinimapScale(blocks, rows, columns - 20);
        table[`${blocks} ${columns}x${rows}`] = scale ? `${scale.columns}x${scale.rows}` : 'none';
        if (!scale) continue;
        const index = MINIMAP_SCALES.indexOf(scale);
        const height = (s: (typeof MINIMAP_SCALES)[number]) => blocks * (s.rows + 1) + 5;
        if (index > 0 && height(scale) <= MINIMAP_MAX_HEIGHT_SHARE * rows) {
          expect(height(MINIMAP_SCALES[index - 1]) > MINIMAP_MAX_HEIGHT_SHARE * rows || blocks * (MINIMAP_SCALES[index - 1].columns + 1) + 7 > columns - 20).toBe(true);
        }
      }
    }
    expect(table['6 213x68']).toBe('5x2');
    expect(table['8 213x68']).toBe('5x2');
    expect(table['10 213x68']).toBe('3x1');
    expect(table['10 240x74']).toBe('3x1');
    expect(table['10 320x102']).toBe('5x2');
    expect(table['10 40x14']).toBe('none');
    expect(scaleName(8, 213, 68)).toBe('5x2');
  });

  it('takes the largest scale narrow enough when none is within the share', () => {
    expect(chooseMinimapScale(8, 25, 100)).toBe(MINIMAP_SCALES[0]);
    expect(chooseMinimapScale(8, 25, 50)).toBe(MINIMAP_SCALES[1]);
    expect(chooseMinimapScale(8, 25, 35)).toBe(MINIMAP_SCALES[2]);
    expect(chooseMinimapScale(8, 25, 25)).toBe(MINIMAP_SCALES[3]);
    expect(chooseMinimapScale(8, 25, 20)).toBeNull();
  });

  it('skips scales the caller does not allow, prefers the larger of equal heights and gives none when nothing is allowed', () => {
    const notTall = (_: number, height: number) => height <= 21;
    expect(chooseMinimapScale(8, 68, 193, notTall)).toBe(MINIMAP_SCALES[1]);
    expect(chooseMinimapScale(8, 25, 193, notTall)).toBe(MINIMAP_SCALES[1]);
    expect(chooseMinimapScale(8, 25, 193, () => false)).toBeNull();
  });

  it('never costs the race timer its place, at the sizes where the smallest scale used to take it', () => {
    const grids: [number, number, number][] = [
      [8, 80, 28], [8, 66, 28], [8, 57, 24], [8, 73, 24], [8, 106, 34], [8, 85, 28],
      [10, 91, 29], [10, 80, 34], [10, 72, 31], [10, 66, 28], [10, 85, 28],
    ];
    for (const [blocks, columns, rows] of grids) {
      const c = city({ blocksPerSide: blocks, seed: 1 });
      const route = generateRoute(roadGraph(c), 1);
      const race = { race: { ...createRace(route, 0), phase: 'running' as const }, tick: 400, guidance: null, giveUp: false };
      const shown = (withMap: boolean) => {
        const grid = new TextGrid(columns, rows);
        const minimap = createMinimap(c);
        drawHud(grid, { speed: 0, topSpeed: 32, minimap: withMap ? { minimap, car: { ...route.pose } } : undefined, race });
        return { text: cellsText(grid), height: minimap.layout.height };
      };
      const label = `${blocks} blocks ${columns} x ${rows}`;
      expect(shown(false).text, label).toContain('GATE  ');
      expect(shown(true).text, label).toContain('GATE  ');
    }
  });

  it('keeps roads one cell and apart, positions monotonic and clamped, at every scale', () => {
    for (const blocks of SIZES) {
      const c = city({ blocksPerSide: blocks, seed: blocks });
      for (const scale of MINIMAP_SCALES) {
        const layout = minimapLayout(c, scale);
        expect(layout.columns).toBe(blocks * (scale.columns + 1) + 1);
        expect(layout.rows).toBe(blocks * (scale.rows + 1) + 1);
        expect(new Set(layout.roadColumns).size).toBe(blocks + 1);
        expect(new Set(layout.roadRows).size).toBe(blocks + 1);
        for (let i = 1; i <= blocks; i++) {
          expect(layout.roadColumns[i] - layout.roadColumns[i - 1]).toBeGreaterThan(1);
          expect(layout.roadRows[i] - layout.roadRows[i - 1]).toBeGreaterThan(1);
        }
        for (let row = 0; row < layout.rows; row++) {
          for (let column = 0; column < layout.columns; column++) {
            expect(ROAD_CHARS.has(charAt(layout, column, row))).toBe(layout.roadColumns.includes(column) || layout.roadRows.includes(row));
          }
        }
        const { bounds } = c;
        let last = { column: -1, row: -1 };
        for (let i = -2; i <= 52; i++) {
          const t = i / 50;
          const p = minimapPosition(layout, bounds.minX + (bounds.maxX - bounds.minX) * t, bounds.minZ + (bounds.maxZ - bounds.minZ) * t);
          expect(p.column).toBeGreaterThanOrEqual(Math.max(0, last.column));
          expect(p.row).toBeGreaterThanOrEqual(Math.max(0, last.row));
          expect(p.column).toBeLessThanOrEqual(layout.columns - 1);
          expect(p.row).toBeLessThanOrEqual(layout.rows - 1);
          last = p;
        }
        for (const junction of c.junctions) {
          const cell = minimapCell(layout, junction.x, junction.z);
          expect(layout.roadColumns).toContain(cell.column);
          expect(layout.roadRows).toContain(cell.row);
        }
      }
    }
  });

  it('leaves the grid clean when the same state is drawn again, at every scale', () => {
    const c = city({ blocksPerSide: 10, seed: 3 });
    const route = generateRoute(roadGraph(c), 1);
    const values = (minimap: Minimap) => ({
      speed: 0,
      topSpeed: 32,
      minimap: { minimap, car: { ...route.pose } },
      race: { race: { ...createRace(route, 0), phase: 'running' as const, nextGate: 1 }, tick: 400, guidance: null },
    });
    const seen = new Set<string>();
    for (const [columns, rows] of [[320, 102], [213, 68], [150, 40], [100, 30], [80, 25]]) {
      const grid = new TextGrid(columns, rows);
      const minimap = createMinimap(c);
      drawHud(grid, values(minimap));
      seen.add(`${minimap.layout.scale.columns}x${minimap.layout.scale.rows}`);
      grid.dirty = false;
      drawHud(grid, values(minimap));
      expect(grid.dirty).toBe(false);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('rebuilds cleanly when a resize changes the scale', () => {
    const c = city({ blocksPerSide: 10, seed: 3 });
    const route = generateRoute(roadGraph(c), 1);
    const values = (minimap: Minimap) => ({
      speed: 0,
      topSpeed: 32,
      minimap: { minimap, car: { ...route.pose } },
      race: { race: { ...createRace(route, 0), phase: 'running' as const }, tick: 400, guidance: null },
    });
    const minimap = createMinimap(c);
    const grid = new TextGrid(320, 102);
    drawHud(grid, values(minimap));
    expect(minimap.layout.scale).toBe(MINIMAP_SCALES[0]);
    grid.resize(213, 68);
    drawHud(grid, values(minimap));
    expect(minimap.layout.scale).toBe(MINIMAP_SCALES[1]);
    const fresh = new TextGrid(213, 68);
    drawHud(fresh, values(createMinimap(c)));
    expect(grid.data).toEqual(fresh.data);
    grid.resize(320, 102);
    drawHud(grid, values(minimap));
    const big = new TextGrid(320, 102);
    drawHud(big, values(createMinimap(c)));
    expect(grid.data).toEqual(big.data);
  });
});

describe('the route on the minimap', () => {
  const ROUTE_SEEDS = [1, 2, 3, 4, 5, 6];
  const ROUTE_CITIES: Partial<CitySettings>[] = [{}, { seed: 5 }, { seed: 9, avenueDensity: 1 }, { blocksPerSide: 10, seed: 3 }];
  const routes = ROUTE_CITIES.flatMap((settings) => {
    const c = city(settings);
    const graph = roadGraph(c);
    return ROUTE_SEEDS.map((seed) => ({ city: c, route: generateRoute(graph, seed) }));
  });
  const key = (cell: { column: number; row: number }) => `${cell.column},${cell.row}`;

  it('is an unbroken line of road cells from the start to the finish, over 24 routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(20);
    for (const { city: c, route } of routes) {
      const layout = minimapLayout(c);
      const legs = routeCells(layout, route);
      expect(legs.length).toBe(route.legs.length);
      const all = legs.flat();
      for (const cell of all) expect(ROAD_CHARS.has(charAt(layout, cell.column, cell.row))).toBe(true);
      for (let i = 1; i < all.length; i++) {
        expect(Math.abs(all[i].column - all[i - 1].column) + Math.abs(all[i].row - all[i - 1].row)).toBeLessThanOrEqual(1);
      }
      legs.slice(1).forEach((cells, i) => expect(cells[0]).toEqual(legs[i][legs[i].length - 1]));
      expect(all[0]).toEqual(minimapCell(layout, route.start.point.x, route.start.point.z));
      const finish = route.gates[route.gates.length - 1].point;
      expect(all[all.length - 1]).toEqual(minimapCell(layout, finish.x, finish.z));
      // Every junction of the route is a crossing cell on the line.
      const onLine = new Set(all.map(key));
      for (const junction of route.junctions) {
        const { x, z } = c.junctions[junction];
        expect(onLine.has(key(minimapCell(layout, x, z)))).toBe(true);
      }
    }
  });

  it('is unbroken at every scale for routes of 6 x 6, 8 x 8 and 10 x 10 cities', () => {
    for (const blocks of SIZES) {
      for (const seed of [1, 2, 3]) {
        const c = city({ blocksPerSide: blocks, seed });
        const graph = roadGraph(c);
        for (const routeSeed of [1, 2, 3]) {
          const route = generateRoute(graph, routeSeed);
          for (const scale of MINIMAP_SCALES) {
            const layout = minimapLayout(c, scale);
            const all = routeCells(layout, route).flat();
            for (const cell of all) expect(ROAD_CHARS.has(charAt(layout, cell.column, cell.row))).toBe(true);
            for (let i = 1; i < all.length; i++) {
              expect(Math.abs(all[i].column - all[i - 1].column) + Math.abs(all[i].row - all[i - 1].row)).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('gives a shared cell to the next gate, then the finish, the start, the other gates, the route', () => {
    const c = city({ blocksPerSide: 10, seed: 3 });
    const route = generateRoute(roadGraph(c), 1);
    const layout = minimapLayout(c, MINIMAP_SCALES[MINIMAP_SCALES.length - 1]);
    const cellOf = (p: { x: number; z: number }) => minimapCell(layout, p.x, p.z).row * layout.columns + minimapCell(layout, p.x, p.z).column;
    const overlay = routeOverlay(layout, { route, nextGate: 0 });
    expect(overlay.get(cellOf(route.gates[0].point))?.char).toBe('@');
    expect(overlay.get(cellOf(route.gates[route.gates.length - 1].point))?.char).toBe('F');
    const away = { x: 1e9, z: 1e9 };
    const gates = route.gates.map((gate) => ({ ...gate, point: route.start.point }));
    const withGates = (list: typeof gates) => ({ ...route, gates: list });
    const last = gates.length - 1;
    const char = (list: typeof gates, nextGate: number) => routeOverlay(layout, { route: withGates(list), nextGate }).get(cellOf(route.start.point))?.char;
    expect(char(gates, 0)).toBe('@');
    expect(char(gates, last)).toBe('F');
    expect(char(gates.map((gate, i) => (i === 0 ? { ...gate, point: away } : gate)), 0)).toBe('F');
    expect(char(gates.map((gate, i) => (i === 0 || i === last ? { ...gate, point: away } : gate)), 0)).toBe('S');
    expect(char(gates.map((gate, i) => (i === 0 || i === last ? { ...gate, point: away } : gate)), last)).toBe('S');
    expect(routeOverlay(layout, { route, nextGate: 0 })).toEqual(routeOverlay(layout, { route, nextGate: 0 }));
  });

  it('marks the next gate, the finish and the start, and dims what is behind the last gate passed', () => {
    for (const { city: c, route } of routes) {
      const layout = minimapLayout(c);
      const at = (overlay: Map<number, { char: string; color: number }>, p: { x: number; z: number }) => {
        const { column, row } = minimapCell(layout, p.x, p.z);
        return overlay.get(row * layout.columns + column);
      };
      const finish = route.gates[route.gates.length - 1].point;
      const first = routeOverlay(layout, { route, nextGate: 0 });
      expect(at(first, route.gates[0].point)?.char).toBe('@');
      expect(at(first, finish)?.char).toBe('F');
      expect(at(first, route.start.point)?.char).toBe('S');
      const colors = new Set([...first.values()].filter((cell) => cell.char === '#').map((cell) => cell.color));
      expect(colors.size).toBe(1);

      const later = routeOverlay(layout, { route, nextGate: 2 });
      expect(at(later, route.gates[2].point)?.char).toBe('@');
      expect(at(later, route.gates[0].point)?.char).not.toBe('@');
      const line = routeCells(layout, route).flat();
      const brightColor = [...colors][0];
      const indexOf = (cell: { column: number; row: number }) => cell.row * layout.columns + cell.column;
      const visits = new Map<number, number>();
      for (const cell of line) visits.set(indexOf(cell), (visits.get(indexOf(cell)) ?? 0) + 1);
      // A cell just after the start, driven once, is behind the gates passed: dim now; one before the finish isn't.
      const early = line.slice(1).find((cell) => visits.get(indexOf(cell)) === 1)!;
      expect(later.get(indexOf(early))?.color).not.toBe(brightColor);
      const end = line[line.length - 2];
      expect(later.get(indexOf(end))?.color).toBe(brightColor);
    }
  });
});

describe('drawing the route through drawHud', () => {
  const c = city();
  const route = generateRoute(roadGraph(c), 1);
  const race = (nextGate: number): Race => ({ ...createRace(route, 0), phase: 'running', nextGate });
  const values = (minimap: Minimap, x: number, z: number, nextGate = 0) => ({
    speed: 0,
    topSpeed: 32,
    minimap: { minimap, car: { x, z, heading: 0 } },
    race: { race: race(nextGate), tick: 400, guidance: null },
  });
  const start = route.start.point;
  const onRoute = route.polyline[2];

  it('leaves the grid clean when the same state is drawn again', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, start.x, start.z));
    grid.dirty = false;
    drawHud(grid, values(minimap, start.x, start.z));
    expect(grid.dirty).toBe(false);
  });

  it('restores the route under the cell the car left', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    const fresh = new TextGrid(266, 81);
    drawHud(fresh, values(createMinimap(c), start.x, start.z));
    drawHud(grid, values(minimap, onRoute.x, onRoute.z));
    drawHud(grid, values(minimap, start.x, start.z));
    expect(grid.data).toEqual(fresh.data);
  });

  it('updates the route when the next gate changes, as a fresh draw would', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, start.x, start.z, 0));
    drawHud(grid, values(minimap, start.x, start.z, 3));
    const fresh = new TextGrid(266, 81);
    drawHud(fresh, values(createMinimap(c), start.x, start.z, 3));
    expect(grid.data).toEqual(fresh.data);
  });

  it('goes back to the plain map without a race', () => {
    const grid = new TextGrid(266, 81);
    const minimap = createMinimap(c);
    drawHud(grid, values(minimap, start.x, start.z));
    drawHud(grid, { speed: 0, topSpeed: 32, minimap: { minimap, car: { x: start.x, z: start.z, heading: 0 } } });
    const fresh = new TextGrid(266, 81);
    drawHud(fresh, { speed: 0, topSpeed: 32, minimap: { minimap: createMinimap(c), car: { x: start.x, z: start.z, heading: 0 } } });
    // The race elements stay until the owner clears the grid; the map itself is plain again.
    const { width, height } = minimap.layout;
    for (let row = grid.rows - 1 - height; row < grid.rows - 1; row++) {
      for (let column = 1; column < 1 + width; column++) expect(grid.get(column, row)).toEqual(fresh.get(column, row));
    }
  });
});
