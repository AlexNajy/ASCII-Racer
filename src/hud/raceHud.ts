import { TICKS_PER_SECOND } from '../game/clock.ts';
import { countdownShown, formatRaceTime, raceTicks, type Race } from '../game/race.ts';
import { blockRows, blockWidth } from './blockFont.ts';
import type { Guidance } from './guidance.ts';
import type { TextGrid } from './textGrid.ts';

// The race's part of the HUD: the timer with the checkpoint count at the top centre, the guidance to its right, out
// of the line of sight where the next gate's beam stands, and the banner (countdown, finish) under the timer. Each
// element owns a fixed rectangle and writes every cell of it once per call, blank and see-through when it has
// nothing to show, so the same state leaves the grid clean.
export const FRAME_COLOR = 0x5a4a20;
const TIMER_COLOR = 0xf0f0f0;
const COUNT_COLOR = 0xc0ff40;
const LABEL_COLOR = 0xa08040;
const TURN_COLOR = 0x40d8ff; // the route's colour on the minimap
const GATE_COLOR = 0xc0ff40;
const BEARING_COLOR = 0xff9040;
const COUNTDOWN_COLOR = 0xffd070;
const GO_COLOR = 0xc0ff40;
const FINISH_WORD_COLOR = 0xffffff;
const FINISH_TIME_COLOR = 0xff99ff;

const PADDING = 1; // cells between a frame and its contents, sides only
const TIMER_TEXT = '0:00.000';
const MAX_SHOWN_TICKS = 10 * 60 * 60 - 1; // the timer has one minutes digit: 9:59.983 at most
const TIMER_DIGITS_WIDTH = blockWidth(TIMER_TEXT);
export const TIMER_WIDTH = TIMER_DIGITS_WIDTH + 2 * PADDING + 2;
// Frame, digits, frame with the count in it.
export const TIMER_HEIGHT = 5 + 2;

const ARROW_WIDTH = 7;
const ARROW_GAP = 2;
const LABEL_WIDTH = 9;
export const ARROW_PANEL_WIDTH = 2 + 2 * PADDING + ARROW_WIDTH + ARROW_GAP + LABEL_WIDTH;
export const ARROW_PANEL_HEIGHT = 5 + 2;
const MAX_DISTANCE = 9999; // m
// The gate ahead on this leg: its beam already marks it, so only a one-row readout beside the timer's middle row.
const READOUT_ROW = 3;
const READOUT_DISTANCE_WIDTH = `${MAX_DISTANCE} m`.length;
const ARROWS = {
  left: ['..#....', '.##....', '#######', '.##....', '..#....'],
  right: ['....#..', '....##.', '#######', '....##.', '....#..'],
  up: ['...#...', '..###..', '.#.#.#.', '...#...', '...#...'],
  down: ['...#...', '...#...', '.#.#.#.', '..###..', '...#...'],
};

const BANNER_SCALE = 2;
const BANNER_BACKING_COLUMNS = 2; // solid cells around the banner's characters on every side
const BANNER_BACKING_ROWS = 1;
const BANNER_LINE_GAP = 1; // rows between the word and the time
const FINISH_WORD = 'FINISH';
const BANNER_CHARACTERS_HEIGHT = 5 * BANNER_SCALE;
export const BANNER_WIDTH = blockWidth(TIMER_TEXT, BANNER_SCALE) + 2 * BANNER_BACKING_COLUMNS;
export const BANNER_HEIGHT = 2 * BANNER_CHARACTERS_HEIGHT + BANNER_LINE_GAP + 2 * BANNER_BACKING_ROWS;
// The finish banner shows this long from the finish tick; after it only the frozen time in the timer stays.
export const FINISH_SHOWN_TICKS = 5 * TICKS_PER_SECOND;

interface Cell {
  char: string;
  color: number;
  background: boolean;
}

type Cells = Cell[][];

function blank(width: number, height: number): Cells {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: ' ', color: 0, background: false })));
}

// A +-| frame with a solid inside, like the speedometer's.
function framed(width: number, height: number): Cells {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const edgeX = x === 0 || x === width - 1;
      const edgeY = y === 0 || y === height - 1;
      return { char: edgeX && edgeY ? '+' : edgeY ? '-' : edgeX ? '|' : ' ', color: FRAME_COLOR, background: true };
    }),
  );
}

// Text into the cells from (x, y); '#' and other non-space characters always, spaces only when `spaces`.
function stamp(cells: Cells, x: number, y: number, rows: string[], color: number, spaces = true): void {
  rows.forEach((row, dy) => {
    [...row].forEach((char, dx) => {
      const cell = cells[y + dy]?.[x + dx];
      if (!cell || (char === ' ' && !spaces)) return;
      cell.char = char;
      cell.color = color;
    });
  });
}

function flush(grid: TextGrid, left: number, top: number, cells: Cells): void {
  cells.forEach((row, y) => row.forEach((cell, x) => grid.put(left + x, top + y, cell.char, cell.color, cell.background)));
}

export function timerText(ticks: number): string {
  return formatRaceTime(Math.min(MAX_SHOWN_TICKS, Math.max(0, ticks)));
}

// The gates passed over all of them, the finish included, padded so the width never changes.
export function countText(passed: number, total: number): string {
  const digits = String(total).length;
  return `GATE ${String(passed).padStart(digits, ' ')}/${total}`;
}

export function drawTimer(grid: TextGrid, left: number, top: number, ticks: number, passed: number, total: number): void {
  const cells = framed(TIMER_WIDTH, TIMER_HEIGHT);
  stamp(cells, 1 + PADDING, 1, blockRows(timerText(ticks)), TIMER_COLOR);
  const count = ` ${countText(passed, total)} `;
  stamp(cells, Math.floor((TIMER_WIDTH - count.length) / 2), TIMER_HEIGHT - 1, [count], COUNT_COLOR);
  flush(grid, left, top, cells);
}

function distanceText(metres: number): string {
  return `${Math.min(MAX_DISTANCE, Math.round(metres))} m`;
}

function arrowContent(guidance: Exclude<Guidance, { kind: 'gate' }>): { arrow: string[]; label: string; color: number } {
  if (guidance.kind === 'turn') {
    const { turn } = guidance;
    if (turn === 'left') return { arrow: ARROWS.left, label: 'LEFT', color: TURN_COLOR };
    if (turn === 'right') return { arrow: ARROWS.right, label: 'RIGHT', color: TURN_COLOR };
    return { arrow: ARROWS.down, label: 'TURN BACK', color: TURN_COLOR };
  }
  const arrow = { ahead: ARROWS.up, left: ARROWS.left, right: ARROWS.right, back: ARROWS.down }[guidance.bearing];
  return { arrow, label: 'TO GATE', color: BEARING_COLOR };
}

// The arrow panel: the arrow, what it means and the distance; for the gate ahead only the readout row. Nothing
// (see-through) without guidance.
export function drawArrow(grid: TextGrid, left: number, top: number, guidance: Guidance | null): void {
  if (!guidance || guidance.kind === 'gate') {
    const cells = blank(ARROW_PANEL_WIDTH, ARROW_PANEL_HEIGHT);
    if (guidance) {
      const readout = ` GATE ${distanceText(guidance.distance).padStart(READOUT_DISTANCE_WIDTH, ' ')} `;
      stamp(cells, 0, READOUT_ROW, [readout], GATE_COLOR);
      for (let x = 0; x < readout.length; x++) cells[READOUT_ROW][x].background = true;
    }
    flush(grid, left, top, cells);
    return;
  }
  const cells = framed(ARROW_PANEL_WIDTH, ARROW_PANEL_HEIGHT);
  const { arrow, label, color } = arrowContent(guidance);
  const x = 1 + PADDING;
  stamp(cells, x, 1, arrow.map((row) => row.replaceAll('.', ' ')), color);
  const textX = x + ARROW_WIDTH + ARROW_GAP;
  stamp(cells, textX, 2, [label.padEnd(LABEL_WIDTH, ' ')], LABEL_COLOR);
  stamp(cells, textX, 4, [distanceText(guidance.distance).padStart(LABEL_WIDTH, ' ')], color);
  flush(grid, left, top, cells);
}

// What the banner under the timer shows: the countdown (3, 2, 1, 0 for go) or, for FINISH_SHOWN_TICKS from the
// finish, the finish with the final time.
export type Banner = { kind: 'countdown'; shown: number } | { kind: 'finish'; ticks: number } | null;

export function raceBanner(race: Race, tick: number): Banner {
  if (race.phase === 'finished') {
    const since = tick - race.finishTick;
    return since >= 0 && since < FINISH_SHOWN_TICKS ? { kind: 'finish', ticks: raceTicks(race, tick) } : null;
  }
  const shown = countdownShown(race, tick);
  return shown === null ? null : { kind: 'countdown', shown };
}

// Big characters on a solid block reaching BANNER_BACKING_COLUMNS and _ROWS past them on every side, so the scene
// doesn't touch the strokes; the rest of the banner's rectangle stays see-through.
export function drawBanner(grid: TextGrid, left: number, top: number, banner: Banner): void {
  const cells = blank(BANNER_WIDTH, BANNER_HEIGHT);
  const centred = (rows: string[], y: number, color: number) =>
    stamp(cells, Math.floor((BANNER_WIDTH - rows[0].length) / 2), BANNER_BACKING_ROWS + y, rows, color, false);
  if (banner?.kind === 'countdown') {
    const go = banner.shown === 0;
    centred(blockRows(go ? 'GO' : String(banner.shown), BANNER_SCALE), 0, go ? GO_COLOR : COUNTDOWN_COLOR);
  } else if (banner?.kind === 'finish') {
    centred(blockRows(FINISH_WORD, BANNER_SCALE), 0, FINISH_WORD_COLOR);
    centred(blockRows(timerText(banner.ticks), BANNER_SCALE), BANNER_CHARACTERS_HEIGHT + BANNER_LINE_GAP, FINISH_TIME_COLOR);
  }
  let minX = BANNER_WIDTH;
  let maxX = -1;
  let minY = BANNER_HEIGHT;
  let maxY = -1;
  cells.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell.char === ' ') return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }),
  );
  for (let y = Math.max(0, minY - BANNER_BACKING_ROWS); y <= Math.min(BANNER_HEIGHT - 1, maxY + BANNER_BACKING_ROWS); y++) {
    for (let x = Math.max(0, minX - BANNER_BACKING_COLUMNS); x <= Math.min(BANNER_WIDTH - 1, maxX + BANNER_BACKING_COLUMNS); x++) cells[y][x].background = true;
  }
  flush(grid, left, top, cells);
}
