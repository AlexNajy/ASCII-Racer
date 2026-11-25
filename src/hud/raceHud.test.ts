import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from '../game/city.ts';
import { COUNTDOWN_TICKS, createRace, GO_SHOWN_TICKS, type Race } from '../game/race.ts';
import { roadGraph } from '../game/roadGraph.ts';
import { generateRoute } from '../game/route.ts';
import { blockRows } from './blockFont.ts';
import type { Guidance } from './guidance.ts';
import { drawHud, type RaceHudValues } from './hud.ts';
import { createMinimap } from './minimap.ts';
import {
  ARROW_PANEL_HEIGHT,
  ARROW_PANEL_WIDTH,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  countText,
  drawArrow,
  drawBanner,
  drawTimer,
  FINISH_SHOWN_TICKS,
  raceBanner,
  TIMER_HEIGHT,
  TIMER_WIDTH,
  timerText,
} from './raceHud.ts';
import { TextGrid } from './textGrid.ts';

const city = generateCity({ ...DEFAULT_CITY_SETTINGS });
const route = generateRoute(roadGraph(city), 1);
const GATES = route.gates.length;
// 1280 × 720 at the default cell size (6 × 11 px), and the shots' 1600 × 900.
const SMALL: [number, number] = [213, 65];
const LARGE: [number, number] = [266, 81];
const SPEEDOMETER = { width: 15, height: 9 };

function text(grid: TextGrid, left: number, top: number, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) row += String.fromCharCode(grid.get(left + x, top + y)?.code || 32);
    rows.push(row);
  }
  return rows;
}

function raceAt(phase: Race['phase'], nextGate = 0, finishTick = -1): Race {
  return { ...createRace(route, 0), phase, nextGate, finishTick };
}

function hud(grid: TextGrid, race: RaceHudValues): void {
  drawHud(grid, { speed: 10, topSpeed: 32, minimap: { minimap: createMinimap(city), car: { ...route.pose } }, race });
}

// The top left corner of each race element in a grid of `columns`: the timer centred on row 1, the arrow a column
// to its right, the banner centred a row under the timer.
function places(columns: number) {
  const centre = (width: number) => Math.floor((columns - width) / 2);
  return {
    timer: { left: centre(TIMER_WIDTH), top: 1 },
    arrow: { left: centre(TIMER_WIDTH) + TIMER_WIDTH + 1, top: 1 },
    banner: { left: centre(BANNER_WIDTH), top: 2 + TIMER_HEIGHT },
  };
}

describe('timer', () => {
  it('reads m:ss.mmm in block digits with the gate count in the frame under it', () => {
    const grid = new TextGrid(40, 10);
    drawTimer(grid, 0, 0, 3723, 3, 12);
    const rows = text(grid, 0, 0, TIMER_WIDTH, TIMER_HEIGHT);
    expect(timerText(3723)).toBe('1:02.050');
    expect(rows).toHaveLength(7);
    expect(rows.slice(1, 6).map((row) => row.slice(2, -2))).toEqual(blockRows('1:02.050'));
    expect(rows[0]).toBe('+' + '-'.repeat(TIMER_WIDTH - 2) + '+');
    expect(rows[6]).toMatch(/^\+-+ GATE {2}3\/12 -+\+$/);
  });

  it('keeps one width at every time and count', () => {
    expect(countText(3, 12)).toHaveLength(countText(12, 12).length);
    expect(countText(0, 7)).toBe('GATE 0/7');
    for (const ticks of [0, 59, 3600, 35999, 10 ** 6]) expect(blockRows(timerText(ticks))[0]).toHaveLength(TIMER_WIDTH - 4);
    expect(timerText(10 ** 6)).toBe('9:59.983');
    expect(timerText(-5)).toBe('0:00.000');
  });

  it('leaves the grid clean when drawn again with the same values', () => {
    const grid = new TextGrid(40, 10);
    drawTimer(grid, 1, 1, 500, 2, 12);
    grid.dirty = false;
    drawTimer(grid, 1, 1, 500, 2, 12);
    expect(grid.dirty).toBe(false);
    drawTimer(grid, 1, 1, 501, 2, 12);
    expect(grid.dirty).toBe(true);
  });
});

describe('arrow panel', () => {
  const draw = (guidance: Guidance | null) => {
    const grid = new TextGrid(30, 10);
    drawArrow(grid, 0, 0, guidance);
    return text(grid, 0, 0, ARROW_PANEL_WIDTH, ARROW_PANEL_HEIGHT);
  };

  it('shows the turn, its arrow and the distance', () => {
    const left = draw({ kind: 'turn', turn: 'left', distance: 43.4 });
    expect(left[2]).toContain('LEFT');
    expect(left[3].slice(2, 9)).toBe('#######');
    expect(left[1].slice(2, 9)).toBe('  #    ');
    expect(left[4]).toContain('43 m');
    const right = draw({ kind: 'turn', turn: 'right', distance: 120 });
    expect(right[2]).toContain('RIGHT');
    expect(right[1].slice(2, 9)).toBe('    #  ');
    const back = draw({ kind: 'bearing', bearing: 'back', distance: 20000 });
    expect(back[2]).toContain('TO GATE');
    expect(back[4]).toContain('9999 m');
    expect(back[5].slice(2, 9)).toBe('   #   ');
  });

  it('shows the gate ahead as one backed row without a frame or an arrow', () => {
    const rows = draw({ kind: 'gate', distance: 80.4 });
    expect(rows.filter((row) => row.trim() !== '')).toEqual([rows[3]]);
    expect(rows[3].trimEnd()).toBe(' GATE   80 m');
    const grid = new TextGrid(30, 10);
    drawArrow(grid, 0, 0, { kind: 'gate', distance: 80 });
    expect(grid.get(0, 3)?.background).toBe(true);
    expect(grid.get(12, 3)?.background).toBe(true);
    expect(grid.get(13, 3)?.background).toBe(false);
    expect(grid.get(0, 0)?.background).toBe(false);
    grid.dirty = false;
    drawArrow(grid, 0, 0, { kind: 'gate', distance: 80 });
    expect(grid.dirty).toBe(false);
  });

  it('is see-through without guidance and clean on redraw', () => {
    expect(draw(null).join('')).toBe(' '.repeat(ARROW_PANEL_WIDTH * ARROW_PANEL_HEIGHT));
    const grid = new TextGrid(30, 10);
    drawArrow(grid, 0, 0, null);
    expect(grid.get(0, 0)?.background).toBe(false);
    for (const guidance of [null, { kind: 'turn', turn: 'right', distance: 50 } as const]) {
      drawArrow(grid, 0, 0, guidance);
      grid.dirty = false;
      drawArrow(grid, 0, 0, guidance);
      expect(grid.dirty).toBe(false);
    }
  });
});

describe('banner', () => {
  const draw = (race: Race, tick: number) => {
    const grid = new TextGrid(...LARGE);
    hud(grid, { race, tick, guidance: null });
    const { banner } = places(grid.columns);
    return text(grid, banner.left, banner.top, BANNER_WIDTH, BANNER_HEIGHT);
  };
  const big = (shown: string) => blockRows(shown, 2);
  // The big characters, centred, from row `top` of the banner.
  const centred = (rows: string[], shown: string, top: number) => {
    const { length } = big(shown)[0];
    const left = Math.floor((BANNER_WIDTH - length) / 2);
    return rows.slice(top, top + 10).map((row) => row.slice(left, left + length));
  };

  it('counts down 3, 2, 1, then GO, then nothing', () => {
    const race = raceAt('countdown');
    expect(centred(draw(race, 0), '3', 1)).toEqual(big('3'));
    expect(centred(draw(race, 60), '2', 1)).toEqual(big('2'));
    expect(centred(draw(race, 179), '1', 1)).toEqual(big('1'));
    const running = raceAt('running');
    expect(centred(draw(running, COUNTDOWN_TICKS), 'GO', 1)).toEqual(big('GO'));
    expect(draw(running, COUNTDOWN_TICKS + GO_SHOWN_TICKS).join('').trim()).toBe('');
  });

  it('shows FINISH and the final time, both twice the size, for FINISH_SHOWN_TICKS from the finish', () => {
    const finishTick = COUNTDOWN_TICKS + 3723;
    const finished = raceAt('finished', GATES, finishTick);
    for (const tick of [finishTick, finishTick + FINISH_SHOWN_TICKS - 1]) {
      const rows = draw(finished, tick);
      expect(centred(rows, 'FINISH', 1)).toEqual(big('FINISH'));
      expect(centred(rows, '1:02.050', 12)).toEqual(big('1:02.050'));
    }
    expect(draw(finished, finishTick + FINISH_SHOWN_TICKS).join('').trim()).toBe('');
    expect(raceBanner(finished, finishTick + FINISH_SHOWN_TICKS)).toBeNull();
    expect(raceBanner(finished, finishTick - 1)).toBeNull();
    expect(raceBanner(finished, finishTick + 1)).toEqual({ kind: 'finish', ticks: 3723 });
  });

  it('keeps a solid margin around the finish on every side', () => {
    const grid = new TextGrid(BANNER_WIDTH, BANNER_HEIGHT);
    drawBanner(grid, 0, 0, { kind: 'finish', ticks: 3723 });
    const rows = text(grid, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    expect(rows[0].trim()).toBe('');
    expect(rows[BANNER_HEIGHT - 1].trim()).toBe('');
    expect(rows.map((row) => row.slice(0, 2) + row.slice(-2)).join('').trim()).toBe('');
    // The time is the widest line: its first and last columns are 2 cells in from the sides.
    expect(rows.slice(12, 22).some((row) => row[2] === '#' && row[BANNER_WIDTH - 3] === '#')).toBe(true);
    for (let y = 0; y < BANNER_HEIGHT; y++) {
      for (let x = 0; x < BANNER_WIDTH; x++) expect(grid.get(x, y)?.background).toBe(true);
    }
  });

  it('backs the characters with a solid block, keeps the rest see-through and is clean on redraw', () => {
    const grid = new TextGrid(80, 30);
    drawBanner(grid, 0, 0, { kind: 'countdown', shown: 3 });
    expect(grid.get(0, 0)?.background).toBe(false);
    const middle = Math.floor(BANNER_WIDTH / 2);
    const { length } = big('3')[0];
    const left = Math.floor((BANNER_WIDTH - length) / 2);
    expect(grid.get(middle, 0)?.background).toBe(true);
    expect(grid.get(middle, 11)?.background).toBe(true);
    expect(grid.get(middle, 12)?.background).toBe(false);
    expect(grid.get(left - 2, 5)?.background).toBe(true);
    expect(grid.get(left - 3, 5)?.background).toBe(false);
    expect(grid.get(left + length + 1, 5)?.background).toBe(true);
    expect(grid.get(left + length + 2, 5)?.background).toBe(false);
    grid.dirty = false;
    drawBanner(grid, 0, 0, { kind: 'countdown', shown: 3 });
    expect(grid.dirty).toBe(false);
    drawBanner(grid, 0, 0, null);
    expect(text(grid, 0, 0, BANNER_WIDTH, BANNER_HEIGHT).join('').trim()).toBe('');
  });
});

describe('race HUD layout', () => {
  it('puts the timer at the top centre, the arrow to its right and the banner under the timer at two grid sizes', () => {
    for (const size of [SMALL, LARGE]) {
      const grid = new TextGrid(...size);
      hud(grid, { race: raceAt('countdown'), tick: 0, guidance: { kind: 'turn', turn: 'right', distance: 40 } });
      const { timer, arrow, banner } = places(grid.columns);
      expect(grid.get(timer.left, timer.top)?.code).toBe('+'.charCodeAt(0));
      expect(grid.get(timer.left + TIMER_WIDTH - 1, timer.top + TIMER_HEIGHT - 1)?.code).toBe('+'.charCodeAt(0));
      expect(text(grid, timer.left, timer.top, TIMER_WIDTH, TIMER_HEIGHT)[TIMER_HEIGHT - 1]).toContain(`GATE  0/${GATES}`);
      expect(grid.get(arrow.left, arrow.top)?.code).toBe('+'.charCodeAt(0));
      expect(text(grid, banner.left, banner.top, BANNER_WIDTH, BANNER_HEIGHT).join('')).toContain('#');
    }
  });

  it('fits beside the minimap and over the speedometer at 1280 × 720 without touching them', () => {
    const [columns, rows] = SMALL;
    const minimap = createMinimap(city);
    const bannerBottom = places(columns).banner.top + BANNER_HEIGHT;
    const mapTop = rows - 1 - minimap.layout.height;
    const speedometerTop = rows - 1 - SPEEDOMETER.height;
    const bannerLeft = places(columns).banner.left;
    // Below the minimap's top either way, so the banner must clear it sideways, and it does.
    expect(bannerLeft).toBeGreaterThan(1 + minimap.layout.width);
    expect(bannerLeft + BANNER_WIDTH).toBeLessThan(columns - 1 - SPEEDOMETER.width);
    expect(bannerBottom).toBeLessThan(Math.min(mapTop, speedometerTop));
  });

  it('drops the banner, then the arrow, then the timer as the grid shrinks', () => {
    const shown = (columns: number, rows: number) => {
      const grid = new TextGrid(columns, rows);
      hud(grid, { race: raceAt('countdown'), tick: 0, guidance: { kind: 'turn', turn: 'left', distance: 40 } });
      const { timer, arrow, banner } = places(columns);
      const three = blockRows('3', 2);
      const threeLeft = banner.left + Math.floor((BANNER_WIDTH - three[0].length) / 2);
      return {
        timer: grid.get(timer.left, timer.top)?.code === '+'.charCodeAt(0),
        arrow: grid.get(arrow.left, arrow.top)?.code === '+'.charCodeAt(0),
        banner: text(grid, threeLeft, banner.top + 1, three[0].length, three.length).join() === three.join(),
      };
    };
    expect(shown(...SMALL)).toEqual({ timer: true, arrow: true, banner: true });
    // Too short for the banner: it needs its rows under the timer and a margin below.
    const bannerRows = 1 + TIMER_HEIGHT + 1 + BANNER_HEIGHT + 1;
    expect(shown(213, bannerRows)).toEqual({ timer: true, arrow: true, banner: true });
    expect(shown(213, bannerRows - 1)).toEqual({ timer: true, arrow: true, banner: false });
    // Too narrow for the arrow beside the timer: the banner goes with it.
    expect(shown(81, 40)).toEqual({ timer: true, arrow: false, banner: false });
    // Too narrow for the timer: nothing at the top at all (the speedometer still fits below).
    const narrow = new TextGrid(TIMER_WIDTH + 1, 40);
    hud(narrow, { race: raceAt('countdown'), tick: 0, guidance: { kind: 'gate', distance: 40 } });
    expect(text(narrow, 0, 0, narrow.columns, 40 - 1 - SPEEDOMETER.height).join('').trim()).toBe('');
  });

  it('keeps the centre under the timer clear while racing, where the next gate beam stands', () => {
    const guidances: Guidance[] = [
      { kind: 'gate', distance: 150 },
      { kind: 'turn', turn: 'right', distance: 40 },
      { kind: 'bearing', bearing: 'left', distance: 300 },
    ];
    for (const size of [SMALL, LARGE]) {
      for (const guidance of guidances) {
        const grid = new TextGrid(...size);
        hud(grid, { race: raceAt('running', 3), tick: COUNTDOWN_TICKS + GO_SHOWN_TICKS + 600, guidance });
        const { timer } = places(grid.columns);
        const below = text(grid, timer.left, timer.top + TIMER_HEIGHT, TIMER_WIDTH, grid.rows - 1 - SPEEDOMETER.height - TIMER_HEIGHT - 1);
        expect(below.join('').trim()).toBe('');
        for (let y = timer.top + TIMER_HEIGHT; y < grid.rows / 2; y++) {
          for (let x = timer.left; x < timer.left + TIMER_WIDTH; x++) expect(grid.get(x, y)?.background).toBe(false);
        }
      }
    }
  });

  it('leaves the grid clean when the same race state is drawn again, in every phase', () => {
    const minimap = createMinimap(city);
    const states: RaceHudValues[] = [
      { race: raceAt('countdown'), tick: 30, guidance: { kind: 'turn', turn: 'left', distance: 60 } },
      { race: raceAt('running', 2), tick: 400, guidance: { kind: 'bearing', bearing: 'back', distance: 300 } },
      { race: raceAt('running', 4), tick: 900, guidance: { kind: 'gate', distance: 120 } },
      { race: raceAt('finished', GATES, 5000), tick: 5100, guidance: null },
      { race: raceAt('finished', GATES, 5000), tick: 6000, guidance: null },
    ];
    for (const race of states) {
      const grid = new TextGrid(...SMALL);
      const values = { speed: 10, topSpeed: 32, minimap: { minimap, car: { ...route.pose } }, race };
      drawHud(grid, values);
      grid.dirty = false;
      drawHud(grid, values);
      expect(grid.dirty).toBe(false);
    }
  });
});
