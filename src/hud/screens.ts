import { formatRaceTime } from '../game/race.ts';
import type { Route } from '../game/route.ts';
import { drawMinimap, type Minimap, type MinimapCar } from './minimap.ts';
import { FRAME_COLOR } from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// Placeholder screens for the game states other than the race, until the real menu, pre-race and results screens
// exist. Each writes the same cells every call, so drawing the same screen again leaves the grid clean.
const TITLE = 'ascii racer';
const TITLE_COLOR = 0xffd070;
const TEXT_COLOR = 0xc0c0c0;
const TIME_COLOR = 0xff99ff;
const MARGIN = 1;
const RESULTS_WIDTH = 24;
const RESULTS_HEIGHT = 7;

// One line centred on the grid, a space of solid background on each side so it reads over the scene.
function centred(grid: TextGrid, row: number, text: string, color: number): void {
  grid.write(Math.floor(grid.columns / 2), row, ` ${text} `, { color, background: true, align: 'center' });
}

function upperThird(grid: TextGrid): number {
  return Math.floor(grid.rows / 3);
}

export function drawMenuScreen(grid: TextGrid): void {
  const top = upperThird(grid);
  centred(grid, top, TITLE, TITLE_COLOR);
  centred(grid, top + 2, 'press enter', TEXT_COLOR);
}

export interface PreRaceMinimap {
  minimap: Minimap;
  car: MinimapCar;
  route: Route;
}

// The route on the minimap in the bottom left corner, where the race HUD has it, if it fits.
export function drawPreRaceScreen(grid: TextGrid, map: PreRaceMinimap | null): void {
  centred(grid, upperThird(grid), 'press enter to start', TEXT_COLOR);
  if (!map) return;
  const { width, height } = map.minimap.layout;
  const top = grid.rows - MARGIN - height;
  if (top < 0 || MARGIN + width + MARGIN > grid.columns) return;
  drawMinimap(grid, map.minimap, MARGIN, top, map.car, { route: map.route, nextGate: 0 });
}

// Every cell written once, so the same time drawn again leaves the grid clean.
export function drawResultsScreen(grid: TextGrid, ticks: number): void {
  const left = Math.floor((grid.columns - RESULTS_WIDTH) / 2);
  const top = upperThird(grid);
  // Negative places would count from the other edge.
  if (left < 0 || top + RESULTS_HEIGHT > grid.rows) return;
  const inner = RESULTS_WIDTH - 2;
  const edge = `+${'-'.repeat(inner)}+`;
  const lines = ['', `time  ${formatRaceTime(ticks)}`, '', 'press enter', ''];
  const colors = [TEXT_COLOR, TIME_COLOR, TEXT_COLOR, TEXT_COLOR, TEXT_COLOR];
  grid.write(left, top, edge, { color: FRAME_COLOR, background: true });
  lines.forEach((line, i) => {
    const row = top + 1 + i;
    const start = Math.floor((inner - line.length) / 2);
    grid.put(left, row, '|', FRAME_COLOR, true);
    grid.write(left + 1, row, line.padStart(start + line.length).padEnd(inner), { color: colors[i], background: true });
    grid.put(left + RESULTS_WIDTH - 1, row, '|', FRAME_COLOR, true);
  });
  grid.write(left, top + RESULTS_HEIGHT - 1, edge, { color: FRAME_COLOR, background: true });
}
