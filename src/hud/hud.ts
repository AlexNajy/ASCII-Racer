import { raceTicks, type Race } from '../game/race.ts';
import { blockRows } from './blockFont.ts';
import type { Guidance } from './guidance.ts';
import { drawMinimap, fitMinimap, type Minimap, type MinimapCar } from './minimap.ts';
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
  giveUp?: boolean; // the daily's: whether Esc is waiting for Enter to give up; not given outside the daily
}

// Asked while the daily race keeps running (no pause: that would stop the clock to plan); shorter forms on smaller grids.
export const GIVE_UP_TEXT = 'give up? this is your one try   enter: give up   esc: keep driving';
export const GIVE_UP_SHORT_TEXT = 'give up?  enter: yes  esc: no';
export const GIVE_UP_MIN_TEXT = 'give up? enter/esc';
const GIVE_UP_COLOR = 0xff7040;
const GIVE_UP_BACKING_COLUMNS = 2;
const GIVE_UP_HEIGHT = 3; // a solid row above and below the line

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

interface Element {
  rect: Rect;
  draw: () => void;
}

// The race elements in order; each needs the ones before it, so a grid too small drops the banner first, then
// the arrow, then the timer. None is placed over the speedometer or the minimap.
function raceElements(grid: TextGrid, { race, tick, guidance }: RaceHudValues, taken: Rect[]): Element[] {
  const timer = timerRect(grid);
  const arrow = { left: timer.left + TIMER_WIDTH + MARGIN, top: MARGIN, width: ARROW_PANEL_WIDTH, height: ARROW_PANEL_HEIGHT };
  const banner = { left: Math.floor((grid.columns - BANNER_WIDTH) / 2), top: MARGIN + TIMER_HEIGHT + MARGIN, width: BANNER_WIDTH, height: BANNER_HEIGHT };
  const elements: Element[] = [
    { rect: timer, draw: () => drawTimer(grid, timer.left, timer.top, raceTicks(race, tick), race.nextGate, race.route.gates.length) },
    { rect: arrow, draw: () => drawArrow(grid, arrow.left, arrow.top, guidance) },
    { rect: banner, draw: () => drawBanner(grid, banner.left, banner.top, raceBanner(race, tick)) },
  ];
  const placed: Element[] = [];
  for (const element of elements) {
    if (!inside(grid, element.rect) || !taken.every((other) => apart(element.rect, other))) break;
    placed.push(element);
  }
  return placed;
}

function timerRect(grid: TextGrid): Rect {
  return { left: Math.floor((grid.columns - TIMER_WIDTH) / 2), top: MARGIN, width: TIMER_WIDTH, height: TIMER_HEIGHT };
}

function inside(grid: TextGrid, rect: Rect): boolean {
  return rect.left >= MARGIN && rect.top >= 0 && rect.left + rect.width + MARGIN <= grid.columns && rect.top + rect.height + MARGIN <= grid.rows;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

function within(rects: Rect[], x: number, y: number): boolean {
  return rects.some((rect) => x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height);
}

interface Question {
  rect: Rect;
  line: string; // the middle row, or the only one
  over: boolean; // drawn over the other elements, which are hidden while it is asked
}

// The part of the question that must be seen for it to be asked.
const GIVE_UP_WORDS = 'give up?';

// Whether the give-up question can be drawn on a grid this size: on one row, its smallest form clipped to the grid
// as long as the question itself shows.
export function giveUpShown(columns: number, rows: number): boolean {
  return columns >= GIVE_UP_WORDS.length && rows >= 1;
}

// Where the question goes: the first place free of everything else, from under the banner up to the top; on a
// grid with no such place the first place it fits over the others; at the last the smallest form on the top row.
function questionPlace(grid: TextGrid, taken: Rect[]): Question | null {
  const tops = [MARGIN + TIMER_HEIGHT + MARGIN + BANNER_HEIGHT + MARGIN, MARGIN + TIMER_HEIGHT + MARGIN, MARGIN];
  for (const over of [false, true]) {
    for (const text of over ? [GIVE_UP_TEXT, GIVE_UP_SHORT_TEXT, GIVE_UP_MIN_TEXT] : [GIVE_UP_TEXT, GIVE_UP_SHORT_TEXT]) {
      const width = text.length + 2 * GIVE_UP_BACKING_COLUMNS;
      for (const top of tops) {
        const rect = { left: Math.floor((grid.columns - width) / 2), top, width, height: GIVE_UP_HEIGHT };
        if (!inside(grid, rect) || (!over && !taken.every((other) => apart(rect, other)))) continue;
        const backing = ' '.repeat(GIVE_UP_BACKING_COLUMNS);
        return { rect, line: backing + text + backing, over };
      }
    }
  }
  if (!giveUpShown(grid.columns, grid.rows)) return null;
  const line = GIVE_UP_MIN_TEXT.slice(0, grid.columns);
  const rect = { left: Math.floor((grid.columns - line.length) / 2), top: 0, width: line.length, height: 1 };
  return { rect, line, over: true };
}

// The same place every call. In a free place it is written blank and see-through while nothing is asked; over the
// others, the cells no element covers are, and while it is asked the elements under it are written blank instead of
// drawn, so every cell is written once per call and nothing is left behind when it goes.
function drawQuestion(grid: TextGrid, { rect, line }: Question, asked: boolean, elements: Rect[]): void {
  const middle = rect.height === 1 ? 0 : 1;
  for (let y = 0; y < rect.height; y++) {
    const text = y === middle && asked ? line : ' '.repeat(rect.width);
    for (let x = 0; x < rect.width; x++) {
      if (!asked && within(elements, rect.left + x, rect.top + y)) continue;
      grid.put(rect.left + x, rect.top + y, text[x], GIVE_UP_COLOR, asked);
    }
  }
}

function blankExcept(grid: TextGrid, rect: Rect, kept: Rect): void {
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) if (!within([kept], x, y)) grid.put(x, y, ' ');
  }
}

// True when the give-up question is on the grid after this call.
export function drawHud(grid: TextGrid, { speed, topSpeed, minimap, race }: HudValues): boolean {
  const left = grid.columns - MARGIN - PANEL_WIDTH;
  const top = grid.rows - MARGIN - PANEL_HEIGHT;
  const elements: Element[] = [];
  if (left >= 0 && top >= 0) {
    elements.push({ rect: { left, top, width: PANEL_WIDTH, height: PANEL_HEIGHT }, draw: () => drawSpeedometer(grid, left, top, speed, topSpeed) });
    if (minimap) {
      // The map never takes the timer's place (free driving and screens without a timer reserve it too), nor the
      // speedometer's: only a scale beside the speedometer with a margin between them, and clear of the timer.
      const timer = timerRect(grid);
      const keepTimer = inside(grid, timer) && apart(timer, elements[0].rect);
      const roomFor = (width: number, height: number) =>
        grid.rows - MARGIN - height >= 0 && (!keepTimer || apart(timer, { left: MARGIN, top: grid.rows - MARGIN - height, width, height }));
      if (fitMinimap(minimap.minimap, grid.rows, left - 2 * MARGIN, roomFor)) {
        const { width, height } = minimap.minimap.layout;
        const mapTop = grid.rows - MARGIN - height;
        const route = race ? { route: race.race.route, nextGate: race.race.nextGate } : null;
        elements.push({ rect: { left: MARGIN, top: mapTop, width, height }, draw: () => drawMinimap(grid, minimap.minimap, MARGIN, mapTop, minimap.car, route) });
      }
    }
    if (race) elements.push(...raceElements(grid, race, elements.map(({ rect }) => rect)));
  }
  const question = race?.giveUp === undefined ? null : questionPlace(grid, elements.map(({ rect }) => rect));
  const asked = race?.giveUp === true;
  for (const element of elements) {
    if (question?.over && asked && overlaps(element.rect, question.rect)) blankExcept(grid, element.rect, question.rect);
    else element.draw();
  }
  if (question) drawQuestion(grid, question, asked, elements.map(({ rect }) => rect));
  return question !== null && asked;
}

function drawSpeedometer(grid: TextGrid, left: number, top: number, speed: number, topSpeed: number): void {
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
