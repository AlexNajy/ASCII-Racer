import { describe, expect, it } from 'vitest';
import { pointerCell, type CellGeometry } from './pointer.ts';

// 1600 × 900 CSS px at 6 × 11 px cells: 266 whole columns, 81 whole rows, 9 px of a row cut off at the top.
const GEOMETRY: CellGeometry = { pixelRatio: 1, cellWidth: 6, cellHeight: 11, canvasHeight: 900, columns: 266, rows: 81 };

describe('pointer cell', () => {
  it('counts rows from the highest whole row, leaving the partial row at the top out', () => {
    expect(pointerCell(0, 899.5, GEOMETRY)).toEqual({ column: 0, row: 80 });
    expect(pointerCell(0, 9, GEOMETRY)).toEqual({ column: 0, row: 0 });
    expect(pointerCell(0, 19.9, GEOMETRY)).toEqual({ column: 0, row: 0 });
    expect(pointerCell(0, 20, GEOMETRY)).toEqual({ column: 0, row: 1 });
    expect(pointerCell(0, 8, GEOMETRY)).toBeNull();
  });

  it('counts columns from the left and drops the partial column at the right', () => {
    expect(pointerCell(5.9, 500, GEOMETRY)?.column).toBe(0);
    expect(pointerCell(6, 500, GEOMETRY)?.column).toBe(1);
    expect(pointerCell(1595, 500, GEOMETRY)?.column).toBe(265);
    expect(pointerCell(1597, 500, GEOMETRY)).toBeNull();
    expect(pointerCell(-1, 500, GEOMETRY)).toBeNull();
  });

  it('converts CSS px to device px first', () => {
    const retina: CellGeometry = { ...GEOMETRY, pixelRatio: 2, cellWidth: 12, cellHeight: 21, canvasHeight: 1800, rows: 85 };
    // 1800 = 85 × 21 + 15: the top 15 device px (7.5 CSS px) are no row.
    expect(pointerCell(3, 7, retina)).toBeNull();
    expect(pointerCell(3, 8, retina)).toEqual({ column: 0, row: 0 });
    expect(pointerCell(6, 899, retina)).toEqual({ column: 1, row: 84 });
  });
});
