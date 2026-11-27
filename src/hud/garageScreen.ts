import { CHOICE_WIDTH, GARAGE_LABELS, GARAGE_ROWS, garageValue } from '../app/garageMenu.ts';
import type { PlayerSettings } from '../app/settings.ts';
import {
  COMPACT_PADDING,
  COMPACT_TITLE_GAP,
  ENTRY_COLOR,
  ENTRY_PADDING,
  MARGIN,
  MARKER_LEFT,
  MARKER_RIGHT,
  SELECTED_COLOR,
  TITLE_BACKING_ROWS,
  TITLE_GAP,
  titleRows,
} from './menuScreen.ts';
import { FRAME_COLOR } from './raceHud.ts';
import { writeLine } from './settingsScreen.ts';
import type { TextGrid } from './textGrid.ts';

// The garage: the title in big characters at the top and one framed panel at the bottom, so the turning car in the
// middle of the picture stays clear. Every cell of both is written once per call, so the same view leaves the grid
// clean.
export interface GarageView {
  selected: number; // index into GARAGE_ROWS
  settings: PlayerSettings;
}

const TITLE = { title: 'GARAGE', smallTitle: 'garage' };
const TITLE_COLOR = 0xffd070;
const HINT_COLOR = 0x909090;
const HINT = 'up down  choose    left right  change    esc  back';
const COMPACT_HINT = 'left right change  esc back';
const COLUMN_GAP = 3; // cells between a label and its value
const COMPACT_COLUMN_GAP = 2;
const LABEL_WIDTH = Math.max(...GARAGE_ROWS.map((row) => GARAGE_LABELS[row].length));
const VALUE_WIDTH = CHOICE_WIDTH + 4; // the name between '< ' and ' >'

// Largest first: the first that fits the grid is used.
const STYLES: { titleScale: number; titleScaleY: number; entrySpacing: number; compact: boolean }[] = [
  { titleScale: 3, titleScaleY: 2, entrySpacing: 2, compact: false },
  { titleScale: 2, titleScaleY: 1, entrySpacing: 2, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 2, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: true },
];

type PanelLine = 'frame' | 'blank' | 'hint' | { row: number };

export interface GarageLayout {
  title: string[];
  titleLeft: number;
  titleTop: number;
  panelLeft: number;
  panelTop: number;
  panelWidth: number;
  lines: PanelLine[];
  rowLines: number[]; // grid row of each garage row
  valueLeft: number; // grid column where the values start
  padding: number;
  labelLeft: number; // inside the frame
  innerValueLeft: number;
  hint: string;
}

function panelLines(entrySpacing: number, compact: boolean): PanelLine[] {
  const lines: PanelLine[] = compact ? ['frame'] : ['frame', 'blank'];
  GARAGE_ROWS.forEach((_, row) => {
    if (row > 0) for (let i = 1; i < entrySpacing; i++) lines.push('blank');
    lines.push({ row });
  });
  if (compact) lines.push('hint', 'frame');
  else lines.push('blank', 'hint', 'frame');
  return lines;
}

// Where everything goes on a grid of this size, or null when not even the smallest style fits.
export function garageLayout(columns: number, rows: number): GarageLayout | null {
  for (const { titleScale, titleScaleY, entrySpacing, compact } of STYLES) {
    const padding = compact ? COMPACT_PADDING : ENTRY_PADDING;
    const hint = compact ? COMPACT_HINT : HINT;
    const labelLeft = padding + 2; // after the marker and a space
    const innerValueLeft = labelLeft + LABEL_WIDTH + (compact ? COMPACT_COLUMN_GAP : COLUMN_GAP);
    const innerWidth = Math.max(innerValueLeft + VALUE_WIDTH + 2 + padding, hint.length + 2 * padding);
    const panelWidth = innerWidth + 2;
    const title = titleRows(TITLE, titleScale, titleScaleY, compact ? 0 : TITLE_BACKING_ROWS);
    const lines = panelLines(entrySpacing, compact);
    const gap = compact ? COMPACT_TITLE_GAP : TITLE_GAP;
    if (Math.max(title[0].length, panelWidth) + 2 * MARGIN > columns || title.length + gap + lines.length + 2 * MARGIN > rows) continue;
    const panelTop = rows - MARGIN - lines.length;
    const panelLeft = Math.floor((columns - panelWidth) / 2);
    const rowLines: number[] = [];
    lines.forEach((line, y) => typeof line === 'object' && (rowLines[line.row] = panelTop + y));
    return {
      title,
      titleLeft: Math.floor((columns - title[0].length) / 2),
      titleTop: MARGIN,
      panelLeft,
      panelTop,
      panelWidth,
      lines,
      rowLines,
      valueLeft: panelLeft + 1 + innerValueLeft,
      padding,
      labelLeft,
      innerValueLeft,
      hint,
    };
  }
  return null;
}

// The garage row whose line inside the panel's frame holds the cell, with the column counted from the start of its
// value (negative on the label), or null.
export function garageRowAt(layout: GarageLayout, column: number, row: number): { index: number; offset: number } | null {
  if (column <= layout.panelLeft || column >= layout.panelLeft + layout.panelWidth - 1) return null;
  const index = layout.rowLines.indexOf(row);
  return index < 0 ? null : { index, offset: column - layout.valueLeft };
}

export function drawGarageScreen(grid: TextGrid, { selected, settings }: GarageView): void {
  const layout = garageLayout(grid.columns, grid.rows);
  if (!layout) return;
  const { title, titleLeft, titleTop, panelLeft, panelTop, panelWidth, lines, padding, labelLeft, innerValueLeft, hint } = layout;
  const innerWidth = panelWidth - 2;
  title.forEach((row, y) => grid.write(titleLeft, titleTop + y, row, { color: TITLE_COLOR, background: true }));
  lines.forEach((line, y) => {
    const row = panelTop + y;
    if (line === 'frame') {
      grid.write(panelLeft, row, `+${'-'.repeat(innerWidth)}+`, { color: FRAME_COLOR, background: true });
      return;
    }
    grid.put(panelLeft, row, '|', FRAME_COLOR, true);
    const inner = panelLeft + 1;
    if (line === 'blank') writeLine(grid, inner, row, innerWidth, []);
    else if (line === 'hint') writeLine(grid, inner, row, innerWidth, [{ at: Math.floor((innerWidth - hint.length) / 2), text: hint, color: HINT_COLOR }]);
    else {
      const isSelected = line.row === selected;
      const color = isSelected ? SELECTED_COLOR : ENTRY_COLOR;
      const name = GARAGE_ROWS[line.row];
      writeLine(grid, inner, row, innerWidth, [
        { at: padding, text: isSelected ? MARKER_LEFT : ' ', color: SELECTED_COLOR },
        { at: labelLeft, text: GARAGE_LABELS[name].padEnd(LABEL_WIDTH, ' '), color },
        { at: innerValueLeft, text: garageValue(name, settings), color },
        { at: innerWidth - 1 - padding, text: isSelected ? MARKER_RIGHT : ' ', color: SELECTED_COLOR },
      ]);
    }
    grid.put(panelLeft + panelWidth - 1, row, '|', FRAME_COLOR, true);
  });
}
