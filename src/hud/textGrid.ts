// A terminal-like grid of characters, one per screen cell, drawn over the scene by the ASCII pass.
// Plain data: no WebGL here, so menus and tests can use it anywhere.

export const FIRST_PRINTABLE = 0x20;
export const LAST_PRINTABLE = 0x7e;
const UNPRINTABLE = '?'.charCodeAt(0);
// Set in a cell's character byte: the cell hides the scene even where its glyph is blank.
export const BACKGROUND_BIT = 0x80;
export const BYTES_PER_CELL = 4;
export const WHITE = 0xffffff;
const SPACE = 0x20;
const PLUS = 0x2b;
const DASH = 0x2d;
const BAR = 0x7c;

export type Align = 'left' | 'right' | 'center';

export interface TextStyle {
  color?: number; // 0xRRGGBB
  background?: boolean; // solid background behind the text instead of the scene
  align?: Align; // where `column` is: the first character (left), the last (right) or the middle (center)
}

// Every printable character in order, cut into rows of `width` for the glyph atlas (the last row padded with spaces).
export function printableRows(width: number): string[] {
  let all = '';
  for (let code = FIRST_PRINTABLE; code <= LAST_PRINTABLE; code++) all += String.fromCharCode(code);
  const rows: string[] = [];
  for (let start = 0; start < all.length; start += width) rows.push(all.slice(start, start + width).padEnd(width, ' '));
  return rows;
}

// Cells are 4 bytes each, row 0 at the top: character code (0 = nothing, the scene shows) with BACKGROUND_BIT,
// then red, green, blue. Negative columns and rows count from the right and bottom edge: -1 is the last.
// Anything outside the grid is clipped. `dirty` is set only when a write actually changes a cell.
export class TextGrid {
  columns = 0;
  rows = 0;
  data = new Uint8Array(0);
  dirty = true;

  constructor(columns = 0, rows = 0) {
    this.resize(columns, rows);
  }

  // Clears the grid when the size changes; the owner draws again.
  resize(columns: number, rows: number): void {
    columns = Math.max(0, Math.floor(columns));
    rows = Math.max(0, Math.floor(rows));
    if (columns === this.columns && rows === this.rows) return;
    this.columns = columns;
    this.rows = rows;
    this.data = new Uint8Array(columns * rows * BYTES_PER_CELL);
    this.dirty = true;
  }

  clear(): void {
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== 0) {
        this.data.fill(0);
        this.dirty = true;
        return;
      }
    }
  }

  // The character code and colour stored at a cell, or null outside the grid.
  get(column: number, row: number): { code: number; background: boolean; color: number } | null {
    const x = this.anchorColumn(column);
    const y = this.anchorRow(row);
    if (!this.inside(x, y)) return null;
    const i = (y * this.columns + x) * BYTES_PER_CELL;
    const d = this.data;
    return { code: d[i] & ~BACKGROUND_BIT, background: (d[i] & BACKGROUND_BIT) !== 0, color: (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3] };
  }

  put(column: number, row: number, char: string, color = WHITE, background = false): void {
    this.set(this.anchorColumn(column), this.anchorRow(row), char.charCodeAt(0), color, background);
  }

  write(column: number, row: number, text: string, { color = WHITE, background = false, align = 'left' }: TextStyle = {}): void {
    const y = this.anchorRow(row);
    if (y < 0 || y >= this.rows) return;
    let x = this.anchorColumn(column);
    if (align === 'right') x -= text.length - 1;
    else if (align === 'center') x -= Math.floor((text.length - 1) / 2);
    for (let i = 0; i < text.length; i++) this.set(x + i, y, text.charCodeAt(i), color, background);
  }

  // A rectangle `width` × `height` from its top left cell, filled with one character.
  fill(column: number, row: number, width: number, height: number, char = ' ', color = WHITE, background = false): void {
    this.fillCells(this.anchorColumn(column), this.anchorRow(row), width, height, char.charCodeAt(0), color, background);
  }

  // A +-| frame around a rectangle with a solid background inside, for panels over the scene.
  box(column: number, row: number, width: number, height: number, color = WHITE): void {
    if (width < 2 || height < 2) return;
    const left = this.anchorColumn(column);
    const top = this.anchorRow(row);
    const right = left + width - 1;
    const bottom = top + height - 1;
    this.fillCells(left + 1, top + 1, width - 2, height - 2, SPACE, color, true);
    this.fillCells(left + 1, top, width - 2, 1, DASH, color, true);
    this.fillCells(left + 1, bottom, width - 2, 1, DASH, color, true);
    this.fillCells(left, top + 1, 1, height - 2, BAR, color, true);
    this.fillCells(right, top + 1, 1, height - 2, BAR, color, true);
    for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]]) this.set(x, y, PLUS, color, true);
  }

  private anchorColumn(column: number): number {
    return column < 0 ? this.columns + column : column;
  }

  private anchorRow(row: number): number {
    return row < 0 ? this.rows + row : row;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.columns && y < this.rows;
  }

  // Already anchored coordinates from here on; negative ones are off the grid.
  private fillCells(left: number, top: number, width: number, height: number, code: number, color: number, background: boolean): void {
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(this.columns, left + width);
    const y1 = Math.min(this.rows, top + height);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) this.set(x, y, code, color, background);
    }
  }

  private set(x: number, y: number, code: number, color: number, background: boolean): void {
    if (!this.inside(x, y)) return;
    if (!(code >= FIRST_PRINTABLE && code <= LAST_PRINTABLE)) code = UNPRINTABLE;
    const i = (y * this.columns + x) * BYTES_PER_CELL;
    const d = this.data;
    const first = code | (background ? BACKGROUND_BIT : 0);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    if (d[i] === first && d[i + 1] === r && d[i + 2] === g && d[i + 3] === b) return;
    d[i] = first;
    d[i + 1] = r;
    d[i + 2] = g;
    d[i + 3] = b;
    this.dirty = true;
  }
}
