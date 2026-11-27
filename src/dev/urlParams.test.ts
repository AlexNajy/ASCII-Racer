import { describe, expect, it } from 'vitest';
import { RenderMode } from './menu.ts';
import { MAX_URL_TICK, parseUrlParams } from './urlParams.ts';
import { CELL_WIDTH_MAX, CELL_WIDTH_MIN } from './menu.ts';

describe('parseUrlParams', () => {
  it('is a no-op without parameters', () => {
    expect(parseUrlParams('')).toEqual({ seed: null, day: null, renderMode: null, camera: null, tick: null, shot: false, drive: false, replay: false, hud: null, cellWidth: null, race: true, gate: null, car: null, state: 'menu', dnf: false, next: null, giveUp: false, entry: null, edit: null, shape: null, color: null });
  });

  it('reads replay=1 and nothing else as replaying', () => {
    expect(parseUrlParams('?replay=1').replay).toBe(true);
    expect(parseUrlParams('?replay=0').replay).toBe(false);
  });

  it('reads drive=1 and nothing else as driving', () => {
    expect(parseUrlParams('?drive=1').drive).toBe(true);
    expect(parseUrlParams('?drive=0').drive).toBe(false);
    expect(parseUrlParams('?drive').drive).toBe(false);
  });

  it('races unless race=0', () => {
    expect(parseUrlParams('').race).toBe(true);
    expect(parseUrlParams('?race=1').race).toBe(true);
    expect(parseUrlParams('?race=0').race).toBe(false);
    expect(() => parseUrlParams('?race=')).toThrow();
    expect(() => parseUrlParams('?race=no')).toThrow();
  });

  it('starts on the state given, the menu by default', () => {
    expect(parseUrlParams('').state).toBe('menu');
    expect(parseUrlParams('?state=menu').state).toBe('menu');
    expect(parseUrlParams('?state=daily&day=3&shot').state).toBe('preRace');
    expect(parseUrlParams('?state=dailyrace&day=3&tick=0').state).toBe('dailyRace');
    expect(parseUrlParams('?state=dailyresults&day=3&dnf=1&shot').state).toBe('dailyResults');
    expect(() => parseUrlParams('?state=prerace')).toThrow();
    expect(parseUrlParams('?state=race').state).toBe('race');
    expect(parseUrlParams('?state=results').state).toBe('results');
    expect(parseUrlParams('?state=loading').state).toBe('loading');
    expect(() => parseUrlParams('?state=')).toThrow();
    expect(() => parseUrlParams('?state=preRace')).toThrow();
    expect(() => parseUrlParams('?state=toString')).toThrow();
  });

  it('needs day= and no seed= for the daily states', () => {
    for (const state of ['daily', 'dailyrace', 'dailyresults']) {
      expect(parseUrlParams(`?state=${state}&day=-4&shot`).day).toBe(-4);
      expect(() => parseUrlParams(`?state=${state}`)).toThrow();
      expect(() => parseUrlParams(`?state=${state}&day=3&seed=1`)).toThrow();
    }
  });

  it('ignores the daily states on a normal load, where they would race or show a day without its stored try', () => {
    for (const query of ['?state=daily&day=3', '?state=dailyrace&day=3&giveup=1', '?state=dailyresults&day=3&dnf=1&next=10']) {
      const params = parseUrlParams(query);
      expect([params.state, params.dnf, params.giveUp, params.next, params.shot]).toEqual(['menu', false, false, null, false]);
      expect(params.day).toBe(3);
      expect(parseUrlParams(`${query}&shot`).state).not.toBe('menu');
      expect(parseUrlParams(`${query}&tick=5`).state).not.toBe('menu');
    }
  });

  it('reads dnf=1, giveup=1 and a pinned countdown only with their daily states', () => {
    expect(parseUrlParams('?state=dailyresults&day=3&dnf=1&shot').dnf).toBe(true);
    expect(parseUrlParams('?state=dailyresults&day=3&shot').dnf).toBe(false);
    expect(parseUrlParams('?state=dailyrace&day=3&giveup=1&shot').giveUp).toBe(true);
    expect(parseUrlParams('?state=dailyresults&day=3&next=0&shot').next).toBe(0);
    expect(parseUrlParams('?state=daily&day=3&next=172800&shot').next).toBe(172800);
    for (const bad of [
      '?dnf=1',
      '?state=dailyrace&day=3&dnf=1',
      '?state=dailyresults&day=3&dnf=0',
      '?giveup=1',
      '?state=daily&day=3&giveup=1',
      '?state=dailyrace&day=3&giveup=yes',
      '?next=10',
      '?state=race&next=10',
      '?state=daily&day=3&next=-1',
      '?state=daily&day=3&next=1.5',
      '?state=daily&day=3&next=172801',
    ]) {
      expect(() => parseUrlParams(bad)).toThrow();
    }
  });

  it('selects a menu entry by its place in the list', () => {
    expect(parseUrlParams('?entry=0').entry).toBe(0);
    expect(parseUrlParams('?entry=5').entry).toBe(5);
    for (const bad of ['', '6', '-1', '1.5', 'garage']) expect(() => parseUrlParams(`?entry=${bad}`)).toThrow();
  });

  it('selects a finish screen option with state=results', () => {
    expect(parseUrlParams('?state=results&entry=2').entry).toBe(2);
    expect(() => parseUrlParams('?state=results&entry=3')).toThrow();
  });

  it('starts on the settings with a row selected and a nickname being typed', () => {
    expect(parseUrlParams('?state=settings').state).toBe('settings');
    expect(parseUrlParams('?state=settings&entry=4').entry).toBe(4);
    expect(() => parseUrlParams('?state=settings&entry=5')).toThrow();
    expect(parseUrlParams('?state=settings&edit=Speedy%207').edit).toBe('Speedy 7');
    expect(parseUrlParams('?state=settings&edit=').edit).toBe('');
    expect(parseUrlParams('?state=settings').edit).toBeNull();
    for (const bad of ['?edit=abc', '?state=menu&edit=abc', '?state=settings&edit=abcdefghijklm', '?state=settings&edit=a_b']) {
      expect(() => parseUrlParams(bad)).toThrow();
    }
  });

  it('starts in the garage with a row selected, and picks the car', () => {
    expect(parseUrlParams('?state=garage').state).toBe('garage');
    expect(parseUrlParams('?state=garage&entry=1').entry).toBe(1);
    expect(() => parseUrlParams('?state=garage&entry=2')).toThrow();
    const car = parseUrlParams('?shape=pickup&color=teal');
    expect([car.shape, car.color]).toEqual(['pickup', 'teal']);
    for (const bad of ['?shape=', '?shape=Van', '?shape=truck', '?color=', '?color=red', '?color=Teal']) expect(() => parseUrlParams(bad)).toThrow();
  });

  it('accepts whole gate numbers from 0', () => {
    expect(parseUrlParams('?gate=0').gate).toBe(0);
    expect(parseUrlParams('?gate=11').gate).toBe(11);
    expect(() => parseUrlParams('?gate=')).toThrow();
    expect(() => parseUrlParams('?gate=-1')).toThrow();
    expect(() => parseUrlParams('?gate=1.5')).toThrow();
    expect(() => parseUrlParams('?gate=x')).toThrow();
  });

  it('reads the car pose as x,z,quarterTurns', () => {
    expect(parseUrlParams('?car=12.5,-40,1').car).toEqual({ x: 12.5, z: -40, quarterTurns: 1 });
    expect(parseUrlParams('?car=0,0,-1').car).toEqual({ x: 0, z: 0, quarterTurns: -1 });
    expect(() => parseUrlParams('?car=1,2')).toThrow();
    expect(() => parseUrlParams('?car=1,2,3,4')).toThrow();
    expect(() => parseUrlParams('?car=1,2,0.5')).toThrow();
    expect(() => parseUrlParams('?car=1,x,0')).toThrow();
    expect(() => parseUrlParams('?car=')).toThrow();
  });

  it('rejects empty and non-numeric values', () => {
    expect(() => parseUrlParams('?seed=')).toThrow();
    expect(() => parseUrlParams('?seed=abc')).toThrow();
    expect(() => parseUrlParams('?tick=')).toThrow();
    expect(() => parseUrlParams('?camera=1,2,3,x,5')).toThrow();
  });

  it('matches mode names ignoring case', () => {
    expect(parseUrlParams('?mode=brightness').renderMode).toBe(RenderMode.Brightness);
    expect(parseUrlParams('?mode=FULLRESOLUTION').renderMode).toBe(RenderMode.FullResolution);
    expect(() => parseUrlParams('?mode=nonsense')).toThrow();
  });

  it('converts camera degrees to radians', () => {
    const camera = parseUrlParams('?camera=1,2,3,90,-45').camera;
    expect(camera?.position).toEqual([1, 2, 3]);
    expect(camera?.yaw).toBeCloseTo(Math.PI / 2);
    expect(camera?.pitch).toBeCloseTo(-Math.PI / 4);
  });

  it('needs exactly 5 camera parts', () => {
    expect(() => parseUrlParams('?camera=1,2,3,4')).toThrow();
    expect(() => parseUrlParams('?camera=1,2,3,4,5,6')).toThrow();
  });

  it('accepts whole ticks up to the cap and implies shot', () => {
    expect(parseUrlParams('?tick=0')).toMatchObject({ tick: 0, shot: true });
    expect(parseUrlParams(`?tick=${MAX_URL_TICK}`).tick).toBe(MAX_URL_TICK);
    expect(parseUrlParams('?shot').shot).toBe(true);
  });

  it('rejects bad ticks', () => {
    expect(() => parseUrlParams('?tick=-1')).toThrow();
    expect(() => parseUrlParams('?tick=1.5')).toThrow();
    expect(() => parseUrlParams(`?tick=${MAX_URL_TICK + 1}`)).toThrow();
  });

  it('reads a day, negative ones too', () => {
    expect(parseUrlParams('?day=5').day).toBe(5);
    expect(parseUrlParams('?day=-3').day).toBe(-3);
    expect(parseUrlParams('?day=5&seed=7')).toMatchObject({ day: 5, seed: 7 });
    expect(() => parseUrlParams('?day=1.5')).toThrow();
    expect(() => parseUrlParams('?day=x')).toThrow();
  });

  it('rejects bad seeds', () => {
    expect(parseUrlParams('?seed=7').seed).toBe(7);
    expect(() => parseUrlParams('?seed=-1')).toThrow();
    expect(() => parseUrlParams('?seed=1.5')).toThrow();
  });

  it('accepts only the hud test card', () => {
    expect(parseUrlParams('?hud=test').hud).toBe('test');
    expect(() => parseUrlParams('?hud=')).toThrow();
    expect(() => parseUrlParams('?hud=speed')).toThrow();
  });

  it('accepts whole cell widths in the dev menu range', () => {
    expect(parseUrlParams('?cell=10').cellWidth).toBe(10);
    expect(parseUrlParams(`?cell=${CELL_WIDTH_MIN}`).cellWidth).toBe(CELL_WIDTH_MIN);
    expect(parseUrlParams(`?cell=${CELL_WIDTH_MAX}`).cellWidth).toBe(CELL_WIDTH_MAX);
    expect(() => parseUrlParams(`?cell=${CELL_WIDTH_MIN - 1}`)).toThrow();
    expect(() => parseUrlParams(`?cell=${CELL_WIDTH_MAX + 1}`)).toThrow();
    expect(() => parseUrlParams('?cell=7.5')).toThrow();
    expect(() => parseUrlParams('?cell=')).toThrow();
  });
});
