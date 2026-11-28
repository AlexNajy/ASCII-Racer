import type { RaceEvent } from '../game/race.ts';
import { countdownShown, type Race } from '../game/race.ts';
import type { Audio, GainLike, NodeLike, OscillatorLike } from './audio.ts';
import type { AudioTuning, RaceSoundTuning } from './tuning.ts';

// The race's short sounds: a countdown beep, the go note, a checkpoint's two-note rise and the finish figure. Each
// is a one-shot whose nodes are made for it and released when it ends, on the interface bus.
//   per note: a sine at the pitch + a quieter sine an octave above -> an envelope gain -> the bus
// raceSound turns a kind into notes; the cues turn the simulation's ticks into at most one sound per frame.

export type RaceSoundKind = 'beep' | 'go' | 'checkpoint' | 'finish';
export const RACE_SOUND_KINDS: readonly RaceSoundKind[] = ['beep', 'go', 'checkpoint', 'finish'];

export interface RaceNote {
  hertz: number;
  start: number; // seconds after the sound begins
  seconds: number; // length to -60 dB
  level: number; // peak gain
}

const CHECKPOINT_OCTAVES = 3; // the first note's multiple of the base: a fifth above the go note, clear of the screech's band
const FINISH_RATIOS = [1, 1.25, 1.5, 2]; // a major arpeggio up to the octave

const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const clampMin = (value: number, low: number) => Math.max(low, finite(value, low));

export function raceSound(kind: RaceSoundKind, tuning: RaceSoundTuning): RaceNote[] {
  const base = clampMin(tuning.baseHertz, 20);
  const level = (value: number) => Math.max(0, finite(value, 0)) * Math.max(0, finite(tuning.gain, 0));
  const seconds = (value: number) => clampMin(value, 0.01);
  switch (kind) {
    case 'beep':
      return [{ hertz: base, start: 0, seconds: seconds(tuning.beepSeconds), level: level(tuning.beepLevel) }];
    case 'go':
      return [{ hertz: base * 2 ** finite(tuning.goOctaves, 1), start: 0, seconds: seconds(tuning.goSeconds), level: level(tuning.goLevel) }];
    case 'checkpoint': {
      const first = base * CHECKPOINT_OCTAVES;
      return [
        { hertz: first, start: 0, seconds: seconds(tuning.checkpointSeconds), level: level(tuning.checkpointLevel) },
        { hertz: first * clampMin(tuning.checkpointRise, 1), start: Math.max(0, tuning.checkpointGap), seconds: seconds(tuning.checkpointSeconds), level: level(tuning.checkpointLevel) },
      ];
    }
    case 'finish':
      return FINISH_RATIOS.map((ratio, index) => ({
        hertz: base * ratio,
        start: index * Math.max(0, tuning.finishGap),
        seconds: seconds(index === FINISH_RATIOS.length - 1 ? tuning.finishLastSeconds : tuning.finishSeconds),
        level: level(tuning.finishLevel),
      }));
  }
}

// What the race's ticks ask for since the last `takeCue`: the latest event wins, so a frame that ran several ticks
// plays one sound, but a finish is never replaced by a later one. A new race (another object, or none) starts over.
export interface RaceCues {
  race: Race | null;
  shown: number | null;
  pending: RaceSoundKind | null;
}

export function createRaceCues(): RaceCues {
  return { race: null, shown: null, pending: null };
}

// Called after every tick and once after a frame's ticks with no event (a race made by a state change shows its 3
// before any tick runs). The countdown's 3, 2 and 1 beep when they appear; go and the gates come from the event.
export function observeRace(cues: RaceCues, race: Race | null, tick: number, event: RaceEvent | null): void {
  if (race !== cues.race) {
    cues.race = race;
    cues.shown = null;
    cues.pending = null;
  }
  if (!race) return;
  const shown = countdownShown(race, tick);
  if (shown !== cues.shown) {
    cues.shown = shown;
    if (shown !== null && shown > 0 && cues.pending !== 'finish') cues.pending = 'beep';
  }
  if (!event || cues.pending === 'finish') return;
  cues.pending = event.kind === 'go' ? 'go' : event.kind === 'gate' ? 'checkpoint' : 'finish';
}

export function takeCue(cues: RaceCues): RaceSoundKind | null {
  const { pending } = cues;
  cues.pending = null;
  return pending;
}

const DELAY_SECONDS = 0.01; // scheduled a moment ahead, never in the past
const FLOOR = 0.001; // -60 dB, where the exponential decay ends
const TAIL_SECONDS = 0.01; // from -60 dB to 0, so the stop never clicks
export const NODES_PER_NOTE = 4;

export interface RaceSounds {
  // Plays the sound if the context runs; returns its start on the audio clock, or null when nothing played.
  play(kind: RaceSoundKind): number | null;
  playing(): number;
  played(): number; // since startup, for headless checks
}

export function createRaceSounds(audio: Audio, tuning: AudioTuning): RaceSounds {
  let out: GainLike | null = null;
  let sounding = 0;
  let total = 0;
  audio.whenReady((ready) => {
    out = ready.bus('interface');
  });
  return {
    play(kind) {
      const context = audio.context();
      if (!out || !context) return null;
      const t = tuning.race;
      const notes = raceSound(kind, t);
      const begin = context.currentTime + DELAY_SECONDS;
      let made = 0;
      for (const note of notes) {
        if (note.level <= 0) continue;
        made++;
        const start = begin + note.start;
        const decayEnd = start + note.seconds;
        const attack = Math.min(Math.max(0.001, t.attackSeconds), note.seconds / 2);
        const fundamental = audio.counted(context.createOscillator());
        const octave = audio.counted(context.createOscillator());
        const envelope = audio.counted(context.createGain());
        const upper = audio.counted(context.createGain());
        fundamental.type = 'sine';
        octave.type = 'sine';
        fundamental.frequency.value = note.hertz;
        octave.frequency.value = note.hertz * 2;
        upper.gain.value = Math.max(0, t.harmonicMix);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(note.level, start + attack);
        envelope.gain.exponentialRampToValueAtTime(note.level * FLOOR, decayEnd);
        envelope.gain.linearRampToValueAtTime(0, decayEnd + TAIL_SECONDS);
        fundamental.connect(envelope);
        octave.connect(upper);
        upper.connect(envelope);
        envelope.connect(out);
        sounding++;
        fundamental.onended = () => {
          for (const node of [fundamental, octave, envelope, upper] as NodeLike[]) node.disconnect();
          audio.released(NODES_PER_NOTE);
          sounding--;
        };
        for (const osc of [fundamental, octave] as OscillatorLike[]) {
          osc.start(start);
          osc.stop(decayEnd + TAIL_SECONDS);
        }
      }
      if (made === 0) return null;
      total++;
      return begin;
    },
    playing: () => sounding,
    played: () => total,
  };
}
