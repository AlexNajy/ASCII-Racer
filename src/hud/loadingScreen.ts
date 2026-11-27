import type { TextGrid } from './textGrid.ts';

// One line in the middle of the grid while a city builds, on a solid block so it reads over anything. Every cell of
// it is written once per call, so drawing it again leaves the grid clean.
export const LOADING_TEXT = 'building city...';
const TEXT_COLOR = 0xc0c0c0;
const BACKING_COLUMNS = 2; // solid cells each side of the text
const BACKING_ROWS = 1; // solid rows above and below it

export function drawLoadingScreen(grid: TextGrid): void {
  const line = ' '.repeat(BACKING_COLUMNS) + LOADING_TEXT + ' '.repeat(BACKING_COLUMNS);
  const blank = ' '.repeat(line.length);
  const column = Math.floor(grid.columns / 2);
  const middle = Math.floor(grid.rows / 2);
  for (let y = -BACKING_ROWS; y <= BACKING_ROWS; y++) {
    // Negative rows would count from the bottom.
    if (middle + y < 0) continue;
    grid.write(column, middle + y, y === 0 ? line : blank, { color: TEXT_COLOR, background: true, align: 'center' });
  }
}
