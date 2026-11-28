import { noiseBuffer, type Audio, type BufferSourceLike, type ContextLike, type FilterLike, type GainLike, type NodeLike, type OscillatorLike } from './audio.ts';
import { SILENCE_SECONDS } from './engine.ts';
import type { AudioTuning, TyreTuning } from './tuning.ts';

// The tyre screech: a continuous synthesised sound, silent (level 0) unless the car slides.
//   looped noise -> narrow band-pass at the note, a second one slightly above it, a third an octave up
//   -> level -> high-pass -> the world bus
// with a slow sine wobbling every band's pitch. screechSound turns the slide into the targets.

export interface ScreechInput {
  slide: number; // m/s sideways (render/drift.ts's slideSpeed)
  speed: number; // m/s, the whole speed
}

export interface ScreechTargets {
  level: number; // 0 to 1, before the tuning's output gain
  hertz: number; // the main peak
}

export function screechTargets(): ScreechTargets {
  return { level: 0, hertz: 0 };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

// What the tyres sound like for the slide. Writes into `out` (no allocation per frame) and returns it.
export function screechSound(input: ScreechInput, tuning: TyreTuning, out: ScreechTargets = screechTargets()): ScreechTargets {
  // A slide is never faster than the car, so a standing car is silent whatever it is given.
  const slide = Math.min(Math.abs(finite(input.slide)), Math.abs(finite(input.speed)));
  const range = tuning.slideFull - tuning.slideStart;
  const share = range > 0 ? clamp((slide - tuning.slideStart) / range, 0, 1) : slide > tuning.slideStart ? 1 : 0;
  out.level = clamp(finite(share ** Math.max(0.01, tuning.fadeCurve)), 0, 1);
  out.hertz = Math.max(20, finite(tuning.hertz * (1 + tuning.pitchRise * share)));
  return out;
}

const NOISE_SECONDS = 2;
const NOISE_SEED = 0x7e5;
export const PITCH_SECONDS = 0.08;
const HIGHPASS_Q = Math.SQRT1_2;
const HARMONIC = 2;

export interface ScreechGraph {
  noise: BufferSourceLike;
  main: FilterLike;
  spread: FilterLike;
  spreadGain: GainLike;
  harmonic: FilterLike;
  harmonicGain: GainLike;
  wobble: OscillatorLike;
  wobbleDepth: GainLike;
  level: GainLike;
  highpass: FilterLike;
}

// Builds the screech's nodes into `output`, silent until driven. `count` counts every node it makes.
export function buildScreech(
  context: ContextLike,
  output: NodeLike,
  count: <T extends NodeLike>(node: T) => T,
  tuning: TyreTuning,
): ScreechGraph {
  const gain = (value: number) => {
    const node = count(context.createGain());
    node.gain.value = value;
    return node;
  };
  const filter = (type: string, hertz: number, q: number) => {
    const node = count(context.createBiquadFilter());
    node.type = type;
    node.frequency.value = hertz;
    node.Q.value = q;
    return node;
  };
  const graph: ScreechGraph = {
    noise: count(context.createBufferSource()),
    main: filter('bandpass', tuning.hertz, tuning.q),
    spread: filter('bandpass', tuning.hertz * tuning.spread, tuning.q),
    spreadGain: gain(tuning.spreadMix),
    harmonic: filter('bandpass', tuning.hertz * HARMONIC, tuning.q),
    harmonicGain: gain(tuning.harmonicMix),
    wobble: count(context.createOscillator()),
    wobbleDepth: gain(tuning.wobbleCents),
    level: gain(0),
    highpass: filter('highpass', tuning.highpassHertz, HIGHPASS_Q),
  };
  graph.noise.buffer = noiseBuffer(context, NOISE_SECONDS, NOISE_SEED);
  graph.noise.loop = true;
  graph.wobble.type = 'sine';
  graph.wobble.frequency.value = tuning.wobbleHertz;

  for (const band of [graph.main, graph.spread, graph.harmonic]) graph.noise.connect(band);
  graph.spread.connect(graph.spreadGain);
  graph.harmonic.connect(graph.harmonicGain);
  for (const band of [graph.main, graph.spreadGain, graph.harmonicGain]) band.connect(graph.level);
  graph.level.connect(graph.highpass);
  graph.highpass.connect(output);
  graph.wobble.connect(graph.wobbleDepth);
  for (const band of [graph.main, graph.spread, graph.harmonic]) graph.wobbleDepth.connect(band.detune);

  graph.noise.start(0);
  graph.wobble.start(0);
  return graph;
}

// Glides the nodes towards the targets from `time`; tyres not heard fade to silence (nothing stops). `rising` picks
// the attack or the release time constant.
export function driveScreech(graph: ScreechGraph, targets: ScreechTargets, heard: boolean, rising: boolean, time: number, tuning: TyreTuning): void {
  const { hertz } = targets;
  graph.main.frequency.setTargetAtTime(hertz, time, PITCH_SECONDS);
  graph.spread.frequency.setTargetAtTime(hertz * tuning.spread, time, PITCH_SECONDS);
  graph.harmonic.frequency.setTargetAtTime(hertz * HARMONIC, time, PITCH_SECONDS);
  const level = heard ? targets.level * tuning.gain : 0;
  const seconds = !heard ? SILENCE_SECONDS : rising ? tuning.attackSeconds : tuning.releaseSeconds;
  graph.level.gain.setTargetAtTime(level, time, Math.max(0.001, seconds));
}

export function retuneScreech(graph: ScreechGraph, tuning: TyreTuning, time: number): void {
  for (const band of [graph.main, graph.spread, graph.harmonic]) band.Q.setTargetAtTime(tuning.q, time, PITCH_SECONDS);
  graph.spreadGain.gain.setTargetAtTime(tuning.spreadMix, time, PITCH_SECONDS);
  graph.harmonicGain.gain.setTargetAtTime(tuning.harmonicMix, time, PITCH_SECONDS);
  graph.wobble.frequency.setTargetAtTime(tuning.wobbleHertz, time, PITCH_SECONDS);
  graph.wobbleDepth.gain.setTargetAtTime(tuning.wobbleCents, time, PITCH_SECONDS);
  graph.highpass.frequency.setTargetAtTime(tuning.highpassHertz, time, PITCH_SECONDS);
}

export interface Screech {
  // Once per frame: the slide now and whether the car is heard (engineHeard). Does nothing before the context runs.
  update(input: ScreechInput, heard: boolean): void;
  retune(): void;
  targets(): Readonly<ScreechTargets>;
}

// The screech on the game's audio: built in whenReady, on the world bus.
export function createScreech(audio: Audio, tuning: AudioTuning): Screech {
  let graph: ScreechGraph | null = null;
  const targets = screechTargets();
  let sent = 0;
  audio.whenReady((ready, context) => {
    const out = ready.bus('world');
    if (out) graph = buildScreech(context, out, ready.counted, tuning.tyres);
  });
  return {
    update(input, heard) {
      const context = audio.context();
      if (!graph || !context) return;
      screechSound(input, tuning.tyres, targets);
      const level = heard ? targets.level : 0;
      driveScreech(graph, targets, heard, level > sent, context.currentTime, tuning.tyres);
      sent = level;
    },
    retune() {
      const context = audio.context();
      if (graph && context) retuneScreech(graph, tuning.tyres, context.currentTime);
    },
    targets: () => targets,
  };
}
