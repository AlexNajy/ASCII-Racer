import type { TextGrid } from './textGrid.ts';

// The driving HUD. The bottom right corner is the speedometer; the minimap takes another corner and the
// race timer and checkpoint count the top centre.
export const MS_TO_KMH = 3.6;
const MARGIN = 1; // cells between the panel and the edge of the grid
const SPEED_DIGITS = 3;
const DIGIT_WIDTH = 3;
const DIGIT_HEIGHT = 5;
const DIGIT_GAP = 1;
const DIGIT_ROWS = [
  '### #.# #.# #.# ###',
  '.#. ##. .#. .#. ###',
  '### ..# ### #.. ###',
  '### ..# ### ..# ###',
  '#.# #.# ### ..# ..#',
  '### #.. ### ..# ###',
  '### #.. ### #.# ###',
  '### ..# ..# ..# ..#',
  '### #.# ### #.# ###',
  '### #.# ### ..# ###',
].map((glyph) => glyph.split(' '));
const UNIT = 'km/h';
const FILLED = '#';
const EMPTY = '.';
const PADDING = 1; // cells between the frame and the contents, sides only
const NUMBER_WIDTH = SPEED_DIGITS * DIGIT_WIDTH + (SPEED_DIGITS - 1) * DIGIT_GAP;
const BAR_LENGTH = NUMBER_WIDTH;
const PANEL_WIDTH = NUMBER_WIDTH + 2 * PADDING + 2;
// Frame, digits, unit, bar, frame.
const PANEL_HEIGHT = DIGIT_HEIGHT + 4;
const FRAME_COLOR = 0x5a4a20;
const SPEED_COLOR = 0xffd070;
const UNIT_COLOR = 0xa08040;
const BAR_FILLED_COLOR = 0xe0a030;
const BAR_EMPTY_COLOR = 0x4a3c1c;

export interface HudValues {
  speed: number; // m/s, how fast the car moves in any direction
  topSpeed: number; // m/s, the full mark of the bar
}

interface Cell {
  char: string;
  color: number;
}

function numberRows(kmh: number): string[] {
  const digits = String(kmh).padStart(SPEED_DIGITS, ' ');
  const rows: string[] = [];
  for (let y = 0; y < DIGIT_HEIGHT; y++) {
    const parts: string[] = [];
    for (const digit of digits) {
      parts.push(digit === ' ' ? ' '.repeat(DIGIT_WIDTH) : DIGIT_ROWS[Number(digit)][y].replaceAll('.', ' '));
    }
    rows.push(parts.join(' '.repeat(DIGIT_GAP)));
  }
  return rows;
}

export function drawHud(grid: TextGrid, { speed, topSpeed }: HudValues): void {
  const left = grid.columns - MARGIN - PANEL_WIDTH;
  const top = grid.rows - MARGIN - PANEL_HEIGHT;
  if (left < 0 || top < 0) return;

  const kmh = Math.min(10 ** SPEED_DIGITS - 1, Math.round(Math.abs(speed) * MS_TO_KMH));
  const share = topSpeed > 0 ? Math.min(1, Math.abs(speed) / topSpeed) : 0;
  const filled = Math.round(share * BAR_LENGTH);

  const inner = (text: string, color: number): Cell[] => {
    const cells: Cell[] = [{ char: ' ', color: FRAME_COLOR }];
    for (let i = 0; i < PADDING; i++) cells.push({ char: ' ', color });
    for (const char of text) cells.push({ char, color });
    for (let i = 0; i < PADDING; i++) cells.push({ char: ' ', color });
    cells.push({ char: ' ', color: FRAME_COLOR });
    return cells;
  };
  const frameRow = (): Cell[] =>
    Array.from({ length: PANEL_WIDTH }, (_, x) => ({ char: x === 0 || x === PANEL_WIDTH - 1 ? '+' : '-', color: FRAME_COLOR }));
  const sides = (cells: Cell[]): Cell[] => {
    cells[0] = { char: '|', color: FRAME_COLOR };
    cells[cells.length - 1] = { char: '|', color: FRAME_COLOR };
    return cells;
  };

  const rows: Cell[][] = [frameRow()];
  for (const line of numberRows(kmh)) rows.push(sides(inner(line, SPEED_COLOR)));
  rows.push(sides(inner(UNIT.padStart(NUMBER_WIDTH, ' '), UNIT_COLOR)));
  const bar = inner(FILLED.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled), BAR_EMPTY_COLOR);
  for (let i = 0; i < filled; i++) bar[1 + PADDING + i].color = BAR_FILLED_COLOR;
  rows.push(sides(bar));
  rows.push(frameRow());

  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < PANEL_WIDTH; x++) grid.put(left + x, top + y, rows[y][x].char, rows[y][x].color, true);
  }
}
