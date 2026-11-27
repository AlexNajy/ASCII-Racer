import { GAME_NAME } from '../app/gameName.ts';
import { entryEnabled, MENU_ENTRIES } from '../app/mainMenu.ts';
import { blockRows } from './blockFont.ts';
import { FRAME_COLOR } from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// A screen of the main menu's kind: a title in big characters on a solid block, and under it entries in a framed
// list, the selected one between markers. The main menu and the finish screen are both one. Every cell of both is
// written each call, so the same selection leaves the grid clean.
export interface ListEntry {
  label: string;
  enabled: boolean; // dimmed when not
}

export interface ListScreen {
  title: string; // drawn in the block font
  smallTitle: string; // the title as one line of text, for small grids
  titleColor: number;
  entries: readonly ListEntry[];
}

const TITLE = GAME_NAME.toUpperCase();
const TITLE_COLOR = 0xffd070;
export const ENTRY_COLOR = 0xd0d0d0;
export const SELECTED_COLOR = 0xffd070;
export const DIMMED_COLOR = 0x606060;
const TITLE_BACKING_COLUMNS = 2; // solid cells around the title's characters
export const TITLE_BACKING_ROWS = 1;
export const TITLE_GAP = 2; // rows at least between the title and the list
export const MARGIN = 1; // cells kept free at the grid's edges
export const MARKER_LEFT = '>';
export const MARKER_RIGHT = '<';
export const ENTRY_PADDING = 3; // cells between the frame and a marker

function labelWidth(entries: readonly ListEntry[]): number {
  return Math.max(...entries.map((entry) => entry.label.length));
}

// A marker and a space each side of the label.
function innerWidth(entries: readonly ListEntry[], padding: number): number {
  return 2 * padding + 2 * 2 + labelWidth(entries);
}

const MENU_SCREEN: ListScreen = {
  title: TITLE,
  smallTitle: GAME_NAME,
  titleColor: TITLE_COLOR,
  entries: MENU_ENTRIES.map(({ label }, i) => ({ label, enabled: entryEnabled(i) })),
};
export const LIST_WIDTH = innerWidth(MENU_SCREEN.entries, ENTRY_PADDING) + 2;
// Shares of the rows left free: above the title, and between it and the list, so the middle of the picture, where
// the flight's street meets the horizon, stays clear.
export const ABOVE_TITLE = 0.15;
export const BETWEEN = 0.45;

// Largest first: the first that fits the grid is used.
// Cells are 1.75 times as tall as wide, so the title's strokes are wider than tall in cells to look near square.
export interface ListStyle {
  titleScale: number;
  titleScaleY: number;
  entrySpacing: number;
  compact: boolean; // the last resort: no backing rows, no blank rows in the frame, less padding
}

export const COMPACT_PADDING = 1;
export const COMPACT_TITLE_GAP = 1;
const STYLES: ListStyle[] = [
  { titleScale: 3, titleScaleY: 2, entrySpacing: 2, compact: false },
  { titleScale: 2, titleScaleY: 1, entrySpacing: 2, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 2, compact: false }, // the title as one line of text
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: true },
];

export interface MenuLayout {
  title: string[]; // rows of the title, the backing included ('#' strokes, spaces)
  titleLeft: number;
  titleTop: number;
  listLeft: number;
  listTop: number;
  listWidth: number;
  listHeight: number;
  padding: number; // cells between the frame and a marker
  entryRows: number[]; // grid row of each entry
}

// The title's rows with its backing; scale 0 is the one-line form.
export function titleRows(
  screen: Pick<ListScreen, 'title' | 'smallTitle'>,
  scale: number,
  scaleY: number,
  backingRows = TITLE_BACKING_ROWS,
): string[] {
  const characters = scale === 0 ? [screen.smallTitle] : blockRows(screen.title, scale, scaleY);
  const pad = ' '.repeat(TITLE_BACKING_COLUMNS);
  const blank = ' '.repeat(characters[0].length + 2 * TITLE_BACKING_COLUMNS);
  const backing = Array.from({ length: backingRows }, () => blank);
  return [...backing, ...characters.map((row) => pad + row + pad), ...backing];
}

// Where everything goes on a grid of this size, or null when not even the smallest style fits.
export function listScreenLayout(screen: ListScreen, columns: number, rows: number): MenuLayout | null {
  for (const { titleScale, titleScaleY, entrySpacing, compact } of STYLES) {
    const padding = compact ? COMPACT_PADDING : ENTRY_PADDING;
    const listWidth = innerWidth(screen.entries, padding) + 2;
    const title = titleRows(screen, titleScale, titleScaleY, compact ? 0 : TITLE_BACKING_ROWS);
    const titleWidth = title[0].length;
    const blankRows = compact ? 0 : 1;
    const listHeight = 2 + 2 * blankRows + (screen.entries.length - 1) * entrySpacing + 1;
    const gap = compact ? COMPACT_TITLE_GAP : TITLE_GAP;
    const height = title.length + gap + listHeight;
    if (Math.max(titleWidth, listWidth) + 2 * MARGIN > columns || height + 2 * MARGIN > rows) continue;
    const free = rows - 2 * MARGIN - height;
    const titleTop = MARGIN + Math.floor(free * ABOVE_TITLE);
    const listTop = titleTop + title.length + gap + Math.floor(free * BETWEEN);
    return {
      title,
      titleLeft: Math.floor((columns - titleWidth) / 2),
      titleTop,
      listLeft: Math.floor((columns - listWidth) / 2),
      listTop,
      listWidth,
      listHeight,
      padding,
      entryRows: screen.entries.map((_, i) => listTop + 1 + blankRows + i * entrySpacing),
    };
  }
  return null;
}

export function menuLayout(columns: number, rows: number): MenuLayout | null {
  return listScreenLayout(MENU_SCREEN, columns, rows);
}

// The entry whose row inside the list's frame holds the cell, or null.
export function menuEntryAt(layout: MenuLayout, column: number, row: number): number | null {
  if (column <= layout.listLeft || column >= layout.listLeft + layout.listWidth - 1) return null;
  const index = layout.entryRows.indexOf(row);
  return index < 0 ? null : index;
}

function drawEntry(
  grid: TextGrid,
  left: number,
  row: number,
  entries: readonly ListEntry[],
  index: number,
  selected: boolean,
  padding: number,
): void {
  const color = entries[index].enabled ? (selected ? SELECTED_COLOR : ENTRY_COLOR) : DIMMED_COLOR;
  const label = ` ${entries[index].label.padEnd(labelWidth(entries), ' ')} `;
  const pad = ' '.repeat(padding);
  const options = { color: SELECTED_COLOR, background: true };
  grid.write(left, row, pad, { color, background: true });
  grid.write(left + padding, row, selected ? MARKER_LEFT : ' ', options);
  grid.write(left + padding + 1, row, label, { color, background: true });
  grid.write(left + padding + 1 + label.length, row, selected ? MARKER_RIGHT : ' ', options);
  grid.write(left + padding + 2 + label.length, row, pad, { color, background: true });
}

export function drawListScreen(grid: TextGrid, screen: ListScreen, selected: number): void {
  const layout = listScreenLayout(screen, grid.columns, grid.rows);
  if (!layout) return;
  const { title, titleLeft, titleTop, listLeft, listTop, listWidth, listHeight, padding, entryRows } = layout;
  const inner = listWidth - 2;
  title.forEach((row, y) => grid.write(titleLeft, titleTop + y, row, { color: screen.titleColor, background: true }));
  // Not grid.box: that would write the entry rows twice, and the grid would come out dirty every call.
  const edge = `+${'-'.repeat(inner)}+`;
  for (let y = 0; y < listHeight; y++) {
    const row = listTop + y;
    if (y === 0 || y === listHeight - 1) {
      grid.write(listLeft, row, edge, { color: FRAME_COLOR, background: true });
      continue;
    }
    const index = entryRows.indexOf(row);
    grid.put(listLeft, row, '|', FRAME_COLOR, true);
    if (index < 0) grid.write(listLeft + 1, row, ' '.repeat(inner), { color: FRAME_COLOR, background: true });
    else drawEntry(grid, listLeft + 1, row, screen.entries, index, index === selected, padding);
    grid.put(listLeft + listWidth - 1, row, '|', FRAME_COLOR, true);
  }
}

export function drawMenuScreen(grid: TextGrid, selected: number): void {
  drawListScreen(grid, MENU_SCREEN, selected);
}
