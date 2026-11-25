import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import { createMinimap } from './minimap.ts';
import { drawPreRaceScreen, drawResultsScreen } from './screens.ts';
import { TextGrid } from './textGrid.ts';

const city = generateCity({ ...DEFAULT_CITY_SETTINGS });
const route = generateRoute(roadGraph(city), 1);

function text(grid: TextGrid): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = '';
    for (let x = 0; x < grid.columns; x++) line += String.fromCharCode(grid.get(x, y)?.code || 32);
    lines.push(line);
  }
  return lines.join('\n');
}

const minimap = createMinimap(city);
const screens: [string, (grid: TextGrid) => void][] = [
  ['pre-race', (grid) => drawPreRaceScreen(grid, { minimap, car: { ...route.pose }, route })],
  ['results', (grid) => drawResultsScreen(grid, 4567)],
];

describe('placeholder screens', () => {
  it('says what each screen is', () => {
    const results = new TextGrid(120, 50);
    drawResultsScreen(results, 4567);
    expect(text(results)).toContain('time  1:16.116');
    expect(text(results)).toContain('press enter');
  });

  it('draws the route on the minimap before the race when it fits', () => {
    const grid = new TextGrid(120, 50);
    drawPreRaceScreen(grid, { minimap: createMinimap(city), car: { ...route.pose }, route });
    expect(text(grid)).toContain('press enter to start');
    expect(text(grid)).toContain('S');
    expect(text(grid)).toContain('F');
  });

  it.each(screens)('leaves the grid clean when the %s screen is drawn again', (_, draw) => {
    const grid = new TextGrid(120, 50);
    draw(grid);
    grid.dirty = false;
    draw(grid);
    expect(grid.dirty).toBe(false);
  });

  it.each(screens)('draws the %s screen on a tiny grid without throwing', (_, draw) => {
    for (const [columns, rows] of [[0, 0], [5, 3], [30, 10]]) expect(() => draw(new TextGrid(columns, rows))).not.toThrow();
  });
});
