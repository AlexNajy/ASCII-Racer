import { raceTicks, type Race } from '../game/race.ts';
import { blockRows } from './blockFont.ts';
import type { Guidance } from './guidance.ts';
import { drawMinimap, type Minimap, type MinimapCar } from './minimap.ts';
import {
  ARROW_PANEL_HEIGHT,
  ARROW_PANEL_WIDTH,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  drawArrow,
  drawBanner,
  drawTimer,
  raceBanner,
  TIMER_HEIGHT,
  TIMER_WIDTH,
} from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// The driving HUD. The bottom right corner is the speedometer, the bottom left the minimap. In a race the top
// centre holds the timer, the arrow panel to its right and the banner under the timer.
export const MS_TO_KMH = 3.6;
const MARGIN = 1; // cells between the panel and the edge of the grid
const SPEED_DIGITS = 3;
const DIGIT_WIDTH = 3;
const DIGIT_HEIGHT = 5;
const DIGIT_GAP = 1;
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
  minimap?: { minimap: Minimap; car: MinimapCar };
  race?: RaceHudValues;
}

export interface RaceHudValues {
  race: Race;
  tick: number; // world tick
  guidance: Guidance | null;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Apart by at least MARGIN cells.
function apart(a: Rect, b: Rect): boolean {
  return (
    a.left + a.width + MARGIN <= b.left ||
    b.left + b.width + MARGIN <= a.left ||
    a.top + a.height + MARGIN <= b.top ||
    b.top + b.height + MARGIN <= a.top
  );
}

interface Cell {
  char: string;
  color: number;
}

function numberRows(kmh: number): string[] {
  return blockRows(String(kmh).padStart(SPEED_DIGITS, ' '));
}

// The race elements in order; each needs the ones before it, so a grid too small drops the banner first, then
// the arrow, then the timer. None is drawn over the speedometer or the minimap.
function drawRace(grid: TextGrid, { race, tick, guidance }: RaceHudValues, taken: Rect[]): void {
  const timer = { left: Math.floor((grid.columns - TIMER_WIDTH) / 2), top: MARGIN, width: TIMER_WIDTH, height: TIMER_HEIGHT };
  const arrow = { left: timer.left + TIMER_WIDTH + MARGIN, top: MARGIN, width: ARROW_PANEL_WIDTH, height: ARROW_PANEL_HEIGHT };
  const banner = { left: Math.floor((grid.columns - BANNER_WIDTH) / 2), top: MARGIN + TIMER_HEIGHT + MARGIN, width: BANNER_WIDTH, height: BANNER_HEIGHT };
  const elements: [Rect, () => void][] = [
    [timer, () => drawTimer(grid, timer.left, timer.top, raceTicks(race, tick), race.nextGate, race.route.gates.length)],
    [arrow, () => drawArrow(grid, arrow.left, arrow.top, guidance)],
    [banner, () => drawBanner(grid, banner.left, banner.top, raceBanner(race, tick))],
  ];
  for (const [rect, draw] of elements) {
    const inside = rect.left >= MARGIN && rect.left + rect.width + MARGIN <= grid.columns && rect.top + rect.height + MARGIN <= grid.rows;
    if (!inside || !taken.every((other) => apart(rect, other))) return;
    draw();
  }
}

export function drawHud(grid: TextGrid, { speed, topSpeed, minimap, race }: HudValues): void {
  const left = grid.columns - MARGIN - PANEL_WIDTH;
  const top = grid.rows - MARGIN - PANEL_HEIGHT;
  if (left < 0 || top < 0) return;
  const taken: Rect[] = [{ left, top, width: PANEL_WIDTH, height: PANEL_HEIGHT }];
  if (minimap) {
    const { width, height } = minimap.minimap.layout;
    const mapTop = grid.rows - MARGIN - height;
    // Only beside the speedometer with a margin between them, never over it.
    if (mapTop >= 0 && MARGIN + width + MARGIN <= left) {
      const route = race ? { route: race.race.route, nextGate: race.race.nextGate } : null;
      drawMinimap(grid, minimap.minimap, MARGIN, mapTop, minimap.car, route);
      taken.push({ left: MARGIN, top: mapTop, width, height });
    }
  }
  if (race) drawRace(grid, race, taken);

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
