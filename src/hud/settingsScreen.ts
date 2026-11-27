import { KEY_LIST } from '../app/keys.ts';
import { NICKNAME_MAX, NICKNAME_MIN, VOLUME_STEPS, type PlayerSettings } from '../app/settings.ts';
import { ROW_LABELS, SETTINGS_ROWS, settingsValue, type SettingsRow, type SettingsScreen } from '../app/settingsMenu.ts';
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
import type { TextGrid } from './textGrid.ts';

// The settings screen, the menu's kind of screen: the title in big characters, under it one framed panel with the
// settings, a hint line and the key list. Every cell of it is written once per call, so the same view leaves the
// grid clean.
export interface SettingsView {
  screen: SettingsScreen;
  settings: PlayerSettings;
  fullscreen: boolean;
}

const TITLE = { title: 'SETTINGS', smallTitle: 'settings' };
const TITLE_COLOR = 0xffd070;
const HINT_COLOR = 0x909090;
const WARNING_COLOR = 0xff9040;
const ACTION_COLOR = 0x909090;
const EDIT_COLOR = 0xffffff;
const KEYS_HEADING = ' keys ';
const COLUMN_GAP = 3; // cells between a label and its value, a key and its action

const HINTS: Record<SettingsRow, string> = {
  nickname: 'enter  edit      esc  back',
  volume: 'left right  change      esc  back',
  mute: 'enter  switch      esc  back',
  glyphSize: 'left right  change      esc  back',
  fullscreen: 'enter  switch      esc  back',
};
const EDIT_HINT = 'enter  save      esc  cancel';
const TOO_SHORT_HINT = `${NICKNAME_MIN} to ${NICKNAME_MAX} letters, digits or spaces`;
const COMPACT_HINTS: Record<SettingsRow, string> = {
  nickname: 'enter edit  esc back',
  volume: 'left right change  esc back',
  mute: 'enter switch  esc back',
  glyphSize: 'left right change  esc back',
  fullscreen: 'enter switch  esc back',
};
const COMPACT_EDIT_HINT = 'enter save  esc cancel';
const COMPACT_TOO_SHORT_HINT = `${NICKNAME_MIN}-${NICKNAME_MAX} letters, digits, spaces`;
const COMPACT_COLUMN_GAP = 2;

const LABEL_WIDTH = Math.max(...SETTINGS_ROWS.map((row) => ROW_LABELS[row].length));
const VALUE_WIDTH = Math.max(NICKNAME_MAX + 1, VOLUME_STEPS + 2); // the nickname with its cursor, the volume bar
const KEYS_WIDTH = Math.max(...KEY_LIST.map(({ keys }) => keys.length));
const ACTIONS_WIDTH = Math.max(...KEY_LIST.map(({ action }) => action.length));

// Column positions and the panel's width for a style: the compact one has less padding and shorter texts, and the
// wide ones are as wide as the key list only when they show it.
interface Metrics {
  padding: number;
  labelLeft: number;
  valueLeft: number;
  actionLeft: number;
  innerWidth: number;
  panelWidth: number;
  hints: Record<SettingsRow, string>;
  editHint: string;
  tooShortHint: string;
}

function metrics(compact: boolean, keys: boolean): Metrics {
  const padding = compact ? COMPACT_PADDING : ENTRY_PADDING;
  const gap = compact ? COMPACT_COLUMN_GAP : COLUMN_GAP;
  const hints = compact ? COMPACT_HINTS : HINTS;
  const editHint = compact ? COMPACT_EDIT_HINT : EDIT_HINT;
  const tooShortHint = compact ? COMPACT_TOO_SHORT_HINT : TOO_SHORT_HINT;
  const labelLeft = padding + 2; // after the marker and a space
  const valueLeft = labelLeft + LABEL_WIDTH + gap;
  const actionLeft = labelLeft + KEYS_WIDTH + gap;
  const innerWidth = Math.max(
    valueLeft + VALUE_WIDTH + 2 + padding,
    keys ? actionLeft + ACTIONS_WIDTH + padding : 0,
    ...[...Object.values(hints), editHint, tooShortHint].map((hint) => hint.length + 2 * padding),
  );
  return { padding, labelLeft, valueLeft, actionLeft, innerWidth, panelWidth: innerWidth + 2, hints, editHint, tooShortHint };
}

// Largest first: the first that fits the grid is used; the key list goes first, then the title shrinks.
const STYLES: { titleScale: number; titleScaleY: number; entrySpacing: number; keys: boolean; compact: boolean }[] = [
  { titleScale: 3, titleScaleY: 2, entrySpacing: 2, keys: true, compact: false },
  { titleScale: 3, titleScaleY: 2, entrySpacing: 2, keys: false, compact: false },
  { titleScale: 2, titleScaleY: 1, entrySpacing: 2, keys: false, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 2, keys: false, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, keys: false, compact: false },
  { titleScale: 0, titleScaleY: 0, entrySpacing: 1, keys: false, compact: true },
];

type PanelLine = 'frame' | 'blank' | 'hint' | 'keysHeading' | { row: number } | { key: number };

export interface SettingsLayout {
  title: string[];
  titleLeft: number;
  titleTop: number;
  panelLeft: number;
  panelTop: number;
  lines: PanelLine[];
  rowLines: number[]; // grid row of each setting
  valueLeft: number; // grid column where the values start
  keys: boolean; // whether the key list fits
  metrics: Metrics;
}

function panelLines(entrySpacing: number, keys: boolean, compact: boolean): PanelLine[] {
  const lines: PanelLine[] = compact ? ['frame'] : ['frame', 'blank'];
  SETTINGS_ROWS.forEach((_, row) => {
    if (row > 0) for (let i = 1; i < entrySpacing; i++) lines.push('blank');
    lines.push({ row });
  });
  if (compact) lines.push('hint');
  else lines.push('blank', 'hint', 'blank');
  if (keys) lines.push('keysHeading', 'blank', ...KEY_LIST.map((_, key) => ({ key })), 'blank');
  lines.push('frame');
  return lines;
}

// Where everything goes on a grid of this size, or null when not even the smallest style fits.
export function settingsLayout(columns: number, rows: number): SettingsLayout | null {
  for (const { titleScale, titleScaleY, entrySpacing, keys, compact } of STYLES) {
    const sizes = metrics(compact, keys);
    const title = titleRows(TITLE, titleScale, titleScaleY, compact ? 0 : TITLE_BACKING_ROWS);
    const titleWidth = title[0].length;
    const lines = panelLines(entrySpacing, keys, compact);
    const gap = compact ? COMPACT_TITLE_GAP : TITLE_GAP;
    const height = title.length + gap + lines.length;
    if (Math.max(titleWidth, sizes.panelWidth) + 2 * MARGIN > columns || height + 2 * MARGIN > rows) continue;
    const free = rows - 2 * MARGIN - height;
    const titleTop = MARGIN + Math.floor(free * ABOVE_TITLE);
    const panelTop = titleTop + title.length + gap + Math.floor(free * BETWEEN);
    const panelLeft = Math.floor((columns - sizes.panelWidth) / 2);
    const rowLines: number[] = [];
    lines.forEach((line, y) => typeof line === 'object' && 'row' in line && (rowLines[line.row] = panelTop + y));
    return {
      title,
      titleLeft: Math.floor((columns - titleWidth) / 2),
      titleTop,
      panelLeft,
      panelTop,
      lines,
      rowLines,
      valueLeft: panelLeft + 1 + sizes.valueLeft,
      keys,
      metrics: sizes,
    };
  }
  return null;
}

// The setting whose row inside the panel's frame holds the cell, with the column counted from the start of its
// value (negative on the label), or null.
export function settingsRowAt(layout: SettingsLayout, column: number, row: number): { index: number; offset: number } | null {
  if (column <= layout.panelLeft || column >= layout.panelLeft + layout.metrics.panelWidth - 1) return null;
  const index = layout.rowLines.indexOf(row);
  return index < 0 ? null : { index, offset: column - layout.valueLeft };
}

function hint({ screen }: SettingsView, sizes: Metrics): { text: string; color: number } {
  if (screen.editing) {
    return screen.editing.tooShort ? { text: sizes.tooShortHint, color: WARNING_COLOR } : { text: sizes.editHint, color: HINT_COLOR };
  }
  return { text: sizes.hints[SETTINGS_ROWS[screen.selected]], color: HINT_COLOR };
}

// Writes `inner` cells from `left`: spaces, with each piece of text at its offset in its colour.
function writeLine(grid: TextGrid, left: number, row: number, innerWidth: number, pieces: { at: number; text: string; color: number }[]): void {
  let x = 0;
  for (const { at, text, color } of pieces) {
    if (at > x) grid.write(left + x, row, ' '.repeat(at - x), { color, background: true });
    grid.write(left + at, row, text, { color, background: true });
    x = at + text.length;
  }
  if (x < innerWidth) grid.write(left + x, row, ' '.repeat(innerWidth - x), { color: FRAME_COLOR, background: true });
}

function settingLine(view: SettingsView, index: number, sizes: Metrics): { at: number; text: string; color: number }[] {
  const { screen, settings, fullscreen } = view;
  const row = SETTINGS_ROWS[index];
  const selected = index === screen.selected;
  const color = selected ? SELECTED_COLOR : ENTRY_COLOR;
  const editing = selected ? screen.editing : null;
  const value = settingsValue(row, settings, fullscreen, editing);
  return [
    { at: sizes.padding, text: selected ? MARKER_LEFT : ' ', color: SELECTED_COLOR },
    { at: sizes.labelLeft, text: ROW_LABELS[row].padEnd(LABEL_WIDTH, ' '), color },
    { at: sizes.valueLeft, text: value.padEnd(VALUE_WIDTH, ' '), color: editing ? EDIT_COLOR : color },
    { at: sizes.innerWidth - 1 - sizes.padding, text: selected ? MARKER_RIGHT : ' ', color: SELECTED_COLOR },
  ];
}

export function drawSettingsScreen(grid: TextGrid, view: SettingsView): void {
  const layout = settingsLayout(grid.columns, grid.rows);
  if (!layout) return;
  const { title, titleLeft, titleTop, panelLeft, panelTop, lines, metrics: sizes } = layout;
  const { innerWidth } = sizes;
  title.forEach((row, y) => grid.write(titleLeft, titleTop + y, row, { color: TITLE_COLOR, background: true }));
  const inner = panelLeft + 1;
  lines.forEach((line, y) => {
    const row = panelTop + y;
    if (line === 'frame' || line === 'keysHeading') {
      const heading = line === 'keysHeading' ? KEYS_HEADING : '';
      const rule = `${'-'.repeat(sizes.padding)}${heading}`.padEnd(innerWidth, '-');
      grid.write(panelLeft, row, `+${rule}+`, { color: FRAME_COLOR, background: true });
      return;
    }
    grid.put(panelLeft, row, '|', FRAME_COLOR, true);
    if (line === 'blank') writeLine(grid, inner, row, innerWidth, []);
    else if (line === 'hint') {
      const { text, color } = hint(view, sizes);
      writeLine(grid, inner, row, innerWidth, [{ at: Math.floor((innerWidth - text.length) / 2), text, color }]);
    } else if ('row' in line) writeLine(grid, inner, row, innerWidth, settingLine(view, line.row, sizes));
    else {
      const { keys, action } = KEY_LIST[line.key];
      writeLine(grid, inner, row, innerWidth, [
        { at: sizes.labelLeft, text: keys.padEnd(KEYS_WIDTH, ' '), color: ENTRY_COLOR },
        { at: sizes.actionLeft, text: action, color: ACTION_COLOR },
      ]);
    }
    grid.put(panelLeft + sizes.panelWidth - 1, row, '|', FRAME_COLOR, true);
  });
}
