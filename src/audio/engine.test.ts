import { describe, expect, it } from 'vitest';
import { dailyRacing, GARAGE, loading, MENU, preRace, race, SETTINGS, type GameState } from '../app/gameState.ts';
import type { Route } from '../game/route.ts';
import { createAudio } from './audio.ts';
import { createEngine, engineGear, engineHeard, engineSound, engineSpeed, REVERSE_GEAR, type EngineInput } from './engine.ts';
import { FakeContext } from './fakeContext.ts';
import { createAudioTuning, DEFAULT_ENGINE_TUNING, type EngineTuning } from './tuning.ts';

const tuning = DEFAULT_ENGINE_TUNING;
const TOP = 32;

function sound(speed: number, pedals: Partial<EngineInput> = {}, previousGear = 0, engine: EngineTuning = tuning) {
  return engineSound({ speed, topSpeed: TOP, throttle: 0, brake: 0, previousGear, ...pedals }, engine);
}

// Sweeps speed up (or down) in small steps, carrying the gear like the frame loop does.
function sweep(from: number, to: number, pedals: Partial<EngineInput>, topSpeed = TOP, steps = 2000) {
  const out = [];
  let gear = 0;
  for (let i = 0; i <= steps; i++) {
    const speed = from + ((to - from) * i) / steps;
    const targets = engineSound({ speed, topSpeed, throttle: 0, brake: 0, previousGear: gear, ...pedals }, tuning);
    gear = targets.gear;
    out.push({ speed, ...targets });
  }
  return out;
}

describe('engineSound', () => {
  it('idles on a low steady note with a wobble, standing with no pedal', () => {
    const idle = sound(0);
    expect(idle.gear).toBe(0);
    expect(idle.hertz).toBe(tuning.idleHertz);
    expect(idle.level).toBeCloseTo(tuning.idleLevel);
    expect(idle.cutoff).toBe(tuning.minCutoff);
    expect(idle.wobble).toBe(tuning.wobbleCents);
    expect(idle.noise).toBe(tuning.noiseIdle);
  });

  it('revs up standing with the throttle (clutch slipping as it pulls away)', () => {
    const revving = sound(0, { throttle: 1 });
    expect(revving.hertz).toBe(tuning.idleHertz + tuning.launchHertz);
    expect(revving.level).toBeGreaterThan(sound(0).level);
  });

  it('climbs within each gear and drops at every upshift', () => {
    const run = sweep(0, TOP, { throttle: 1 });
    const shifts = [];
    for (let i = 1; i < run.length; i++) {
      if (run[i].gear !== run[i - 1].gear) {
        expect(run[i].gear).toBe(run[i - 1].gear + 1);
        expect(run[i].hertz).toBeLessThan(run[i - 1].hertz * 0.9);
        shifts.push(run[i].speed);
      } else {
        expect(run[i].hertz).toBeGreaterThanOrEqual(run[i - 1].hertz);
      }
    }
    expect(shifts).toHaveLength(tuning.gearTops.length - 1);
    const top = run[run.length - 1];
    expect(top.gear).toBe(tuning.gearTops.length - 1);
    expect(top.hertz).toBeGreaterThan(tuning.shiftHertz * 0.95);
    // Each gear is entered low and climbs well above where it started.
    for (let gear = 1; gear < tuning.gearTops.length; gear++) {
      const inGear = run.filter((sample) => sample.gear === gear).map((sample) => sample.hertz);
      expect(Math.max(...inGear) - Math.min(...inGear)).toBeGreaterThan(20);
    }
  });

  it('shifts down on the way back and ends in first', () => {
    const run = sweep(TOP, 0, {});
    for (let i = 1; i < run.length; i++) expect(run[i].gear).toBeLessThanOrEqual(run[i - 1].gear);
    expect(run[run.length - 1].gear).toBe(0);
  });

  it('does not hunt at a gear boundary: a speed wobbling ±0.5 m/s around it shifts at most once', () => {
    for (const top of tuning.gearTops.slice(0, -1)) {
      const boundary = top * TOP;
      for (const start of [0, 3]) {
        let gear = start === 0 ? engineGear(boundary / TOP - 0.1, 0, tuning) : tuning.gearTops.length - 1;
        gear = engineSound({ speed: boundary, topSpeed: TOP, throttle: 1, brake: 0, previousGear: gear }, tuning).gear;
        let changes = 0;
        for (let i = 0; i < 600; i++) {
          const speed = boundary + 0.5 * Math.sin(i * 0.37);
          const next = engineSound({ speed, topSpeed: TOP, throttle: 1, brake: 0, previousGear: gear }, tuning).gear;
          if (next !== gear) changes++;
          gear = next;
        }
        expect(changes).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is louder and brighter at full throttle than coasting at the same speed, and quieter still braking', () => {
    for (const speed of [5, 10, 20, 30]) {
      const gear = engineGear(speed / TOP, 0, tuning);
      const load = sound(speed, { throttle: 1 }, gear);
      const coast = sound(speed, {}, gear);
      const brake = sound(speed, { brake: 1 }, gear);
      expect(load.hertz).toBe(coast.hertz);
      expect(load.level).toBeGreaterThan(coast.level * 1.3);
      expect(load.cutoff).toBeGreaterThan(coast.cutoff);
      if (speed >= 10) expect(load.cutoff).toBeGreaterThan(coast.cutoff * 1.1);
      expect(load.noise).toBeGreaterThan(coast.noise);
      expect(brake.level).toBeLessThan(coast.level);
      expect(brake.cutoff).toBeLessThanOrEqual(coast.cutoff);
      expect(brake.hertz).toBe(coast.hertz);
    }
  });

  it('reverses in one low gear, either pedal loading the engine', () => {
    const run = sweep(0, -TOP / 2, { brake: 1 });
    const backwards = run.filter((sample) => sample.speed < -1);
    expect(backwards.every((sample) => sample.gear === REVERSE_GEAR)).toBe(true);
    for (let i = 1; i < backwards.length; i++) expect(backwards[i].hertz).toBeGreaterThanOrEqual(backwards[i - 1].hertz);
    const reversing = sound(-5, { brake: 1 }, REVERSE_GEAR);
    const coasting = sound(-5, {}, REVERSE_GEAR);
    expect(reversing.level).toBeGreaterThan(coasting.level);
    expect(sound(-5, { throttle: 1 }, REVERSE_GEAR).level).toBeGreaterThan(coasting.level);
    // One gear: it never shifts, and reverse has its own lower ceiling, off the maximum note.
    const fastest = backwards[backwards.length - 1].hertz;
    expect(fastest).toBeGreaterThan(tuning.shiftHertz);
    expect(fastest).toBeLessThan(tuning.maxHertz * 0.95);
    // Out of reverse into first once moving forwards.
    expect(sound(1, { throttle: 1 }, REVERSE_GEAR).gear).toBe(0);
  });

  it('never dips under idle while the engine is heard, braking included', () => {
    const idle = sound(0).level;
    for (const speed of [-20, -4, -1, 1, 4, 14, 30])
      for (const throttle of [0, 1])
        for (const brake of [0, 1]) {
          const gear = engineGear(speed / TOP, 0, tuning);
          expect(sound(speed, { throttle, brake }, gear).level).toBeGreaterThanOrEqual(idle - 1e-9);
        }
    expect(sound(14, { brake: 1 }, 1).level).toBeLessThan(sound(14, {}, 1).level);
  });

  it('keeps the roar through a wall bounce: a pedal held against the car moving back is not a stall', () => {
    const idle = sound(0).level;
    // Full throttle after a head-on hit leaves the car moving backwards.
    const bounced = sound(-4, { throttle: 1 }, 2);
    expect(bounced.gear).toBe(REVERSE_GEAR);
    expect(bounced.level).toBeGreaterThanOrEqual(idle);
    expect(bounced.level).toBeGreaterThanOrEqual(sound(-4, {}, REVERSE_GEAR).level);
    // The same the other way round: reverse into a wall with the brake held, now moving forwards.
    const forward = sound(4, { brake: 1 }, REVERSE_GEAR);
    expect(forward.gear).toBe(0);
    expect(forward.level).toBeGreaterThanOrEqual(idle);
  });

  it('scales the gears with the top speed setting', () => {
    for (const topSpeed of [16, 60]) {
      const run = sweep(0, topSpeed, { throttle: 1 }, topSpeed);
      const firstShift = run.find((sample) => sample.gear === 1)!.speed;
      expect(firstShift / topSpeed).toBeCloseTo(tuning.gearTops[0] + tuning.shiftHysteresis, 2);
    }
  });

  it('stays finite and inside sane bounds for any input', () => {
    const speeds = [-1000, -64, -32, -0.01, 0, 0.01, 5, 32, 40, 64, 1000, 1e9, -1e9];
    const tops = [0, -5, 0.001, 5, 32, 60];
    const pedals = [0, 0.5, 1, 2, -1];
    for (const speed of speeds)
      for (const topSpeed of tops)
        for (const throttle of pedals)
          for (const brake of pedals)
            for (const previousGear of [REVERSE_GEAR, 0, 2, 4, 9, -7, 1.5]) {
              const targets = engineSound({ speed, topSpeed, throttle, brake, previousGear }, tuning);
              for (const value of Object.values(targets)) expect(Number.isFinite(value)).toBe(true);
              expect(targets.hertz).toBeGreaterThanOrEqual(tuning.idleHertz);
              expect(targets.hertz).toBeLessThanOrEqual(tuning.maxHertz);
              expect(targets.level).toBeGreaterThanOrEqual(0);
              expect(targets.level).toBeLessThanOrEqual(1);
              expect(targets.cutoff).toBeGreaterThanOrEqual(tuning.minCutoff);
              expect(targets.cutoff).toBeLessThanOrEqual(tuning.maxCutoff);
              expect(targets.gear).toBeGreaterThanOrEqual(REVERSE_GEAR);
              expect(targets.gear).toBeLessThan(tuning.gearTops.length);
              expect(Number.isInteger(targets.gear)).toBe(true);
            }
  });

  it('reads past top speed (a lowered slider) as top gear, capped at the maximum note', () => {
    const over = sound(64, { throttle: 1 }, 4);
    expect(over.gear).toBe(4);
    expect(over.hertz).toBe(tuning.maxHertz);
  });
});

describe('engineSpeed', () => {
  it('is the speed, negative when the car moves tail first', () => {
    expect(engineSpeed({ heading: 0, velocityX: 0, velocityZ: -10 })).toBeCloseTo(10);
    expect(engineSpeed({ heading: 0, velocityX: 0, velocityZ: 10 })).toBeCloseTo(-10);
    // Sliding sideways keeps the revs.
    expect(engineSpeed({ heading: 0, velocityX: 6, velocityZ: -8 })).toBeCloseTo(10);
  });
});

describe('engineHeard', () => {
  const route = {} as Route;
  it('sounds while the player car is in the world', () => {
    expect(engineHeard(preRace(1, route), false)).toBe(true);
    expect(engineHeard(race('unlimited', route), true)).toBe(true);
    expect(engineHeard(race('unlimited', null), false)).toBe(true);
    expect(engineHeard(dailyRacing(1, route), true)).toBe(true);
    expect(engineHeard({ kind: 'results', mode: 'unlimited', route, ticks: 10, selected: 0 }, true)).toBe(true);
    expect(engineHeard({ kind: 'dailyResults', day: 1, ticks: 10, selected: 0 }, true)).toBe(true);
  });
  it('is silent on the menu screens, loading and in the garage', () => {
    const silent: GameState[] = [MENU, SETTINGS, GARAGE, loading('unlimited'), { kind: 'dailyResults', day: 1, ticks: null, selected: 0 }];
    for (const state of silent) expect(engineHeard(state, false)).toBe(false);
  });
});

describe('createEngine', () => {
  function setup() {
    const context = new FakeContext();
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(8, false);
    const engine = createEngine(audio, tuning);
    return { context, audio, engine, tuning };
  }
  const drive = { speed: 10, topSpeed: TOP, throttle: 1, brake: 0 };

  it('builds nothing and does nothing before the context exists', () => {
    const { audio, engine, context } = setup();
    engine.update(drive, true);
    expect(context.oscillators).toHaveLength(0);
    expect(audio.stats().nodes).toBe(0);
  });

  it('builds once on the world bus, every node counted, and the count stays flat while it plays', () => {
    const { audio, engine, context } = setup();
    audio.start();
    const nodes = audio.stats().nodes;
    expect(nodes).toBeGreaterThan(5);
    expect(context.oscillators.every((osc) => (osc as unknown as { started: boolean }).started)).toBe(true);
    expect(context.sources.every((source) => source.started && source.loop)).toBe(true);
    const level = context.gains[context.gains.length - 1];
    const highpass = context.filters.find((filter) => filter.type === 'highpass')!;
    expect(level.connections).toEqual([highpass]);
    expect(highpass.connections).toEqual([audio.bus('world')]);
    expect(highpass.frequency.value).toBe(DEFAULT_ENGINE_TUNING.highpassHertz);
    for (let i = 0; i < 100; i++) engine.update({ ...drive, speed: i / 3 }, true);
    expect(audio.stats().nodes).toBe(nodes);
    audio.start();
    expect(audio.stats().nodes).toBe(nodes);
  });

  it('drives the nodes to the targets and fades to 0 when not heard', () => {
    const { audio, engine, context, tuning } = setup();
    audio.start();
    engine.update(drive, true);
    const level = context.gains[context.gains.length - 1];
    const targets = engine.targets();
    expect(level.gain.value).toBeCloseTo(targets.level * tuning.engine.gain);
    expect(context.oscillators[0].frequency.value).toBe(targets.hertz);
    expect(context.filters.find((filter) => filter.type === 'lowpass')!.frequency.value).toBe(targets.cutoff);
    engine.update(drive, false);
    expect(level.gain.value).toBe(0);
  });

  it('keeps the gear between updates, so shifts have hysteresis', () => {
    const { audio, engine } = setup();
    audio.start();
    const edge = tuning.gearTops[0] * TOP;
    engine.update({ ...drive, speed: edge + 2 }, true);
    expect(engine.targets().gear).toBe(1);
    engine.update({ ...drive, speed: edge - 0.5 }, true);
    expect(engine.targets().gear).toBe(1);
  });

  it('skips updates while the context is suspended', () => {
    const { audio, engine, context } = setup();
    audio.start();
    context.state = 'suspended';
    engine.update(drive, true);
    expect(context.gains[context.gains.length - 1].gain.value).toBe(0);
  });
});
