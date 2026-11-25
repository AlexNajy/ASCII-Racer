import type { City } from '../game/city.ts';
import type { TextGrid } from './textGrid.ts';

// The whole city, north (-Z) up, laid out from the road lines themselves: every road line is exactly one cell
// wide and every block the same number of cells, so roads never vanish or double on the cell lattice.
// Cells are 1.75× as tall as wide, so a block is 5 × 2 cells: (5 + 1) / (2 + 1) keeps a square city nearly square.
export const BLOCK_COLUMNS = 5;
export const BLOCK_ROWS = 2;
const PADDING_COLUMNS = 2; // between the frame and the map
const PADDING_ROWS = 1;
const FRAME_COLOR = 0x5a4a20;
const STREET_COLOR = 0x707888;
const AVENUE_COLOR = 0xc8d0e8;
const CAR_COLOR = 0xff7050;
const STREET_ACROSS = '-';
const STREET_DOWN = '|';
const AVENUE_ACROSS = '=';
const AVENUE_DOWN = 'H';
const CROSSING = '+';
const AVENUE_CROSSING = '#';
// Indexed by the heading in quarter turns: 0 faces -Z (north), positive turns left (west).
// A and V rather than ^ and v, which are too small in the font to find.
const CAR_GLYPHS = ['A', '<', 'V', '>'];

// One axis: world positions of the road edges and the cell positions they map to, in increasing order.
// Cell c covers [c - 0.5, c + 0.5], so road line i fills exactly cell i × (block + 1).
interface Axis {
  world: number[];
  cells: number[];
}

export interface MinimapLayout {
  columns: number; // map size in cells, without frame and padding
  rows: number;
  width: number; // panel size in cells, frame and padding included
  height: number;
  roadColumns: number[]; // the cell of each road line
  roadRows: number[];
  map: { char: string; color: number }[]; // row by row; char ' ' for blocks
  x: Axis;
  z: Axis;
}

function axis(bounds: [number, number], blockStarts: number[], blockSize: number, blockCells: number): Axis {
  const world = [bounds[0]];
  const cells = [-0.5];
  blockStarts.forEach((start, i) => {
    const roadCell = i * (blockCells + 1);
    world.push(start, start + blockSize);
    cells.push(roadCell + 0.5, roadCell + 0.5 + blockCells);
  });
  world.push(bounds[1]);
  cells.push(blockStarts.length * (blockCells + 1) + 0.5);
  return { world, cells };
}

function toCells({ world, cells }: Axis, at: number): number {
  if (at <= world[0]) return cells[0];
  for (let i = 1; i < world.length; i++) {
    if (at <= world[i]) return cells[i - 1] + ((at - world[i - 1]) / (world[i] - world[i - 1])) * (cells[i] - cells[i - 1]);
  }
  return cells[cells.length - 1];
}

export function minimapLayout(city: City): MinimapLayout {
  const firstRow = city.blocks.filter((block) => block.row === 0);
  const firstColumn = city.blocks.filter((block) => block.column === 0);
  const blocksPerSide = firstRow.length;
  const blockSize = blocksPerSide > 0 ? firstRow[0].rect.maxX - firstRow[0].rect.minX : 0;
  const { bounds } = city;
  const x = axis([bounds.minX, bounds.maxX], firstRow.map((block) => block.rect.minX), blockSize, BLOCK_COLUMNS);
  const z = axis([bounds.minZ, bounds.maxZ], firstColumn.map((block) => block.rect.minZ), blockSize, BLOCK_ROWS);
  const roadColumns = Array.from({ length: blocksPerSide + 1 }, (_, i) => i * (BLOCK_COLUMNS + 1));
  const roadRows = Array.from({ length: blocksPerSide + 1 }, (_, i) => i * (BLOCK_ROWS + 1));
  const columns = roadColumns[blocksPerSide] + 1;
  const rows = roadRows[blocksPerSide] + 1;

  const map: { char: string; color: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const rowRoad = roadRows.indexOf(row);
    for (let column = 0; column < columns; column++) {
      const columnRoad = roadColumns.indexOf(column);
      const rowAvenue = rowRoad >= 0 && city.avenues.rows.has(rowRoad);
      const columnAvenue = columnRoad >= 0 && city.avenues.columns.has(columnRoad);
      let char = ' ';
      if (rowRoad >= 0 && columnRoad >= 0) char = rowAvenue || columnAvenue ? AVENUE_CROSSING : CROSSING;
      else if (rowRoad >= 0) char = rowAvenue ? AVENUE_ACROSS : STREET_ACROSS;
      else if (columnRoad >= 0) char = columnAvenue ? AVENUE_DOWN : STREET_DOWN;
      map.push({ char, color: rowAvenue || columnAvenue ? AVENUE_COLOR : STREET_COLOR });
    }
  }
  return {
    columns,
    rows,
    width: columns + 2 * PADDING_COLUMNS + 2,
    height: rows + 2 * PADDING_ROWS + 2,
    roadColumns,
    roadRows,
    map,
    x,
    z,
  };
}

// A world position as fractional map cells (column, row), clamped to the map. Round to get the cell.
export function minimapPosition(layout: MinimapLayout, x: number, z: number): { column: number; row: number } {
  const clamp = (value: number, last: number) => Math.min(last, Math.max(0, value));
  return { column: clamp(toCells(layout.x, x), layout.columns - 1), row: clamp(toCells(layout.z, z), layout.rows - 1) };
}

export function minimapCell(layout: MinimapLayout, x: number, z: number): { column: number; row: number } {
  const { column, row } = minimapPosition(layout, x, z);
  return { column: Math.round(column), row: Math.round(row) };
}

export function carGlyph(heading: number): string {
  const quarter = Math.round(heading / (Math.PI / 2));
  return CAR_GLYPHS[((quarter % 4) + 4) % 4];
}

// The layout plus what was last drawn, so a frame only touches the cell the car left and the car's cell.
export interface Minimap {
  layout: MinimapLayout;
  drawn: { grid: TextGrid; columns: number; rows: number; left: number; top: number; car: { column: number; row: number } | null } | null;
}

export function createMinimap(city: City): Minimap {
  return { layout: minimapLayout(city), drawn: null };
}

export interface MinimapCar {
  x: number;
  z: number;
  heading: number;
}

// Draws the panel with its top left corner at (left, top). Everything is redrawn when the grid, its size or the
// place changed or the grid was cleared (the frame's corner is gone); otherwise only the car's old and new cells.
export function drawMinimap(grid: TextGrid, minimap: Minimap, left: number, top: number, car: MinimapCar): void {
  const { layout } = minimap;
  const mapLeft = left + 1 + PADDING_COLUMNS;
  const mapTop = top + 1 + PADDING_ROWS;
  const drawn = minimap.drawn;
  const intact =
    drawn !== null &&
    drawn.grid === grid &&
    drawn.columns === grid.columns &&
    drawn.rows === grid.rows &&
    drawn.left === left &&
    drawn.top === top &&
    grid.get(left, top)?.code === CROSSING.charCodeAt(0);
  const putMap = (column: number, row: number) => {
    const cell = layout.map[row * layout.columns + column];
    grid.put(mapLeft + column, mapTop + row, cell.char, cell.color, true);
  };
  if (!intact) {
    grid.box(left, top, layout.width, layout.height, FRAME_COLOR);
    for (let row = 0; row < layout.rows; row++) {
      for (let column = 0; column < layout.columns; column++) putMap(column, row);
    }
  }
  const cell = minimapCell(layout, car.x, car.z);
  const previous = intact && drawn ? drawn.car : null;
  if (previous && (previous.column !== cell.column || previous.row !== cell.row)) putMap(previous.column, previous.row);
  grid.put(mapLeft + cell.column, mapTop + cell.row, carGlyph(car.heading), CAR_COLOR, true);
  minimap.drawn = { grid, columns: grid.columns, rows: grid.rows, left, top, car: cell };
}
