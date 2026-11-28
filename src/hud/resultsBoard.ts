import { bucketOf, RESULT_BUCKETS, type DailyResults } from '../app/dailyResults.ts';
import { FRAME_COLOR, timerText } from './raceHud.ts';

// The daily results' two panels: the day's times as a histogram of glyph bars with the player's bar marked, and the
// top times with the player's own row. Plain rows of coloured text, framed, every row as wide as its panel.

export interface Segment {
  text: string;
  color: number;
}
export type PanelRow = Segment[];

export interface Panel {
  rows: PanelRow[]; // the frame included
  width: number;
}

export const YOU_COLOR = 0xff99ff; // the player's time, bar and row, as the finish banner's time
const BAR_COLOR = 0x40b8e8;
const AXIS_COLOR = 0x707070;
const LABEL_COLOR = 0xb0b0b0;
const HEADING_COLOR = 0xffd070;
const NAME_COLOR = 0xd0d0d0;
const RANK_COLOR = 0x909090;
const EMPTY_COLOR = 0x909090;
const PANEL_PADDING = 2; // cells between the frame and the content
const COMPACT_PANEL_PADDING = 1;
// A bar's top cell: the share of a row it fills, in steps; a full cell is FULL_BAR.
export const BAR_TOPS = ['_', '='];
export const FULL_BAR = '#';
export const BAR_STEPS = BAR_TOPS.length + 1;
export const MARKER = '^ you';
const MARKER_LEFT = 'you ^';
export const NO_RUNS_TEXT = 'no finished runs yet';
export const NO_TIMES_TEXT = 'no times yet';
const MIN_RANK_WIDTH = 3;
export const NAME_WIDTH = 12; // NICKNAME_MAX
export const TIME_WIDTH = 8; // m:ss.mmm
const COLUMN_GAP = 2;
const GAP_ROW = '...';

function segment(text: string, color: number): Segment {
  return { text, color };
}

function blank(width: number): PanelRow {
  return [segment(' '.repeat(width), FRAME_COLOR)];
}

// `text` centred in `width`.
function centred(text: string, width: number, color: number): PanelRow {
  const left = Math.floor((width - text.length) / 2);
  return [segment(' '.repeat(left) + text.padEnd(width - left, ' '), color)];
}

// A frame round `inner` (rows of inner width), its heading set into the top edge.
function framed(heading: string, inner: PanelRow[], width: number): Panel {
  const label = ` ${heading} `;
  const top: PanelRow = [segment('+-', FRAME_COLOR), segment(label, HEADING_COLOR), segment(`${'-'.repeat(width - 3 - label.length)}+`, FRAME_COLOR)];
  const sides = inner.map((row): PanelRow => [segment('|', FRAME_COLOR), ...row, segment('|', FRAME_COLOR)]);
  return { rows: [top, ...sides, [segment(`+${'-'.repeat(width - 2)}+`, FRAME_COLOR)]], width };
}

// The panel made `height` rows tall with blank rows over its bottom edge.
export function padPanel(panel: Panel, height: number): Panel {
  if (panel.rows.length >= height) return panel;
  const filler = Array.from({ length: height - panel.rows.length }, (): PanelRow => [segment('|', FRAME_COLOR), ...blank(panel.width - 2), segment('|', FRAME_COLOR)]);
  return { ...panel, rows: [...panel.rows.slice(0, -1), ...filler, panel.rows[panel.rows.length - 1]] };
}

// Each bucket's bar in steps of BAR_STEPS per row, the tallest `rows` rows; a bucket with a run in it is never empty.
export function barUnits(counts: readonly number[], rows: number): number[] {
  const tallest = Math.max(1, ...counts);
  return counts.map((n) => (n === 0 ? 0 : Math.max(1, Math.round((n * rows * BAR_STEPS) / tallest))));
}

// The bar's character in row `fromBottom` (0 the lowest).
function barCell(units: number, fromBottom: number): string {
  const full = Math.floor(units / BAR_STEPS);
  if (fromBottom < full) return FULL_BAR;
  if (fromBottom === full && units % BAR_STEPS > 0) return BAR_TOPS[(units % BAR_STEPS) - 1];
  return ' ';
}

export interface HistogramStyle {
  bucketColumns: number; // columns per bucket: 3, 2, 1 or 0.5 (two buckets per column)
  barRows: number;
  compact: boolean;
}

// Days with fewer runs than this draw neighbouring buckets summed in pairs: a few hundred runs in 48 buckets are
// mostly noise, in 24 they read as a curve.
export const SMOOTH_BELOW = 1000;

// Buckets summed into one bar.
export function bucketsPerBar(count: number, bucketColumns: number): number {
  return Math.max(bucketColumns < 1 ? 2 : 1, count < SMOOTH_BELOW ? 2 : 1);
}

// The 48 buckets as drawn, `merge` neighbours summed into each bar.
export function shownBuckets(counts: readonly number[], merge: number): number[] {
  return Array.from({ length: counts.length / merge }, (_, i) => counts.slice(i * merge, (i + 1) * merge).reduce((sum, n) => sum + n, 0));
}

export function histogramWidth({ bucketColumns, compact }: Pick<HistogramStyle, 'bucketColumns' | 'compact'>): number {
  return RESULT_BUCKETS * bucketColumns + 2 * (compact ? COMPACT_PANEL_PADDING : PANEL_PADDING) + 2;
}

export function histogramHeight({ barRows, compact }: Pick<HistogramStyle, 'barRows' | 'compact'>): number {
  return barRows + 3 + (compact ? 0 : 2) + 2; // axis, marker, labels; blank rows; frame
}

function axisLabel(ticks: number): string {
  return timerText(ticks).slice(0, -2); // tenths of a second, rounded down
}

export function playersText(count: number): string {
  return count === 1 ? '1 player' : `${count} players`;
}

export function histogramPanel(results: DailyResults, style: HistogramStyle): Panel {
  const { bucketColumns, barRows, compact } = style;
  const merge = bucketsPerBar(results.count, bucketColumns);
  const columns = bucketColumns * merge;
  const width = histogramWidth(style);
  const inner = width - 2;
  const pad = compact ? COMPACT_PANEL_PADDING : PANEL_PADDING;
  const bars = inner - 2 * pad;
  const rows: PanelRow[] = compact ? [] : [blank(inner)];
  const { histogram } = results;
  if (!histogram) {
    for (let y = 0; y < barRows + 3; y++) rows.push(y === Math.floor(barRows / 2) ? centred(NO_RUNS_TEXT, inner, EMPTY_COLOR) : blank(inner));
  } else {
    const buckets = shownBuckets(histogram.counts, merge);
    const units = barUnits(buckets, barRows);
    const own = results.own ? bucketOf(histogram, results.own.ticks) : null;
    const ownShown = own === null ? null : Math.floor(own / merge);
    const side = segment(' '.repeat(pad), FRAME_COLOR);
    for (let y = barRows - 1; y >= 0; y--) {
      const row: PanelRow = [side];
      buckets.forEach((_, i) => row.push(segment(barCell(units[i], y).repeat(columns), i === ownShown ? YOU_COLOR : BAR_COLOR)));
      row.push(side);
      rows.push(row);
    }
    rows.push([side, segment('-'.repeat(bars), AXIS_COLOR), side]);
    let marker = ' '.repeat(bars);
    if (ownShown !== null) {
      const at = ownShown * columns + Math.floor((columns - 1) / 2);
      const text = at + MARKER.length <= bars ? MARKER : MARKER_LEFT;
      const start = text === MARKER ? at : at - MARKER.length + 1;
      marker = marker.slice(0, start) + text + marker.slice(start + text.length);
    }
    rows.push([side, segment(marker, YOU_COLOR), side]);
    const left = axisLabel(histogram.from);
    const right = `${axisLabel(histogram.to)}+`;
    rows.push([side, segment(left + right.padStart(bars - left.length, ' '), LABEL_COLOR), side]);
  }
  if (!compact) rows.push(blank(inner));
  return framed(playersText(results.count), rows, width);
}

export interface TopStyle {
  topRows: number;
  compact: boolean;
}

// The rank column is as wide as the largest rank shown.
function rankWidth(results: DailyResults): number {
  return Math.max(MIN_RANK_WIDTH, ...results.top.map(({ rank }) => String(rank).length), String(results.own?.rank ?? '').length);
}

export function topWidth(results: DailyResults, compact: boolean): number {
  return rankWidth(results) + NAME_WIDTH + TIME_WIDTH + 2 * COLUMN_GAP + 2 * (compact ? COMPACT_PANEL_PADDING : PANEL_PADDING) + 2;
}

function timeRow(rank: number, nickname: string, ticks: number, own: boolean, width: number, pad: number): PanelRow {
  const gap = ' '.repeat(COLUMN_GAP);
  const side = segment(' '.repeat(pad), FRAME_COLOR);
  return [
    side,
    segment(String(rank).padStart(width, ' ') + gap, own ? YOU_COLOR : RANK_COLOR),
    segment(nickname.slice(0, NAME_WIDTH).padEnd(NAME_WIDTH, ' ') + gap, own ? YOU_COLOR : NAME_COLOR),
    segment(timerText(ticks).padStart(TIME_WIDTH, ' '), own ? YOU_COLOR : NAME_COLOR),
    side,
  ];
}

// The first `topRows` times; the player's own row under them after a gap when it isn't among them (nickname from the
// settings, as the run was sent with it).
export function topPanel(results: DailyResults, nickname: string, { topRows, compact }: TopStyle): Panel {
  const width = topWidth(results, compact);
  const inner = width - 2;
  const ranks = rankWidth(results);
  const pad = compact ? COMPACT_PANEL_PADDING : PANEL_PADDING;
  const rows: PanelRow[] = compact ? [] : [blank(inner)];
  const shown = results.top.slice(0, topRows);
  if (shown.length === 0) rows.push(centred(NO_TIMES_TEXT, inner, EMPTY_COLOR));
  for (const row of shown) rows.push(timeRow(row.rank, row.nickname, row.ticks, row.own, ranks, pad));
  if (results.own && !shown.some((row) => row.own)) {
    rows.push(centred(GAP_ROW, inner, RANK_COLOR));
    rows.push(timeRow(results.own.rank, nickname, results.own.ticks, true, ranks, pad));
  }
  if (!compact) rows.push(blank(inner));
  return framed('top times', rows, width);
}

// Rows the top panel takes at most with this many top rows: the own row and its gap included.
export function topHeight({ topRows, compact }: TopStyle): number {
  return topRows + 2 + (compact ? 0 : 2) + 2;
}
