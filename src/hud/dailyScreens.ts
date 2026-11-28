import type { LeaderboardStatus } from '../app/dailyBackend.ts';
import { TICKS_PER_SECOND } from '../game/clock.ts';
import type { Route } from '../game/route.ts';
import { drawListScreen, listScreenLayout, MARGIN, SELECTED_COLOR, titleRows, type ListScreen, type MenuLayout } from './menuScreen.ts';
import { drawMinimap, type Minimap, type MinimapCar } from './minimap.ts';
import { FRAME_COLOR, timerText } from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// The daily's two screens: before its one try (the day, "one try" in big letters, the route on the minimap with a
// marker flying along it) and after it (the time or did not finish, and the countdown to the next daily). Every
// cell of both is written once per call, so the same content leaves the grid clean.

const DAY_COLOR = 0xffd070;
const ONE_TRY_COLOR = 0xff7040;
const TEXT_COLOR = 0xd0d0d0;
const ROUTE_COLOR = 0x40d8ff; // the route's colour on the minimap
const TIME_COLOR = 0xff99ff; // the finish banner's time
const DID_NOT_FINISH_COLOR = 0xc06050;
const DIM_COLOR = 0x909090;
const PANEL_PADDING = 2; // cells between the frame and the longest line
// Flyover: the marker runs from start to finish along the route at this speed, waits on the finish, starts again.
export const FLYOVER_SPEED = 240; // m/s
export const FLYOVER_HOLD_TICKS = TICKS_PER_SECOND;
const ABOVE_STACK = 0.1; // share of the free rows above the pre-race screen's text

export function dayText(day: number): string {
  return `daily #${day}`;
}

// Where the flyover's marker is at `tick`, heading the way the route goes (quarter turns, as the car's glyph).
export function flyoverPose(route: Route, tick: number): MinimapCar {
  const { polyline } = route;
  const { length } = route; // along the polyline, whose pieces run along the axes
  const travelTicks = Math.ceil((length / FLYOVER_SPEED) * TICKS_PER_SECOND);
  const cycle = travelTicks + FLYOVER_HOLD_TICKS;
  let left = Math.min(length, ((((tick % cycle) + cycle) % cycle) * FLYOVER_SPEED) / TICKS_PER_SECOND);
  for (let i = 1; i < polyline.length; i++) {
    const from = polyline[i - 1];
    const to = polyline[i];
    const piece = Math.hypot(to.x - from.x, to.z - from.z);
    if (piece === 0) continue;
    const heading = Math.atan2(from.x - to.x, from.z - to.z);
    if (left <= piece || i === polyline.length - 1) {
      const share = Math.min(1, left / piece);
      return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share, heading };
    }
    left -= piece;
  }
  const end = polyline[polyline.length - 1];
  return { x: end.x, z: end.z, heading: route.pose.heading };
}

// Largest first: the first that fits is used. Scale 0 is a title as one line of text.
interface PreRaceStyle {
  day: [number, number];
  oneTry: [number, number];
  compact: boolean; // no backing rows, no gaps, short lines
}
const PRE_RACE_STYLES: PreRaceStyle[] = [
  { day: [3, 2], oneTry: [3, 2], compact: false },
  { day: [2, 1], oneTry: [3, 2], compact: false },
  { day: [2, 1], oneTry: [2, 1], compact: false },
  { day: [0, 0], oneTry: [2, 1], compact: false },
  { day: [0, 0], oneTry: [0, 0], compact: false },
  { day: [0, 0], oneTry: [0, 0], compact: true },
];

export const START_KEYS = 'enter: start   esc: back';

function routeText(route: Route): string {
  return `${Math.round(route.length)} m   ${route.gates.length} gates`;
}

function panelLines(route: Route, compact: boolean): { text: string; color: number }[] {
  const keys = { text: compact ? 'enter: start  esc: back' : START_KEYS, color: SELECTED_COLOR };
  if (compact) return [{ text: 'used when the countdown starts', color: TEXT_COLOR }, { text: routeText(route), color: ROUTE_COLOR }, keys];
  return [
    { text: 'the try is used the moment the countdown starts', color: TEXT_COLOR },
    { text: 'closing the page or giving up counts as did not finish', color: TEXT_COLOR },
    { text: '', color: TEXT_COLOR },
    { text: routeText(route), color: ROUTE_COLOR },
    { text: '', color: TEXT_COLOR },
    keys,
  ];
}

interface Block {
  rows: string[];
  colors: number[]; // per row
  framed: boolean;
}

export interface PreRaceLayout {
  top: number;
  blocks: { left: number; top: number; block: Block }[];
  width: number;
  height: number;
  minimap: { left: number; top: number } | null;
}

function blocksOf(day: number, route: Route, style: PreRaceStyle): Block[] {
  const backing = style.compact ? 0 : undefined;
  const title = (text: string, small: string, [scale, scaleY]: [number, number], color: number): Block => {
    const rows = titleRows({ title: text, smallTitle: small }, scale, scaleY, backing);
    return { rows, colors: rows.map(() => color), framed: false };
  };
  const lines = panelLines(route, style.compact);
  const inner = Math.max(...lines.map(({ text }) => text.length)) + 2 * PANEL_PADDING;
  const blank = style.compact ? [] : [{ text: '', color: TEXT_COLOR }];
  const panel = [...blank, ...lines, ...blank];
  return [
    title(`DAILY ${day}`, dayText(day), style.day, DAY_COLOR),
    title('ONE TRY', 'ONE TRY', style.oneTry, ONE_TRY_COLOR),
    {
      rows: [
        `+${'-'.repeat(inner)}+`,
        ...panel.map(({ text }) => {
          const left = Math.floor((inner - text.length) / 2);
          return `|${' '.repeat(left)}${text.padEnd(inner - left, ' ')}|`;
        }),
        `+${'-'.repeat(inner)}+`,
      ],
      colors: [FRAME_COLOR, ...panel.map(({ color }) => color), FRAME_COLOR],
      framed: true,
    },
  ];
}

function apart(a: { left: number; top: number; width: number; height: number }, b: typeof a): boolean {
  return a.left + a.width + MARGIN <= b.left || b.left + b.width + MARGIN <= a.left || a.top + a.height + MARGIN <= b.top || b.top + b.height + MARGIN <= a.top;
}

// The text centred near the top, the minimap in the bottom left corner as in the race. The largest style that keeps
// the minimap clear of the text, else the largest that fits without the minimap; null when nothing fits.
export function preRaceLayout(columns: number, rows: number, day: number, route: Route, map: { width: number; height: number } | null): PreRaceLayout | null {
  const place = (style: PreRaceStyle): PreRaceLayout | null => {
    const blocks = blocksOf(day, route, style);
    const gap = style.compact ? 0 : 1;
    const width = Math.max(...blocks.map(({ rows: lines }) => lines[0].length));
    const height = blocks.reduce((sum, { rows: lines }) => sum + lines.length, 0) + gap * (blocks.length - 1);
    if (width + 2 * MARGIN > columns || height + 2 * MARGIN > rows) return null;
    const top = MARGIN + Math.floor((rows - 2 * MARGIN - height) * ABOVE_STACK);
    let y = top;
    const placed = blocks.map((block) => {
      const at = { left: Math.floor((columns - block.rows[0].length) / 2), top: y, block };
      y += block.rows.length + gap;
      return at;
    });
    return { top, blocks: placed, width, height, minimap: null };
  };
  const mapRect = map && { left: MARGIN, top: rows - MARGIN - map.height, width: map.width, height: map.height };
  const mapFits = mapRect !== null && mapRect.top >= MARGIN && mapRect.left + mapRect.width + MARGIN <= columns;
  let fallback: PreRaceLayout | null = null;
  for (const style of PRE_RACE_STYLES) {
    const layout = place(style);
    if (!layout) continue;
    fallback ??= layout;
    if (!mapFits) return layout;
    const text = { left: Math.floor((columns - layout.width) / 2), top: layout.top, width: layout.width, height: layout.height };
    if (apart(text, mapRect)) return { ...layout, minimap: { left: mapRect.left, top: mapRect.top } };
  }
  return fallback;
}

export interface PreRaceScreen {
  day: number;
  route: Route;
  minimap: Minimap;
  tick: number; // for the flyover
}

export function drawPreRaceScreen(grid: TextGrid, { day, route, minimap, tick }: PreRaceScreen): void {
  const { width, height } = minimap.layout;
  const layout = preRaceLayout(grid.columns, grid.rows, day, route, { width, height });
  if (!layout) return;
  for (const { left, top, block } of layout.blocks) {
    block.rows.forEach((row, y) => {
      const color = block.colors[y];
      if (!block.framed || y === 0 || y === block.rows.length - 1) {
        grid.write(left, top + y, row, { color, background: true });
        return;
      }
      grid.put(left, top + y, '|', FRAME_COLOR, true);
      grid.write(left + 1, top + y, row.slice(1, -1), { color, background: true });
      grid.put(left + row.length - 1, top + y, '|', FRAME_COLOR, true);
    });
  }
  if (layout.minimap) drawMinimap(grid, minimap, layout.minimap.left, layout.minimap.top, flyoverPose(route, tick), { route, nextGate: 0 });
}

const MAX_SHOWN_HOURS = 99;
export const READY_TEXT = 'new daily ready';

// hh:mm:ss to the next daily, whole seconds rounded up so it reads 00:00:00 only at zero; at or past zero the new
// daily is ready.
export function countdownText(milliseconds: number): string {
  if (milliseconds <= 0) return READY_TEXT;
  const seconds = Math.min(Math.ceil(milliseconds / 1000), MAX_SHOWN_HOURS * 3600 + 3599);
  const two = (value: number) => String(value).padStart(2, '0');
  return `next daily in ${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
}

export const LEADERBOARD_TEXT = 'leaderboard unavailable';
// The status line under the day: what became of the run on the server. Every state is centred in the same width.
export const LEADERBOARD_STATUS: Record<LeaderboardStatus, { text: string; color: number }> = {
  unavailable: { text: LEADERBOARD_TEXT, color: DIM_COLOR },
  sending: { text: 'sending run...', color: TEXT_COLOR },
  stored: { text: 'run recorded', color: ROUTE_COLOR },
  updateNeeded: { text: 'game updated: reload', color: ONE_TRY_COLOR },
};
const STATUS_WIDTH = Math.max(...Object.values(LEADERBOARD_STATUS).map(({ text }) => text.length));

export function leaderboardLine(status: LeaderboardStatus): { text: string; color: number } {
  const { text, color } = LEADERBOARD_STATUS[status];
  const left = Math.floor((STATUS_WIDTH - text.length) / 2);
  return { text: (' '.repeat(left) + text).padEnd(STATUS_WIDTH, ' '), color };
}
const DID_NOT_FINISH = 'DID NOT FINISH';

// The daily results: the time (or did not finish) where the menu has its title, the day, the leaderboard line and
// the countdown under it, and one entry: `menu`, or `play` once the next daily is ready.
export interface DailyResultsScreen {
  day: number;
  ticks: number | null; // null: did not finish
  untilNext: number; // ms to the next daily, 0 or less once it has begun
  leaderboard?: LeaderboardStatus; // unavailable when not given
}

function dailyResultsScreen({ day, ticks, untilNext, leaderboard = 'unavailable' }: DailyResultsScreen): ListScreen {
  const time = ticks === null ? null : timerText(ticks);
  return {
    title: time ?? DID_NOT_FINISH,
    smallTitle: time ?? DID_NOT_FINISH.toLowerCase(),
    titleColor: time ? TIME_COLOR : DID_NOT_FINISH_COLOR,
    lines: [
      { text: dayText(day), color: DAY_COLOR },
      leaderboardLine(leaderboard),
      { text: countdownText(untilNext), color: untilNext > 0 ? TEXT_COLOR : ROUTE_COLOR },
    ],
    entries: [{ label: untilNext > 0 ? 'menu' : 'play', enabled: true }],
  };
}

export function dailyResultsLayout(columns: number, rows: number, screen: DailyResultsScreen): MenuLayout | null {
  return listScreenLayout(dailyResultsScreen(screen), columns, rows);
}

export function drawDailyResultsScreen(grid: TextGrid, screen: DailyResultsScreen): void {
  drawListScreen(grid, dailyResultsScreen(screen), 0);
}
