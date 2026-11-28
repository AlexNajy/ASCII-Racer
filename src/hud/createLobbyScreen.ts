import {
  LOBBY_ROW_LABELS,
  LOBBY_ROWS,
  LOBBY_VALUE_WIDTH,
  lobbyValue,
  type CreateLobbyScreen,
  type LobbyRow,
} from '../app/createLobbyMenu.ts';
import { LOBBY_SEED_MAX } from '../game/lobbySettings.ts';
import {
  ABOVE_TITLE,
  BETWEEN,
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

// The create lobby screen, the settings screen's kind: the title in big characters and one framed panel with the
// rows and a hint line. Every cell of it is written once per call, so the same view leaves the grid clean.
export type CreateLobbyView = CreateLobbyScreen;

const TITLE = { title: 'CREATE LOBBY', smallTitle: 'create lobby' };
const TITLE_COLOR = 0xffd070;
const HINT_COLOR = 0x909090;
const WARNING_COLOR = 0xff9040;
const EDIT_COLOR = 0xffffff;
const COLUMN_GAP = 3;
const COMPACT_COLUMN_GAP = 2;

const HINTS: Record<LobbyRow, string> = {
  seed: 'enter  type a seed      esc  back',
  size: 'left right  change: 6x6, 8x8 or 10x10 blocks',
  downtown: 'left right  change: how far tall buildings reach',
  avenues: 'left right  change: how many wide roads',
  routeLength: 'left right  change: races of 1250, 1800, 2500 m',
  create: 'enter  create the lobby      esc  back',
};
const COMPACT_HINTS: Record<LobbyRow, string> = {
  seed: 'enter type  esc back',
  size: 'left right: 6, 8 or 10 blocks',
  downtown: 'left right: tall buildings',
  avenues: 'left right: wide roads',
  routeLength: 'left right: race length',
  create: 'enter create  esc back',
};
const EDIT_HINT = 'enter  save (empty: random)      esc  cancel';
const INVALID_HINT = `1 to ${LOBBY_SEED_MAX}, or nothing for random`;
const COMPACT_EDIT_HINT = 'enter save  esc cancel';
const COMPACT_INVALID_HINT = `1-${LOBBY_SEED_MAX}, or none`;

const LABEL_WIDTH = Math.max(...LOBBY_ROWS.map((row) => LOBBY_ROW_LABELS[row].length));

interface Metrics {
  padding: number;
  labelLeft: number;
  valueLeft: number;
  innerWidth: number;
  panelWidth: number;
  hints: Record<LobbyRow, string>;
  editHint: string;
  invalidHint: string;
}

function metrics(compact: boolean): Metrics {
  const padding = compact ? COMPACT_PADDING : ENTRY_PADDING;
  const hints = compact ? COMPACT_HINTS : HINTS;
  const editHint = compact ? COMPACT_EDIT_HINT : EDIT_HINT;
  const invalidHint = compact ? COMPACT_INVALID_HINT : INVALID_HINT;
  const labelLeft = padding + 2; // after the marker and a space
  const valueLeft = labelLeft + LABEL_WIDTH + (compact ? COMPACT_COLUMN_GAP : COLUMN_GAP);
  const innerWidth = Math.max(
    valueLeft + LOBBY_VALUE_WIDTH + 2 + padding,
    ...[...Object.values(hints), editHint, invalidHint].map((hint) => hint.length + 2 * padding),
  );
  return { padding, labelLeft, valueLeft, innerWidth, panelWidth: innerWidth + 2, hints, editHint, invalidHint };
}

// Largest first: the first that fits the grid is used; the title shrinks first.
const STYLES: { titleScale: number; titleScaleY: number; entrySpacing: number; compact: boolean }[] = [
  { titleScale: 3, titleScaleY: 2, entrySpacing: 2, compact: false },
  { titleScale: 2, titleScaleY: 1, entrySpacing: 2, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 2, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, compact: true },
];

type PanelLine = 'frame' | 'blank' | 'hint' | { row: number };

export interface CreateLobbyLayout {
  title: string[];
  titleLeft: number;
  titleTop: number;
  panelLeft: number;
  panelTop: number;
  lines: PanelLine[];
  rowLines: number[]; // grid row of each setting
  valueLeft: number; // grid column where the values start
  metrics: Metrics;
}

function panelLines(entrySpacing: number, compact: boolean): PanelLine[] {
  const lines: PanelLine[] = compact ? ['frame'] : ['frame', 'blank'];
  LOBBY_ROWS.forEach((_, row) => {
    if (row > 0) for (let i = 1; i < entrySpacing; i++) lines.push('blank');
    lines.push({ row });
  });
  if (compact) lines.push('hint');
  else lines.push('blank', 'hint', 'blank');
  lines.push('frame');
  return lines;
}

// Where everything goes on a grid of this size, or null when not even the smallest style fits.
export function createLobbyLayout(columns: number, rows: number): CreateLobbyLayout | null {
  for (const { titleScale, titleScaleY, entrySpacing, compact } of STYLES) {
    const sizes = metrics(compact);
    const title = titleRows(TITLE, titleScale, titleScaleY, compact ? 0 : TITLE_BACKING_ROWS);
    const lines = panelLines(entrySpacing, compact);
    const gap = compact ? COMPACT_TITLE_GAP : TITLE_GAP;
    const height = title.length + gap + lines.length;
    if (Math.max(title[0].length, sizes.panelWidth) + 2 * MARGIN > columns || height + 2 * MARGIN > rows) continue;
    const free = rows - 2 * MARGIN - height;
    const titleTop = MARGIN + Math.floor(free * ABOVE_TITLE);
    const panelTop = titleTop + title.length + gap + Math.floor(free * BETWEEN);
    const panelLeft = Math.floor((columns - sizes.panelWidth) / 2);
    const rowLines: number[] = [];
    lines.forEach((line, y) => typeof line === 'object' && (rowLines[line.row] = panelTop + y));
    return {
      title,
      titleLeft: Math.floor((columns - title[0].length) / 2),
      titleTop,
      panelLeft,
      panelTop,
      lines,
      rowLines,
      valueLeft: panelLeft + 1 + sizes.valueLeft,
      metrics: sizes,
    };
  }
  return null;
}

// The row whose line inside the panel's frame holds the cell, with the column counted from the start of its value
// (negative on the label), or null.
export function createLobbyRowAt(layout: CreateLobbyLayout, column: number, row: number): { index: number; offset: number } | null {
  if (column <= layout.panelLeft || column >= layout.panelLeft + layout.metrics.panelWidth - 1) return null;
  const index = layout.rowLines.indexOf(row);
  return index < 0 ? null : { index, offset: column - layout.valueLeft };
}

function hint({ selected, editing }: CreateLobbyView, sizes: Metrics): { text: string; color: number } {
  if (editing) return editing.invalid ? { text: sizes.invalidHint, color: WARNING_COLOR } : { text: sizes.editHint, color: HINT_COLOR };
  return { text: sizes.hints[LOBBY_ROWS[selected]], color: HINT_COLOR };
}

function rowLine(view: CreateLobbyView, index: number, sizes: Metrics): { at: number; text: string; color: number }[] {
  const row = LOBBY_ROWS[index];
  const selected = index === view.selected;
  const color = selected ? SELECTED_COLOR : ENTRY_COLOR;
  const editing = selected && row === 'seed' ? view.editing : null;
  return [
    { at: sizes.padding, text: selected ? MARKER_LEFT : ' ', color: SELECTED_COLOR },
    { at: sizes.labelLeft, text: LOBBY_ROW_LABELS[row].padEnd(LABEL_WIDTH, ' '), color },
    { at: sizes.valueLeft, text: lobbyValue(row, view.draft, editing).padEnd(LOBBY_VALUE_WIDTH, ' '), color: editing ? EDIT_COLOR : color },
    { at: sizes.innerWidth - 1 - sizes.padding, text: selected ? MARKER_RIGHT : ' ', color: SELECTED_COLOR },
  ];
}

export function drawCreateLobbyScreen(grid: TextGrid, view: CreateLobbyView): void {
  const layout = createLobbyLayout(grid.columns, grid.rows);
  if (!layout) return;
  const { title, titleLeft, titleTop, panelLeft, panelTop, lines, metrics: sizes } = layout;
  const { innerWidth } = sizes;
  title.forEach((row, y) => grid.write(titleLeft, titleTop + y, row, { color: TITLE_COLOR, background: true }));
  const inner = panelLeft + 1;
  lines.forEach((line, y) => {
    const row = panelTop + y;
    if (line === 'frame') {
      grid.write(panelLeft, row, `+${'-'.repeat(innerWidth)}+`, { color: FRAME_COLOR, background: true });
      return;
    }
    grid.put(panelLeft, row, '|', FRAME_COLOR, true);
    if (line === 'blank') writeLine(grid, inner, row, innerWidth, []);
    else if (line === 'hint') {
      const { text, color } = hint(view, sizes);
      writeLine(grid, inner, row, innerWidth, [{ at: Math.floor((innerWidth - text.length) / 2), text, color }]);
    } else writeLine(grid, inner, row, innerWidth, rowLine(view, line.row, sizes));
    grid.put(panelLeft + sizes.panelWidth - 1, row, '|', FRAME_COLOR, true);
  });
}
