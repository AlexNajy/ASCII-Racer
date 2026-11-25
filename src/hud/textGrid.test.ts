import { describe, expect, it } from 'vitest';
import { FIRST_PRINTABLE, LAST_PRINTABLE, printableRows, TextGrid, WHITE } from './textGrid.ts';

// The grid's characters as strings, row 0 first, '.' for empty cells.
function lines(grid: TextGrid): string[] {
  const result: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = '';
    for (let column = 0; column < grid.columns; column++) {
      const code = grid.get(column, row)!.code;
      line += code === 0 ? '.' : String.fromCharCode(code);
    }
    result.push(line);
  }
  return result;
}

describe('TextGrid', () => {
  it('starts empty and writes text with colour and background', () => {
    const grid = new TextGrid(6, 2);
    expect(lines(grid)).toEqual(['......', '......']);
    grid.write(1, 1, 'abc', { color: 0x123456, background: true });
    expect(lines(grid)).toEqual(['......', '.abc..']);
    expect(grid.get(2, 1)).toEqual({ code: 'b'.charCodeAt(0), background: true, color: 0x123456 });
    grid.put(0, 0, 'Z');
    expect(grid.get(0, 0)).toEqual({ code: 'Z'.charCodeAt(0), background: false, color: WHITE });
  });

  it('clips at all four edges without wrapping', () => {
    const grid = new TextGrid(5, 3);
    grid.write(3, 0, 'right');
    grid.write(1, 1, 'left', { align: 'right' });
    grid.write(0, 3, 'below');
    grid.write(0, -4, 'above');
    grid.fill(-2, -2, 10, 10, '#');
    expect(lines(grid)).toEqual(['...ri', 'ft.##', '...##']);
    expect(grid.get(5, 0)).toBeNull();
    expect(grid.get(0, -4)).toBeNull();
  });

  it('anchors negative coordinates to the right and bottom edges', () => {
    const grid = new TextGrid(7, 3);
    grid.write(-1, -1, 'end', { align: 'right' });
    grid.write(-1, 0, 'x');
    grid.write(3, 1, 'mid', { align: 'center' });
    expect(lines(grid)).toEqual(['......x', '..mid..', '....end']);
  });

  it('draws a framed box with a solid background inside', () => {
    const grid = new TextGrid(6, 4);
    grid.box(0, 0, 5, 3, 0xff0000);
    expect(lines(grid)).toEqual(['+---+.', '|   |.', '+---+.', '......']);
    expect(grid.get(2, 1)).toEqual({ code: 0x20, background: true, color: 0xff0000 });
  });

  it('clips a box hanging off the bottom right', () => {
    const grid = new TextGrid(4, 3);
    grid.box(-2, -2, 5, 5);
    expect(lines(grid)).toEqual(['....', '..+-', '..| ']);
  });

  it('turns characters outside printable ASCII into ?', () => {
    const grid = new TextGrid(5, 1);
    grid.write(0, 0, 'a\né\u007f~');
    expect(lines(grid)).toEqual(['a???~']);
  });

  it('sets the dirty flag only when a cell changes', () => {
    const grid = new TextGrid(4, 2);
    expect(grid.dirty).toBe(true);
    grid.dirty = false;
    grid.clear();
    expect(grid.dirty).toBe(false);
    grid.write(0, 0, 'hi');
    expect(grid.dirty).toBe(true);
    grid.dirty = false;
    grid.write(0, 0, 'hi');
    grid.write(9, 9, 'off');
    expect(grid.dirty).toBe(false);
    grid.write(0, 0, 'hi', { color: 0x00ff00 });
    expect(grid.dirty).toBe(true);
    grid.dirty = false;
    grid.clear();
    expect(grid.dirty).toBe(true);
    expect(lines(grid)).toEqual(['....', '....']);
  });

  it('resizes, clearing and marking dirty only when the size changes', () => {
    const grid = new TextGrid(4, 2);
    grid.write(0, 0, 'abcd');
    grid.dirty = false;
    grid.resize(4, 2);
    expect(grid.dirty).toBe(false);
    expect(lines(grid)).toEqual(['abcd', '....']);
    grid.resize(3, 3);
    expect(grid.dirty).toBe(true);
    expect([grid.columns, grid.rows, grid.data.length]).toEqual([3, 3, 36]);
    expect(lines(grid)).toEqual(['...', '...', '...']);
    grid.write(-1, -1, 'z');
    expect(lines(grid)).toEqual(['...', '...', '..z']);
  });

  it('cuts every printable character into atlas rows of one width', () => {
    const rows = printableRows(13);
    expect(rows.every((row) => row.length === 13)).toBe(true);
    const joined = rows.join('');
    expect(joined.length).toBe(13 * Math.ceil((LAST_PRINTABLE - FIRST_PRINTABLE + 1) / 13));
    for (let code = FIRST_PRINTABLE; code <= LAST_PRINTABLE; code++) {
      expect(joined.charCodeAt(code - FIRST_PRINTABLE)).toBe(code);
    }
  });
});
