import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { createRace } from '../game/race.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import { drawHud } from './hud.ts';
import { drawLobbyPanel, lobbyLines, lobbyPanelSize } from './lobbyHud.ts';
import { createMinimap } from './minimap.ts';
import { TextGrid } from './textGrid.ts';

const lobby = { code: 'ABC234', players: 1 };
const city = generateCity({ ...DEFAULT_CITY_SETTINGS });
const route = generateRoute(roadGraph(city), 1);

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}
const text = (grid: TextGrid) => Array.from({ length: grid.rows }, (_, y) => line(grid, y)).join('\n');

describe('lobby panel', () => {
  it('says the code and how many players are in', () => {
    expect(lobbyLines(lobby)).toEqual(['LOBBY ABC234', '1/8 players']);
    expect(lobbyLines({ code: 'ABC234', players: 8 })[1]).toBe('8/8 players');
    expect(lobbyLines({ code: 'ABC234', players: 99 })[1]).toBe('8/8 players');
  });

  it('writes every cell of its rectangle once, on a solid background', () => {
    const grid = new TextGrid(40, 12);
    drawLobbyPanel(grid, 3, 2, lobby);
    const { width, height } = lobbyPanelSize(lobby);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) expect(grid.get(3 + x, 2 + y)!.background).toBe(true);
    grid.dirty = false;
    drawLobbyPanel(grid, 3, 2, lobby);
    expect(grid.dirty).toBe(false);
  });
});

describe('lobby panel in the driving HUD', () => {
  const minimap = createMinimap(city);

  it('sits top left, with the speedometer, and leaves the grid clean when drawn again', () => {
    const grid = new TextGrid(100, 40);
    drawHud(grid, { speed: 0, topSpeed: 32, lobby });
    expect(line(grid, 1)).toContain('+--');
    expect(line(grid, 2)).toContain('LOBBY ABC234');
    expect(line(grid, 3)).toContain('1/8 players');
    expect(line(grid, 2).indexOf('LOBBY')).toBe(3); // frame, padding
    expect(text(grid)).toContain('km/h');
    grid.dirty = false;
    drawHud(grid, { speed: 0, topSpeed: 32, lobby });
    expect(grid.dirty).toBe(false);
  });

  it('is not drawn when the grid cannot hold it', () => {
    const grid = new TextGrid(20, 12);
    drawHud(grid, { speed: 0, topSpeed: 32, lobby });
    expect(text(grid)).not.toContain('LOBBY');
    const none = new TextGrid(100, 40);
    drawHud(none, { speed: 0, topSpeed: 32 });
    expect(text(none)).not.toContain('LOBBY');
  });

  it('shares the top with a race timer when both fit, and gives way to it when they do not', () => {
    const wide = new TextGrid(120, 40);
    drawHud(wide, { speed: 0, topSpeed: 32, lobby, race: { race: createRace(route, 0), tick: 30, guidance: null } });
    expect(text(wide)).toContain('LOBBY ABC234');
    expect(text(wide)).toContain('GATE');
    const narrow = new TextGrid(52, 40);
    drawHud(narrow, { speed: 0, topSpeed: 32, lobby, race: { race: createRace(route, 0), tick: 30, guidance: null } });
    expect(text(narrow)).not.toContain('LOBBY ABC234');
    expect(text(narrow)).toContain('GATE');
  });

  it('never overlaps the minimap', () => {
    for (const [columns, rows] of [[100, 24], [100, 30], [80, 20], [120, 40]]) {
      const grid = new TextGrid(columns, rows);
      drawHud(grid, { speed: 0, topSpeed: 32, lobby, minimap: { minimap, car: { x: 0, z: 0, heading: 0 } } });
      const only = new TextGrid(columns, rows);
      drawHud(only, { speed: 0, topSpeed: 32, minimap: { minimap, car: { x: 0, z: 0, heading: 0 } } });
      const shown = text(grid).includes('LOBBY');
      if (!shown) continue;
      const { width, height } = lobbyPanelSize(lobby);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const inPanel = x >= 1 && x < 1 + width && y >= 1 && y < 1 + height;
          if (!inPanel) expect(grid.get(x, y)).toEqual(only.get(x, y));
        }
      }
    }
  });
});
