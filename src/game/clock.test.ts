import { describe, expect, it } from 'vitest';
import { MAX_FRAME_SECONDS, TICKS_PER_SECOND, TICK_SECONDS, advanceClock, capFrameSeconds, createClock } from './clock';

function run(frames: number[]): { ticks: number[]; clock: ReturnType<typeof createClock> } {
  const clock = createClock();
  const ticks: number[] = [];
  for (const frame of frames) advanceClock(clock, frame, (tick) => ticks.push(tick));
  return { ticks, clock };
}

describe('advanceClock', () => {
  it('runs one step per whole tick, numbered from 0', () => {
    const { ticks, clock } = run([TICK_SECONDS * 3.5]);
    expect(ticks).toEqual([0, 1, 2]);
    expect(clock.tick).toBe(3);
  });

  it('carries the remainder over to the next frame', () => {
    const { ticks, clock } = run([TICK_SECONDS * 0.6, TICK_SECONDS * 0.6]);
    expect(ticks).toEqual([0]);
    expect(clock.leftover).toBeCloseTo(TICK_SECONDS * 0.2, 12);
  });

  it('runs no step for a frame shorter than a tick', () => {
    expect(run([TICK_SECONDS / 2]).ticks).toEqual([]);
  });

  it('counts the same ticks however the time is split into frames', () => {
    const whole = run([1]).clock.tick;
    const split = run(Array.from({ length: 100 }, () => 0.01)).clock.tick;
    expect(Math.abs(whole - split)).toBeLessThanOrEqual(1);
    expect(whole).toBeGreaterThanOrEqual(TICKS_PER_SECOND - 1);
  });
});

describe('capFrameSeconds', () => {
  it('keeps short frames and caps long ones, so a slow frame runs at most 6 ticks', () => {
    expect(capFrameSeconds(0.016)).toBe(0.016);
    expect(capFrameSeconds(10)).toBe(MAX_FRAME_SECONDS);
    expect(run([capFrameSeconds(10)]).ticks.length).toBeLessThanOrEqual(6);
  });
});
