import { describe, expect, it } from 'vitest';
import { createAudio } from './audio.ts';
import { FakeContext } from './fakeContext.ts';
import {
  createRaceCues,
  createRaceSounds,
  NODES_PER_NOTE,
  observeRace,
  RACE_SOUND_KINDS,
  raceSound,
  takeCue,
  type RaceCues,
  type RaceSoundKind,
} from './raceSounds.ts';
import { createAudioTuning, DEFAULT_RACE_SOUND_TUNING } from './tuning.ts';
import { COUNTDOWN_TICKS, createRace, type Race, type RaceEvent } from '../game/race.ts';
import type { Route } from '../game/route.ts';

const tuning = DEFAULT_RACE_SOUND_TUNING;

describe('raceSound', () => {
  it('gives finite notes in a range that is clear of the engine, with sensible lengths', () => {
    for (const kind of RACE_SOUND_KINDS) {
      const notes = raceSound(kind, tuning);
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes) {
        expect(Number.isFinite(note.hertz + note.start + note.seconds + note.level)).toBe(true);
        expect(note.hertz).toBeGreaterThanOrEqual(500);
        expect(note.hertz * 2).toBeLessThan(6000);
        expect(note.start).toBeGreaterThanOrEqual(0);
        expect(note.seconds).toBeGreaterThan(0);
        expect(note.level).toBeGreaterThan(0);
        expect(note.level).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('makes the go note higher and longer than the beep, the checkpoint rise short and the finish about a second', () => {
    const [beep] = raceSound('beep', tuning);
    const [go] = raceSound('go', tuning);
    expect(go.hertz).toBeGreaterThan(beep.hertz);
    expect(go.seconds).toBeGreaterThan(beep.seconds);
    const [low, high] = raceSound('checkpoint', tuning);
    expect(high.hertz).toBeGreaterThan(low.hertz);
    expect(high.start).toBeGreaterThan(low.start);
    expect(high.start + high.seconds).toBeLessThan(0.5);
    const finish = raceSound('finish', tuning);
    expect(finish).toHaveLength(4);
    for (let i = 1; i < finish.length; i++) {
      expect(finish[i].hertz).toBeGreaterThan(finish[i - 1].hertz);
      expect(finish[i].start).toBeGreaterThan(finish[i - 1].start);
    }
    const last = finish[finish.length - 1];
    expect(last.start + last.seconds).toBeGreaterThan(0.8);
    expect(last.start + last.seconds).toBeLessThan(1.3);
  });

  it('survives nonsense tuning', () => {
    const bad = { ...tuning, baseHertz: NaN, beepLevel: -1, checkpointGap: NaN, gain: Infinity };
    for (const kind of RACE_SOUND_KINDS) {
      for (const note of raceSound(kind, bad)) expect(Number.isFinite(note.hertz + note.seconds + note.level)).toBe(true);
    }
  });
});

describe('race cues', () => {
  const route = {} as Route;
  const start = (tick: number): Race => createRace(route, tick);

  // Runs `ticks` ticks from `from`, calling the events by tick, and returns the cue taken after them as a frame would.
  function frame(cues: RaceCues, race: Race | null, from: number, ticks: number, events: Record<number, RaceEvent> = {}) {
    for (let tick = from + 1; tick <= from + ticks; tick++) observeRace(cues, race, tick, events[tick] ?? null);
    observeRace(cues, race, from + ticks, null);
    return takeCue(cues);
  }

  function run(cues: RaceCues, race: Race | null, fromTick: number, toTick: number, perFrame: number, events: Record<number, RaceEvent> = {}) {
    const played: { tick: number; kind: RaceSoundKind }[] = [];
    for (let tick = fromTick; tick < toTick; ) {
      const ticks = Math.min(perFrame, toTick - tick);
      const cue = frame(cues, race, tick, ticks, events);
      tick += ticks;
      if (cue) played.push({ tick, kind: cue });
    }
    return played;
  }

  it('beeps for 3, 2 and 1 a second apart, then the go sound at the go tick', () => {
    const cues = createRaceCues();
    const race = start(1000);
    const first = frame(cues, race, 1000, 0);
    expect(first).toBe('beep');
    const played = run(cues, race, 1000, 1000 + COUNTDOWN_TICKS + 30, 1, { [1000 + COUNTDOWN_TICKS]: { kind: 'go' } });
    expect(played).toEqual([
      { tick: 1060, kind: 'beep' },
      { tick: 1120, kind: 'beep' },
      { tick: 1180, kind: 'go' },
    ]);
  });

  it('plays one sound for six ticks in one frame, the latest, across a number change', () => {
    const cues = createRaceCues();
    const race = start(0);
    frame(cues, race, 0, 0);
    expect(run(cues, race, 0, 57, 1)).toEqual([]);
    expect(frame(cues, race, 57, 6)).toBe('beep');
    expect(takeCue(cues)).toBeNull();
    const go = frame(cues, race, COUNTDOWN_TICKS - 3, 6, { [COUNTDOWN_TICKS]: { kind: 'go' } });
    expect(go).toBe('go');
  });

  it('plays a checkpoint for a gate and the finish figure instead of a checkpoint', () => {
    const cues = createRaceCues();
    const race = start(0);
    race.phase = 'running';
    observeRace(cues, race, 500, null);
    takeCue(cues);
    expect(frame(cues, race, 500, 3, { 502: { kind: 'gate', gate: 0 } })).toBe('checkpoint');
    expect(frame(cues, race, 503, 3)).toBeNull();
    expect(frame(cues, race, 506, 3, { 508: { kind: 'finish', gate: 9, ticks: 400 } })).toBe('finish');
    expect(frame(cues, race, 509, 60)).toBeNull();
  });

  it('keeps a finish over anything later in the same frame', () => {
    const cues = createRaceCues();
    const race = start(0);
    observeRace(cues, race, 500, null);
    takeCue(cues);
    observeRace(cues, race, 501, { kind: 'finish', gate: 1, ticks: 2 });
    observeRace(cues, race, 502, { kind: 'gate', gate: 0 });
    expect(takeCue(cues)).toBe('finish');
  });

  it('beeps again for a new race (again, next, the daily) and for nothing in free driving or after giving up', () => {
    const cues = createRaceCues();
    const first = start(0);
    expect(frame(cues, first, 0, 0)).toBe('beep');
    expect(frame(cues, first, 0, 30)).toBeNull();
    expect(frame(cues, null, 30, 1)).toBeNull();
    expect(frame(cues, null, 31, 200)).toBeNull();
    const second = start(300);
    expect(frame(cues, second, 300, 0)).toBe('beep');
    expect(run(cues, second, 300, 300 + COUNTDOWN_TICKS, 1, { [300 + COUNTDOWN_TICKS]: { kind: 'go' } }).map((p) => p.kind)).toEqual([
      'beep',
      'beep',
      'go',
    ]);
    const third = start(900);
    expect(frame(cues, third, 900, 0)).toBe('beep');
    expect(run(cues, null, 900, 1500, 6)).toEqual([]);
  });

  it('keeps no cue for later: a frame whose cue is dropped leaves nothing to catch up on', () => {
    const cues = createRaceCues();
    const race = start(0);
    observeRace(cues, race, 0, null);
    takeCue(cues);
    observeRace(cues, race, 60, null);
    takeCue(cues);
    expect(frame(cues, race, 60, 1)).toBeNull();
  });
});

describe('createRaceSounds', () => {
  function setup() {
    const context = new FakeContext();
    const tuning = createAudioTuning();
    const audio = createAudio(() => context, tuning);
    audio.setLevels(8, false);
    const sounds = createRaceSounds(audio, tuning);
    return { context, audio, sounds };
  }

  it('does nothing before the context exists or while it is suspended', () => {
    const { audio, sounds, context } = setup();
    expect(sounds.play('beep')).toBeNull();
    audio.start();
    const nodes = audio.stats().nodes;
    context.state = 'suspended';
    expect(sounds.play('finish')).toBeNull();
    expect(audio.stats().nodes).toBe(nodes);
    expect(sounds.played()).toBe(0);
  });

  it('makes nodes per note on the interface bus and releases them when each note ends', () => {
    const { audio, sounds, context } = setup();
    audio.start();
    const nodes = audio.stats().nodes;
    context.currentTime = 2;
    const begin = sounds.play('finish');
    expect(begin).toBeGreaterThan(2);
    expect(audio.stats().nodes).toBe(nodes + 4 * NODES_PER_NOTE);
    expect(sounds.playing()).toBe(4);
    const bus = audio.bus('interface');
    expect(context.gains.some((gain) => gain.connections.includes(bus!))).toBe(true);
    expect(context.oscillators.every((osc) => osc.type === 'sine')).toBe(true);
    for (const osc of context.oscillators) osc.onended?.();
    expect(audio.stats().nodes).toBe(nodes);
    expect(sounds.playing()).toBe(0);
    expect(sounds.played()).toBe(1);
    sounds.play('beep');
    sounds.play('go');
    sounds.play('checkpoint');
    expect(audio.stats().nodes).toBe(nodes + 4 * NODES_PER_NOTE);
  });

  it('counts nothing and returns null when every note is silent', () => {
    const { audio, sounds } = setup();
    audio.start();
    const nodes = audio.stats().nodes;
    const silent = createAudioTuning();
    silent.race.gain = 0;
    const quiet = createRaceSounds(audio, silent);
    expect(quiet.play('finish')).toBeNull();
    expect(quiet.played()).toBe(0);
    expect(audio.stats().nodes).toBe(nodes);
    expect(sounds.play('beep')).not.toBeNull();
  });

  it('keeps the checkpoint out of the screech band and apart from go', () => {
    const [low, high] = raceSound('checkpoint', tuning);
    expect(low.hertz).toBeGreaterThan(1700);
    expect(high.hertz).toBeCloseTo(low.hertz * tuning.checkpointRise, 6);
    expect(low.hertz).not.toBeCloseTo(raceSound('go', tuning)[0].hertz, -1);
  });
});
