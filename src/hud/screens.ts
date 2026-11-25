import type { Route } from '../game/route.ts';
import { drawMinimap, type Minimap, type MinimapCar } from './minimap.ts';
import type { TextGrid } from './textGrid.ts';

// The placeholder pre-race screen, until the daily's exists (the menu is menuScreen.ts, the finish screen
// finishScreen.ts). It writes the same cells every call, so drawing it again leaves the grid clean.
const TEXT_COLOR = 0xc0c0c0;
const MARGIN = 1;

// One line centred on the grid, a space of solid background on each side so it reads over the scene.
function centred(grid: TextGrid, row: number, text: string, color: number): void {
  grid.write(Math.floor(grid.columns / 2), row, ` ${text} `, { color, background: true, align: 'center' });
}

function upperThird(grid: TextGrid): number {
  return Math.floor(grid.rows / 3);
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
