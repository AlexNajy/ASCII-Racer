import { describe, expect, it } from 'vitest';
import { RenderMode } from './menu.ts';
import { MAX_URL_TICK, parseUrlParams } from './urlParams.ts';
import { CELL_WIDTH_MAX, CELL_WIDTH_MIN } from './menu.ts';

describe('parseUrlParams', () => {
  it('is a no-op without parameters', () => {
    expect(parseUrlParams('')).toEqual({ seed: null, renderMode: null, camera: null, tick: null, shot: false, drive: false, hud: null, cellWidth: null });
  });

  it('reads drive=1 and nothing else as driving', () => {
    expect(parseUrlParams('?drive=1').drive).toBe(true);
    expect(parseUrlParams('?drive=0').drive).toBe(false);
    expect(parseUrlParams('?drive').drive).toBe(false);
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
