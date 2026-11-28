import { describe, expect, it } from 'vitest';
import { createCar } from '../game/car.ts';
import { DRIFT_SLIDE_SPEED, slideSpeed } from '../render/drift.ts';
import { createAudio } from './audio.ts';
import { FakeContext } from './fakeContext.ts';
import { createAudioTuning, DEFAULT_TYRE_TUNING } from './tuning.ts';
import { createScreech, screechSound } from './tyres.ts';

const tuning = DEFAULT_TYRE_TUNING;
const sound = (slide: number, speed = 20) => screechSound({ slide, speed }, tuning);

describe('screechSound', () => {
  it('starts where the drift sparks start', () => {
    expect(tuning.slideStart).toBe(DRIFT_SLIDE_SPEED);
    expect(sound(DRIFT_SLIDE_SPEED).level).toBe(0);
    expect(sound(DRIFT_SLIDE_SPEED + 0.5).level).toBeGreaterThan(0);
  });

  it('is silent below the threshold, and for a standing car whatever the slide says', () => {
    for (const slide of [0, 0.5, 1, 1.9, 2]) expect(sound(slide).level).toBe(0);
    expect(sound(10, 0).level).toBe(0);
    expect(sound(10, 1).level).toBe(0);
  });

  it('is silent driving straight or braking in a straight line: no sideways speed', () => {
    for (const velocityZ of [-30, -10, -1, 5]) {
      const car = { ...createCar(0, 0, 0), velocityZ };
      expect(sound(slideSpeed(car), Math.abs(velocityZ)).level).toBe(0);
    }
  });

  it('fades in steadily with the slide and is capped at full', () => {
    let previous = sound(0);
    for (let slide = 0.05; slide <= 30; slide += 0.05) {
      const next = sound(slide, 40);
      expect(next.level).toBeGreaterThanOrEqual(previous.level);
      expect(next.hertz).toBeGreaterThanOrEqual(previous.hertz);
      previous = next;
    }
    expect(sound(tuning.slideFull, 40).level).toBe(1);
    expect(sound(30, 40).level).toBe(1);
    // A fade, not a switch: halfway through the range is well under full and well over nothing.
    const half = sound((tuning.slideStart + tuning.slideFull) / 2).level;
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.7);
  });

  it('rises a little in pitch with the slide, from the tuned note', () => {
    expect(sound(0).hertz).toBe(tuning.hertz);
    expect(sound(30, 40).hertz).toBeCloseTo(tuning.hertz * (1 + tuning.pitchRise));
    expect(tuning.hertz).toBeGreaterThanOrEqual(1000);
    expect(tuning.hertz * (1 + tuning.pitchRise)).toBeLessThanOrEqual(3000);
  });

  it('stays finite and in range for any input', () => {
    const values = [NaN, Infinity, -Infinity, -1e9, -5, 0, 0.001, 3, 9, 1e9];
    for (const slide of values)
      for (const speed of values) {
        const out = screechSound({ slide, speed }, tuning);
        expect(Number.isFinite(out.level) && Number.isFinite(out.hertz)).toBe(true);
        expect(out.level).toBeGreaterThanOrEqual(0);
        expect(out.level).toBeLessThanOrEqual(1);
        expect(out.hertz).toBeGreaterThan(0);
      }
    // A range of zero width switches rather than dividing by zero.
    const flat = { ...tuning, slideFull: tuning.slideStart };
    expect(screechSound({ slide: 5, speed: 10 }, flat).level).toBe(1);
  });
});

describe('createScreech', () => {
  function setup() {
    const context = new FakeContext();
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(8, false);
    const screech = createScreech(audio, tuning);
    return { context, audio, screech, tuning };
  }
  const level = (context: FakeContext) => context.gains.find((gain) => gain.connections.includes(context.filters.find((f) => f.type === 'highpass')!))!;

  it('builds once on the world bus, high-passed, started and never stopped, every node counted', () => {
    const { audio, screech, context } = setup();
    screech.update({ slide: 10, speed: 20 }, true);
    expect(context.sources).toHaveLength(0);
    audio.start();
    const nodes = audio.stats().nodes;
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].started && context.sources[0].loop).toBe(true);
    const highpass = context.filters.find((filter) => filter.type === 'highpass')!;
    expect(highpass.connections).toEqual([audio.bus('world')]);
    expect(context.filters.filter((filter) => filter.type === 'bandpass')).toHaveLength(3);
    for (let i = 0; i < 100; i++) screech.update({ slide: i / 5, speed: 20 }, i % 2 === 0);
    expect(audio.stats().nodes).toBe(nodes);
    expect(context.sources[0].stopped).toBe(false);
  });

  it('is silent until the car slides, follows the slide and fades out when not heard', () => {
    const { audio, screech, context, tuning } = setup();
    audio.start();
    screech.update({ slide: 0, speed: 20 }, true);
    expect(level(context).gain.value).toBe(0);
    screech.update({ slide: 30, speed: 30 }, true);
    expect(level(context).gain.value).toBeCloseTo(tuning.tyres.gain);
    const main = context.filters.find((filter) => filter.type === 'bandpass')!;
    expect(main.frequency.value).toBe(screech.targets().hertz);
    screech.update({ slide: 30, speed: 30 }, false);
    expect(level(context).gain.value).toBe(0);
  });

  it('skips updates while the context is suspended', () => {
    const { audio, screech, context } = setup();
    audio.start();
    context.state = 'suspended';
    screech.update({ slide: 30, speed: 30 }, true);
    expect(level(context).gain.value).toBe(0);
  });
});
