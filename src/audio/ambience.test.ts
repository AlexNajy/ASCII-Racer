import { describe, expect, it } from 'vitest';
import { dailyRacing, GARAGE, loading, MENU, preRace, race, SETTINGS, type GameState } from '../app/gameState.ts';
import type { Route } from '../game/route.ts';
import { ambienceHeard, ambienceSound, createAmbience } from './ambience.ts';
import { createAudio } from './audio.ts';
import { FakeContext } from './fakeContext.ts';
import { createAudioTuning, DEFAULT_AMBIENCE_TUNING, DEFAULT_ENGINE_TUNING } from './tuning.ts';

const tuning = DEFAULT_AMBIENCE_TUNING;

describe('ambienceHeard', () => {
  const route = {} as Route;
  it('sounds wherever the city is drawn', () => {
    const states: GameState[] = [
      MENU,
      SETTINGS,
      preRace(1, route),
      race('unlimited', route),
      race('unlimited', null),
      dailyRacing(1, route),
      { kind: 'results', mode: 'unlimited', route, ticks: 10, selected: 0 },
      { kind: 'dailyResults', day: 1, ticks: 10, selected: 0 },
      { kind: 'dailyResults', day: 1, ticks: null, selected: 0 },
      loading('unlimited'),
    ];
    for (const state of states) expect(ambienceHeard(state)).toBe(true);
  });
  it('is silent only in the garage', () => {
    expect(ambienceHeard(GARAGE)).toBe(false);
  });
});

describe('ambienceSound', () => {
  const level = (speed: number, topSpeed = 32) => ambienceSound({ speed, topSpeed, car: false }, tuning).level;
  it('is full when standing and ducks steadily with speed, never to nothing', () => {
    expect(level(0)).toBe(1);
    let previous = 1;
    for (let speed = 0; speed <= 60; speed += 0.5) {
      const next = level(speed);
      expect(next).toBeLessThanOrEqual(previous);
      previous = next;
    }
    expect(level(32)).toBeCloseTo(1 - tuning.duck);
    expect(level(-32)).toBeCloseTo(1 - tuning.duck);
    expect(level(1000)).toBeGreaterThan(0);
  });
  it('stays finite and in range for any input', () => {
    const values = [NaN, Infinity, -Infinity, -1e9, -5, 0, 0.001, 30, 1e9];
    for (const speed of values)
      for (const topSpeed of values) {
        const out = ambienceSound({ speed, topSpeed, car: false }, tuning).level;
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1);
      }
    expect(ambienceSound({ speed: 10, topSpeed: 0, car: false }, tuning).level).toBe(1);
  });
  it('is a share lower while the car is heard, standing or driving', () => {
    const car = (speed: number) => ambienceSound({ speed, topSpeed: 32, car: true }, tuning).level;
    expect(car(0)).toBeCloseTo(tuning.carShare);
    expect(car(32)).toBeCloseTo(tuning.carShare * (1 - tuning.duck));
    expect(tuning.carShare).toBeLessThan(1);
  });
});

describe('createAmbience', () => {
  function setup() {
    const context = new FakeContext();
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(8, false);
    const ambience = createAmbience(audio, tuning);
    return { context, audio, ambience, tuning };
  }
  const level = (context: FakeContext) => context.gains.find((gain) => gain.connections.includes(context.filters.find((f) => f.type === 'highpass')!))!;

  it('builds once on the ambience bus, high-passed, started and never stopped, every node counted', () => {
    const { audio, ambience, context } = setup();
    ambience.update({ speed: 0, topSpeed: 30, car: false }, true);
    expect(context.sources).toHaveLength(0);
    const before = context.gains.length + context.filters.length + context.oscillators.length + context.sources.length;
    audio.start();
    const nodes = audio.stats().nodes;
    const made = context.gains.length + context.filters.length + context.oscillators.length + context.sources.length - before;
    expect(context.sources).toHaveLength(3);
    expect(context.sources.every((source) => source.started && source.loop)).toBe(true);
    expect(context.oscillators.every((osc) => (osc as unknown as { started: boolean }).started)).toBe(true);
    const highpass = context.filters.find((filter) => filter.type === 'highpass')!;
    expect(highpass.connections).toEqual([audio.bus('ambience')]);
    expect(context.oscillators).toHaveLength(7);
    expect(made).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) ambience.update({ speed: i / 5, topSpeed: 30, car: false }, i % 3 !== 0);
    ambience.retune();
    expect(audio.stats().nodes).toBe(nodes);
    expect(context.gains.length + context.filters.length + context.oscillators.length + context.sources.length - before).toBe(made);
    expect(context.sources.some((source) => source.stopped)).toBe(false);
  });

  it('loops one buffer at three lengths, so no short cycle carries the noise', () => {
    const { audio, context } = setup();
    audio.start();
    const [whole, ...shorter] = context.sources;
    const seconds = whole.buffer!.getChannelData(0).length / context.sampleRate;
    expect(seconds).toBeGreaterThanOrEqual(12);
    expect(whole.loopEnd).toBe(0);
    expect(shorter).toHaveLength(2);
    const lengths = [seconds, ...shorter.map((source) => source.loopEnd)];
    for (const source of shorter) {
      expect(source.buffer).toBe(whole.buffer);
      expect(source.loopStart).toBe(0);
      expect(source.loopEnd).toBeGreaterThan(6);
      expect(source.loopEnd).toBeLessThan(seconds);
    }
    for (let i = 0; i < lengths.length; i++)
      for (let j = i + 1; j < lengths.length; j++) expect(Math.abs(lengths[i] - lengths[j])).toBeGreaterThan(1);
  });

  it('keeps the slow movements apart: four different rates, all periods over 6 s', () => {
    const { audio, context } = setup();
    audio.start();
    const slow = context.oscillators.map((osc) => osc.frequency.value).filter((hertz) => hertz < 1 / 6);
    expect(slow).toHaveLength(4);
    expect(new Set(slow).size).toBe(4);
  });

  it('fades in when heard, to silence when not, and ducks with speed', () => {
    const { audio, ambience, context, tuning } = setup();
    audio.start();
    ambience.update({ speed: 0, topSpeed: 30, car: false }, false);
    expect(level(context).gain.value).toBe(0);
    ambience.update({ speed: 0, topSpeed: 30, car: false }, true);
    expect(level(context).gain.value).toBeCloseTo(tuning.ambience.gain);
    ambience.update({ speed: 0, topSpeed: 30, car: true }, true);
    expect(level(context).gain.value).toBeCloseTo(tuning.ambience.gain * tuning.ambience.carShare);
    ambience.update({ speed: 30, topSpeed: 30, car: false }, true);
    expect(level(context).gain.value).toBeCloseTo(tuning.ambience.gain * (1 - tuning.ambience.duck));
    ambience.update({ speed: 30, topSpeed: 30, car: false }, false);
    expect(level(context).gain.value).toBe(0);
  });

  it('skips updates while the context is suspended', () => {
    const { audio, ambience, context } = setup();
    audio.start();
    context.state = 'suspended';
    ambience.update({ speed: 0, topSpeed: 30, car: false }, true);
    expect(level(context).gain.value).toBe(0);
  });

  it('is on the bus list with a level of its own', () => {
    expect(createAudioTuning().busGains.ambience).toBe(1);
  });
});

describe('the hum against the idling engine', () => {
  const HARMONICS = 8;
  const MIN_GAP_HERTZ = 4;
  it('has no tone near a low harmonic of the idle note, which would beat', () => {
    const { humHertz } = DEFAULT_AMBIENCE_TUNING;
    const { idleHertz, detuneCents } = DEFAULT_ENGINE_TUNING;
    const spread = 2 ** (detuneCents / 1200);
    const engine = [idleHertz / 2];
    for (let k = 1; k <= HARMONICS; k++) engine.push(idleHertz * k, idleHertz * k * spread, idleHertz * k / spread);
    for (const multiple of [1, 2, 3])
      for (const note of engine) expect(Math.abs(humHertz * multiple - note)).toBeGreaterThan(MIN_GAP_HERTZ);
  });
});
