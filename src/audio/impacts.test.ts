import { describe, expect, it } from 'vitest';
import { createAudio } from './audio.ts';
import { FakeContext } from './fakeContext.ts';
import { allowThud, createThuds, NODES_PER_THUD, thudGate, thudSound } from './impacts.ts';
import { createAudioTuning, DEFAULT_IMPACT_TUNING } from './tuning.ts';

const tuning = DEFAULT_IMPACT_TUNING;
const DEBRIS_MIN_SPEED = 3; // main.ts's: every hit that throws debris should thud

describe('thudSound', () => {
  it('is silent below the threshold, a 1 m/s nudge included, and sounds for every hit that throws debris', () => {
    for (const speed of [0, 0.14, 0.5, 1, tuning.minSpeed - 0.01]) expect(thudSound(speed, tuning).level).toBe(0);
    expect(tuning.minSpeed).toBeGreaterThan(1);
    expect(tuning.minSpeed).toBeLessThanOrEqual(DEBRIS_MIN_SPEED);
    expect(thudSound(DEBRIS_MIN_SPEED, tuning).level).toBeGreaterThan(0);
    expect(thudSound(tuning.minSpeed, tuning).level).toBeCloseTo(tuning.minLevel);
  });

  it('grows louder, higher and brighter with the speed and is capped at a big hit', () => {
    let previous = thudSound(tuning.minSpeed, tuning);
    for (let speed = tuning.minSpeed + 0.1; speed <= 60; speed += 0.1) {
      const next = thudSound(speed, tuning);
      expect(next.level).toBeGreaterThanOrEqual(previous.level);
      expect(next.startHertz).toBeGreaterThanOrEqual(previous.startHertz);
      expect(next.crunch).toBeGreaterThanOrEqual(previous.crunch);
      expect(next.crunchHertz).toBeGreaterThanOrEqual(previous.crunchHertz);
      previous = next;
    }
    const full = thudSound(tuning.fullSpeed, tuning);
    expect(full.level).toBe(1);
    expect(thudSound(60, tuning)).toEqual(full);
    expect(full.startHertz).toBe(tuning.bodyStartHertz);
    expect(full.crunchHertz).toBeCloseTo(tuning.crunchHighHertz);
    expect(thudSound(8, tuning).level).toBeLessThan(0.7);
  });

  it('starts the body above what small speakers drop and ends above the infrasound', () => {
    expect(thudSound(tuning.minSpeed, tuning).startHertz).toBeGreaterThan(200);
    expect(tuning.bodyEndHertz).toBeGreaterThan(40);
    expect(thudSound(tuning.minSpeed, tuning).crunchHertz).toBeGreaterThan(200);
  });

  it('stays finite for any input', () => {
    for (const speed of [NaN, Infinity, -Infinity, -1e9, -3, 0, 2, 1e9]) {
      const out = thudSound(speed, tuning);
      for (const value of Object.values(out)) expect(Number.isFinite(value)).toBe(true);
      expect(out.level).toBeGreaterThanOrEqual(0);
      expect(out.level).toBeLessThanOrEqual(1);
    }
    expect(thudSound(5, { ...tuning, fullSpeed: tuning.minSpeed }).level).toBe(1);
  });
});

describe('allowThud', () => {
  const WALL = [0, 1] as const; // normal of a wall facing +z
  const OTHER = [1, 0] as const;
  const allow = (gate: ReturnType<typeof thudGate>, speed: number, now: number, playing = 0, wall: readonly number[] = WALL) =>
    allowThud(gate, speed, wall[0], wall[1], now, playing, tuning);

  it('keeps a minimum gap and a cap on thuds sounding at once against hits that are not clearly harder', () => {
    const gate = thudGate();
    expect(allow(gate, 10, 1)).toBe(true);
    expect(allow(gate, 12, 1 + tuning.minGapSeconds / 2, 0, OTHER)).toBe(false);
    expect(allow(gate, 12, 1 + tuning.minGapSeconds, 0, OTHER)).toBe(true);
    expect(allow(gate, 12, 10, tuning.maxPlaying, WALL)).toBe(false);
    expect(allow(gate, 12, 10.1, tuning.maxPlaying - 1, OTHER)).toBe(true);
  });

  it('always plays a hit harder than the last thud, inside the gap and at the cap', () => {
    const gate = thudGate();
    // A faint contact, then the crash 17 ms later (the reviewer's seed 1 sequence).
    expect(allow(gate, 2.0, 5)).toBe(true);
    expect(allow(gate, 13.2, 5 + 1 / 60)).toBe(true);
    expect(allow(gate, 30, 5 + 2 / 60, tuning.maxPlaying)).toBe(true);
    // Not clearly harder than the last thud: refused by the gap.
    expect(allow(gate, 30 * (tuning.harderRatio - 0.05), 5 + 3 / 60, 0, OTHER)).toBe(false);
  });

  it('masks a softer hit on the same wall after a loud one, but not one on a different wall', () => {
    const gate = thudGate();
    expect(allow(gate, 20, 0)).toBe(true);
    expect(allow(gate, 10, 0.25)).toBe(false);
    expect(allow(gate, 8, 0.25 + 0.5, 0, [0.1, 0.995])).toBe(false);
    const other = thudGate();
    expect(allow(other, 20, 0)).toBe(true);
    expect(allow(other, 10, 0.25, 0, OTHER)).toBe(true);
    expect(allow(other, 6, 0.5, 0, WALL)).toBe(true);
  });

  it('thuds once for an equal-speed stream on one wall, and for a falling one', () => {
    const gate = thudGate();
    let played = 0;
    for (let tick = 0; tick < 120; tick++) if (allow(gate, 3, tick / 60)) played++;
    expect(played).toBe(1);
    const falling = thudGate();
    expect(allow(falling, 19.7, 0)).toBe(true);
    played = 0;
    // Pushed along the wall after the hit: an impact every tick, 4.3 m/s falling by about 0.11 each tick and on
    // below 1 m/s (measured on seed 1's outer wall).
    for (let tick = 1; tick < 300; tick++) {
      const speed = Math.max(0.5, 4.3 - tick * 0.11);
      if (thudSound(speed, tuning).level > 0 && allow(falling, speed, tick / 60)) played++;
    }
    expect(played).toBe(0);
    // Masking fades once the contact stops: the same soft hit later plays.
    expect(allow(falling, 3, 6)).toBe(true);
  });

  it('sounds both hits of a bounce between two facing walls', () => {
    const gate = thudGate();
    expect(allow(gate, 12, 0, 0, [0, 1])).toBe(true);
    expect(allow(gate, 9, 0.3, 0, [0, -1])).toBe(true);
    expect(allow(gate, 7, 0.6, 0, [0, 1])).toBe(true);
  });
});

describe('createThuds', () => {
  function setup() {
    const context = new FakeContext();
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(8, false);
    const thuds = createThuds(audio, tuning);
    return { context, audio, thuds, tuning };
  }

  it('does nothing before the context exists, while it is suspended or when the car is not heard', () => {
    const { audio, thuds, context } = setup();
    expect(thuds.hit(20, 0, 1, true)).toBe(false);
    audio.start();
    const nodes = audio.stats().nodes;
    expect(thuds.hit(20, 0, 1, false)).toBe(false);
    context.state = 'suspended';
    expect(thuds.hit(20, 0, 1, true)).toBe(false);
    expect(audio.stats().nodes).toBe(nodes);
    expect(thuds.played()).toBe(0);
  });

  it('plays one thud per hit on a shared high-pass into the world bus, and releases its nodes when it ends', () => {
    const { audio, thuds, context } = setup();
    audio.start();
    const nodes = audio.stats().nodes;
    const highpass = context.filters.find((filter) => filter.type === 'highpass')!;
    expect(highpass.connections).toEqual([audio.bus('world')]);
    expect(thuds.hit(1, 0, 1, true)).toBe(false);
    expect(thuds.hit(12, 0, 1, true)).toBe(true);
    expect(audio.stats().nodes).toBe(nodes + NODES_PER_THUD);
    expect(thuds.playing()).toBe(1);
    const body = context.oscillators[context.oscillators.length - 1];
    expect(body.type).toBe('triangle');
    const gains = context.gains.slice(-2);
    expect(gains.every((gain) => gain.connections.includes(highpass))).toBe(true);
    body.onended!();
    expect(audio.stats().nodes).toBe(nodes);
    expect(thuds.playing()).toBe(0);
    expect(gains.every((gain) => gain.disconnected)).toBe(true);
    expect(context.sources[context.sources.length - 1].stopped).toBe(true);
  });

  it('keeps the gap on the context clock and caps thuds sounding at once', () => {
    const { audio, thuds, context, tuning } = setup();
    audio.start();
    const nodes = audio.stats().nodes;
    // Several ticks in one frame share the clock: an equal hit is refused, a clearly harder one plays.
    expect(thuds.hit(20, 0, 1, true)).toBe(true);
    expect(thuds.hit(22, 1, 0, true)).toBe(false);
    // Hits on alternating walls a gap apart, none ending: the cap stops the stack.
    for (let i = 1; i < 10; i++) {
      context.currentTime = 1 + i * tuning.impacts.minGapSeconds * 1.01;
      thuds.hit(20, i % 2, 1 - (i % 2), true);
    }
    expect(thuds.playing()).toBe(tuning.impacts.maxPlaying);
    expect(audio.stats().nodes).toBe(nodes + NODES_PER_THUD * tuning.impacts.maxPlaying);
    for (const osc of context.oscillators) osc.onended?.();
    expect(audio.stats().nodes).toBe(nodes);
    expect(thuds.played()).toBe(tuning.impacts.maxPlaying);
  });

  it('starts each crunch at a different place in the noise, never past its end', () => {
    const { audio, thuds, context, tuning } = setup();
    audio.start();
    const offsets = new Set<number>();
    for (let i = 0; i < 20; i++) {
      context.currentTime = i + 1;
      expect(thuds.hit(12, 0, 1, true)).toBe(true);
      const source = context.sources[context.sources.length - 1];
      offsets.add(source.offset);
      expect(source.offset).toBeGreaterThanOrEqual(0);
      expect(source.offset + tuning.impacts.crunchSeconds).toBeLessThan(0.5);
      for (const osc of context.oscillators) osc.onended?.();
    }
    expect(offsets.size).toBeGreaterThan(10);
  });
});
