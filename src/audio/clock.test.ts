import { describe, expect, it } from 'vitest';
import { createAudio } from './audio.ts';
import { createAmbience } from './ambience.ts';
import { createEngine } from './engine.ts';
import { FakeContext } from './fakeContext.ts';
import { createThuds } from './impacts.ts';
import { createRaceSounds } from './raceSounds.ts';
import { createScreech } from './tyres.ts';
import { createAudioTuning } from './tuning.ts';

// Chrome reports `running` at construction while currentTime is 0 until the output device starts.
describe('a running context whose clock has not started', () => {
  function setup() {
    const context = new FakeContext();
    context.held = true;
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(10, false);
    audio.start();
    return { context, audio, tuning };
  }
  const values = (context: FakeContext) => [...context.gains.map((g) => g.gain.value), ...context.oscillators.map((o) => o.frequency.value), ...context.filters.map((f) => f.frequency.value)];

  it('gives no context, so race sounds, thuds and the blip schedule nothing and make no nodes', () => {
    const { context, audio, tuning } = setup();
    const sounds = createRaceSounds(audio, tuning);
    const thuds = createThuds(audio, tuning);
    expect(audio.context()).toBeNull();
    const nodes = audio.stats().nodes;
    const oscillators = context.oscillators.length;
    expect(sounds.play('beep')).toBeNull();
    expect(thuds.hit(20, 0, 1, true)).toBe(false);
    audio.blip();
    expect(context.oscillators).toHaveLength(oscillators);
    expect(audio.stats().nodes).toBe(nodes);
    expect(sounds.played()).toBe(0);
    expect(thuds.played()).toBe(0);
  });

  it('plays them once the clock moves', () => {
    const { context, audio, tuning } = setup();
    const sounds = createRaceSounds(audio, tuning);
    const thuds = createThuds(audio, tuning);
    context.held = false;
    context.currentTime = 0.5;
    expect(audio.context()).toBe(context);
    expect(sounds.play('beep')).toBeGreaterThan(0.5);
    expect(thuds.hit(20, 0, 1, true)).toBe(true);
    const before = context.oscillators.length;
    audio.blip();
    expect(context.oscillators.length).toBe(before + 1);
  });

  it('holds the continuous sounds until the clock moves, then drives them', () => {
    const { context, audio, tuning } = setup();
    const engine = createEngine(audio, tuning);
    const screech = createScreech(audio, tuning);
    const ambience = createAmbience(audio, tuning);
    const update = () => {
      engine.update({ speed: 15, topSpeed: 30, throttle: 1, brake: 0 }, true);
      screech.update({ slide: 9, speed: 20 }, true);
      ambience.update({ speed: 15, topSpeed: 30, car: true }, true);
    };
    const idle = values(context);
    update();
    engine.retune();
    screech.retune();
    ambience.retune();
    expect(values(context)).toEqual(idle);
    context.held = false;
    context.currentTime = 0.2;
    update();
    expect(values(context)).not.toEqual(idle);
  });

  it('applies levels set during the gap', () => {
    const { context, audio } = setup();
    audio.setLevels(4, false);
    const four = audio.stats().masterGain;
    expect(four).toBeGreaterThan(0);
    audio.setLevels(4, true);
    expect(audio.stats().masterGain).toBe(0);
    audio.setLevels(7, false);
    audio.setHidden(true);
    expect(audio.stats().masterGain).toBe(0);
    audio.setHidden(false);
    context.held = false;
    expect(audio.stats().masterGain).toBeGreaterThan(four);
  });
});
