// Where the mouse is on the text layer. The ASCII pass counts cells from the bottom left of the canvas, and the text
// grid covers only whole cells with its row 0 the highest whole row, so a partial row at the top belongs to no cell.
export interface CellGeometry {
  pixelRatio: number; // device px per CSS px
  cellWidth: number; // device px
  cellHeight: number; // device px
  canvasHeight: number; // device px
  columns: number; // the text grid's size
  rows: number;
}

// The text grid cell under a point given in CSS px from the canvas's top left, or null off the grid.
export function pointerCell(x: number, y: number, geometry: CellGeometry): { column: number; row: number } | null {
  const { pixelRatio, cellWidth, cellHeight, canvasHeight, columns, rows } = geometry;
  const column = Math.floor((x * pixelRatio) / cellWidth);
  // A point on a row boundary belongs to the row below it, as the pixel under it does.
  const fromBottom = Math.ceil((canvasHeight - y * pixelRatio) / cellHeight) - 1;
  const row = rows - 1 - fromBottom;
  if (column < 0 || column >= columns || row < 0 || row >= rows) return null;
  return { column, row };
}
