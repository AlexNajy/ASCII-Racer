import { describe, expect, it } from 'vitest';
import { RESULTS_OPTIONS } from '../app/gameState.ts';
import { KEY_LIST } from '../app/keys.ts';
import { MENU_ENTRIES } from '../app/mainMenu.ts';
import { DEFAULT_PLAYER_SETTINGS } from '../app/settings.ts';
import { GLYPH_SIZE_MORE, SETTINGS_ROWS, type SettingsScreen } from '../app/settingsMenu.ts';
import { drawSettingsScreen, settingsLayout, settingsRowAt, type SettingsView } from './settingsScreen.ts';
import { drawFinishScreen, finishLayout } from './finishScreen.ts';
import { drawMenuScreen, menuEntryAt, menuLayout } from './menuScreen.ts';
import { TextGrid } from './textGrid.ts';

// 1280 × 720 at the default 6 px cells (11 px tall), and the shots' 1600 × 900.
const DEFAULT_GRID: [number, number] = [213, 65];
const SHOT_GRID: [number, number] = [266, 81];

function line(grid: TextGrid, row: number): string {
  let text = '';
  for (let x = 0; x < grid.columns; x++) text += String.fromCharCode(grid.get(x, row)?.code || 32);
  return text;
}

function text(grid: TextGrid): string {
  return Array.from({ length: grid.rows }, (_, y) => line(grid, y)).join('\n');
}

function view(screen: Partial<SettingsScreen> = {}, fullscreen = false): SettingsView {
  return { screen: { selected: 0, editing: null, ...screen }, settings: { ...DEFAULT_PLAYER_SETTINGS }, fullscreen };
}

describe('settings screen', () => {
  it('draws the title, every setting with its value and the key list at the default size', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawSettingsScreen(grid, view());
    const layout = settingsLayout(...DEFAULT_GRID)!;
    expect(layout.keys).toBe(true);
    expect(layout.title.length).toBe(12);
    expect(line(grid, layout.rowLines[0])).toMatch(/> nickname +anon +</);
    expect(line(grid, layout.rowLines[1])).toMatch(/ volume +\[########--\] /);
    expect(line(grid, layout.rowLines[2])).toMatch(/ mute +off /);
    expect(line(grid, layout.rowLines[3])).toMatch(/ glyph size +< {2}6 > /);
    expect(line(grid, layout.rowLines[4])).toMatch(/ fullscreen +off /);
    const all = text(grid);
    expect(all).toContain('enter  edit');
    expect(all).toContain('- keys -');
    for (const { keys, action } of KEY_LIST) expect(all).toMatch(new RegExp(`${keys.replace(/[/]/g, '\\/')} +${action}`));
  });

  it('fits the shots size too', () => {
    expect(settingsLayout(...SHOT_GRID)!.keys).toBe(true);
  });

  it('marks the selected setting, and shows the nickname being typed with a cursor and the hint', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    const layout = settingsLayout(...DEFAULT_GRID)!;
    drawSettingsScreen(grid, view({ selected: 3 }));
    expect(line(grid, layout.rowLines[3])).toMatch(/> glyph size .*</);
    expect(line(grid, layout.rowLines[0])).not.toContain('>');
    expect(text(grid)).toContain('left right  change');
    drawSettingsScreen(grid, view({ editing: { text: 'Speedy 7', tooShort: false } }));
    expect(line(grid, layout.rowLines[0])).toMatch(/> nickname +Speedy 7_ +</);
    expect(text(grid)).toContain('enter  save      esc  cancel');
    drawSettingsScreen(grid, view({ editing: { text: 'ab', tooShort: true } }));
    expect(text(grid)).toContain('3 to 12 letters, digits or spaces');
    drawSettingsScreen(grid, view({ selected: 4 }, true));
    expect(line(grid, layout.rowLines[4])).toMatch(/> fullscreen +on +</);
  });

  it('puts the title and the panel on a solid background', () => {
    const grid = new TextGrid(...DEFAULT_GRID);
    drawSettingsScreen(grid, view());
    const { title, titleLeft, titleTop, panelLeft, panelTop, lines, metrics } = settingsLayout(...DEFAULT_GRID)!;
    for (let y = 0; y < title.length; y++) {
      for (let x = 0; x < title[0].length; x++) expect(grid.get(titleLeft + x, titleTop + y)!.background).toBe(true);
    }
    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < metrics.panelWidth; x++) expect(grid.get(panelLeft + x, panelTop + y)!.background).toBe(true);
    }
  });

  it('leaves the grid clean when the same view is drawn again', () => {
    const views = [view(), view({ selected: 2 }), view({ editing: { text: 'abc', tooShort: true } }), view({}, true)];
    for (const size of [DEFAULT_GRID, SHOT_GRID, [60, 30] as [number, number], [40, 12] as [number, number]]) {
      for (const shown of views) {
        const grid = new TextGrid(...size);
        drawSettingsScreen(grid, shown);
        grid.dirty = false;
        drawSettingsScreen(grid, shown);
        expect(grid.dirty).toBe(false);
      }
    }
  });

  it('changes only the rows that differ when the selection moves', () => {
    const layout = settingsLayout(...DEFAULT_GRID)!;
    const grid = new TextGrid(...DEFAULT_GRID);
    drawSettingsScreen(grid, view({ selected: 1 }));
    const before = grid.data.slice();
    drawSettingsScreen(grid, view({ selected: 3 }));
    const changed = new Set<number>();
    for (let i = 0; i < before.length; i++) if (before[i] !== grid.data[i]) changed.add(Math.floor(i / 4 / grid.columns));
    const hintRow = layout.panelTop + layout.lines.indexOf('hint');
    expect([...changed].sort((a, b) => a - b)).toEqual([layout.rowLines[1], layout.rowLines[3]]);
    expect(changed.has(hintRow)).toBe(false); // volume and glyph size share their hint
  });

  it('finds the setting and the column into its value under a cell', () => {
    const layout = settingsLayout(...DEFAULT_GRID)!;
    SETTINGS_ROWS.forEach((_, index) => {
      const row = layout.rowLines[index];
      expect(settingsRowAt(layout, layout.panelLeft + 1, row)?.index).toBe(index);
      expect(settingsRowAt(layout, layout.panelLeft + layout.metrics.panelWidth - 2, row)?.index).toBe(index);
      expect(settingsRowAt(layout, layout.panelLeft, row)).toBeNull();
      expect(settingsRowAt(layout, layout.panelLeft + layout.metrics.panelWidth - 1, row)).toBeNull();
      expect(settingsRowAt(layout, layout.valueLeft, row)).toEqual({ index, offset: 0 });
    });
    expect(settingsRowAt(layout, layout.valueLeft + 5, layout.rowLines[0] + 1)).toBeNull();
    const grid = new TextGrid(...DEFAULT_GRID);
    drawSettingsScreen(grid, view());
    expect(grid.get(layout.valueLeft + GLYPH_SIZE_MORE, layout.rowLines[3])!.code).toBe('>'.charCodeAt(0));
    expect(grid.get(layout.valueLeft, layout.rowLines[1])!.code).toBe('['.charCodeAt(0));
  });

  it('drops the key list first on smaller grids, then shrinks the title, and keeps everything inside', () => {
    for (let columns = 0; columns <= 120; columns += 7) {
      for (let rows = 0; rows <= 70; rows += 3) {
        const grid = new TextGrid(columns, rows);
        expect(() => drawSettingsScreen(grid, view())).not.toThrow();
        const layout = settingsLayout(columns, rows);
        if (!layout) continue;
        expect(layout.titleLeft).toBeGreaterThanOrEqual(0);
        expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
        expect(layout.panelLeft + layout.metrics.panelWidth).toBeLessThanOrEqual(columns);
        expect(layout.titleLeft + layout.title[0].length).toBeLessThanOrEqual(columns);
        expect(layout.panelTop + layout.lines.length).toBeLessThanOrEqual(rows);
      }
    }
    const noKeys = settingsLayout(120, 34)!;
    expect(noKeys.keys).toBe(false);
    expect(noKeys.title.length).toBe(12);
    expect(settingsLayout(120, 27)!.title.length).toBe(7);
    expect(settingsLayout(60, 20)!.title[1]).toContain('settings');
    expect(settingsLayout(10, 10)).toBeNull();
  });
});

describe('small windows with big glyphs', () => {
  const CELL_ASPECT = 1.75;
  const screens = (columns: number, rows: number) => [
    menuLayout(columns, rows),
    finishLayout(columns, rows, 99999),
    settingsLayout(columns, rows),
  ];

  function gridOf(width: number, height: number, glyph: number): [number, number] {
    return [Math.floor(width / glyph), Math.floor(height / Math.round(glyph * CELL_ASPECT))];
  }

  it('draws every screen at every glyph size in a 640 x 400 window and larger', () => {
    for (let glyph = 4; glyph <= 16; glyph++) {
      for (const [width, height] of [[640, 400], [700, 450], [1280, 720]]) {
        for (const layout of screens(...gridOf(width, height, glyph))) expect(layout, `${glyph} in ${width}x${height}`).not.toBeNull();
      }
    }
  });

  it('draws the compact style whole and its hit tests match what is drawn', () => {
    const [columns, rows] = gridOf(640, 400, 16);
    const grid = new TextGrid(columns, rows);
    drawSettingsScreen(grid, view({ selected: 3 }));
    const layout = settingsLayout(columns, rows)!;
    expect(layout.keys).toBe(false);
    expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
    expect(layout.panelTop + layout.lines.length).toBeLessThanOrEqual(rows);
    expect(line(grid, layout.rowLines[3])).toMatch(/> glyph size +< {2}6 > /);
    SETTINGS_ROWS.forEach((_, index) => {
      expect(settingsRowAt(layout, layout.valueLeft, layout.rowLines[index])).toEqual({ index, offset: 0 });
    });
    const menu = new TextGrid(columns, rows);
    drawMenuScreen(menu, 0);
    const menuAt = menuLayout(columns, rows)!;
    MENU_ENTRIES.forEach(({ label }, index) => {
      expect(line(menu, menuAt.entryRows[index])).toContain(label);
      expect(menuEntryAt(menuAt, menuAt.listLeft + 2, menuAt.entryRows[index])).toBe(index);
    });
    const finish = new TextGrid(columns, rows);
    drawFinishScreen(finish, 99999, 1);
    const finishAt = finishLayout(columns, rows, 99999)!;
    RESULTS_OPTIONS.forEach((label, index) => expect(line(finish, finishAt.entryRows[index])).toContain(label));
  });

  it('reports the smallest window each screen still draws in at glyph size 16', () => {
    const smallest = (draws: (columns: number, rows: number) => boolean) => {
      let best: [number, number] | null = null;
      for (let width = 160; width <= 1280; width += 16) {
        for (let height = 100; height <= 720; height += 28) {
          if (!draws(...gridOf(width, height, 16))) continue;
          if (!best || width * height < best[0] * best[1]) best = [width, height];
        }
      }
      return best;
    };
    const sizes = {
      menu: smallest((c, r) => menuLayout(c, r) !== null),
      finish: smallest((c, r) => finishLayout(c, r, 99999) !== null),
      settings: smallest((c, r) => settingsLayout(c, r) !== null),
    };
    for (const size of Object.values(sizes)) {
      expect(size![0]).toBeLessThanOrEqual(640);
      expect(size![1]).toBeLessThanOrEqual(400);
    }
  });
});
