import type { GameState } from '../app/gameState.ts';
import { createRandom } from '../math/random.ts';
import type { Audio, BufferSourceLike, ContextLike, FilterLike, GainLike, NodeLike, OscillatorLike } from './audio.ts';
import type { AudioTuning, EngineTuning } from './tuning.ts';

// The player's engine: a continuous synthesised note, no samples.
//   sawtooth (+detune) + square (-detune) at the note, sine an octave below, looped noise through a band-pass
//   -> resonant low-pass (opens with load) -> level -> high-pass (nothing below it reaches the bus) -> the world bus
// with a slow sine wobbling every oscillator's pitch at idle. engineSound turns what the car does into the targets.

export const REVERSE_GEAR = -1;

export interface EngineInput {
  speed: number; // m/s: the car's speed, negative when it moves backwards
  topSpeed: number; // m/s, the car's setting
  throttle: number; // 0 to 1, 0 when the game isn't reading input
  brake: number; // 0 to 1
  previousGear: number; // the last call's gear (0 first), so shifts have hysteresis
}

export interface EngineTargets {
  gear: number; // 0 first, REVERSE_GEAR
  hertz: number; // the note
  level: number; // gain, before the tuning's output gain
  cutoff: number; // Hz, the low-pass
  noise: number; // gain of the breath
  wobble: number; // cents of pitch wobble
}

export function engineTargets(): EngineTargets {
  return { gear: 0, hertz: 0, level: 0, cutoff: 0, noise: 0, wobble: 0 };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

// The sound's gear from the share of top speed (negative backwards) and the last gear: it only shifts once the share
// is `shiftHysteresis` past a gear's edge, so a speed hovering on an edge never hunts.
export function engineGear(share: number, previous: number, tuning: EngineTuning): number {
  const { gearTops, shiftHysteresis } = tuning;
  const last = gearTops.length - 1;
  if (share < -shiftHysteresis || (previous === REVERSE_GEAR && share < 0)) return REVERSE_GEAR;
  let gear = previous === REVERSE_GEAR ? 0 : clamp(Math.round(finite(previous)), 0, last);
  while (gear < last && share > gearTops[gear] + shiftHysteresis) gear++;
  while (gear > 0 && share < gearTops[gear - 1] - shiftHysteresis) gear--;
  return gear;
}

// What the engine sounds like for what the car does. Writes into `out` (no allocation per frame) and returns it.
export function engineSound(input: EngineInput, tuning: EngineTuning, out: EngineTargets = engineTargets()): EngineTargets {
  const topSpeed = finite(input.topSpeed);
  const share = topSpeed > 0 ? clamp(finite(input.speed) / topSpeed, -2, 2) : 0;
  const throttle = clamp(finite(input.throttle), 0, 1);
  const brake = clamp(finite(input.brake), 0, 1);
  const gear = engineGear(share, input.previousGear, tuning);

  // Backwards (a wall bounce too) either pedal loads the engine; standing, either pedal pulls away; forwards the
  // throttle drives and the brake brakes.
  const standing = Math.abs(share) <= tuning.shiftHysteresis && gear !== REVERSE_GEAR;
  const reversing = gear === REVERSE_GEAR;
  const drive = standing ? Math.abs(throttle - brake) : reversing ? Math.max(throttle, brake) : throttle;
  const braking = standing || reversing ? 0 : brake;

  const top = gear === REVERSE_GEAR ? tuning.reverseTop : tuning.gearTops[gear];
  const geared = top > 0 ? (tuning.shiftHertz * Math.abs(share)) / top : tuning.idleHertz;
  const floor = tuning.idleHertz + tuning.launchHertz * drive;
  const hertz = clamp(Math.max(floor, geared), tuning.idleHertz, Math.max(tuning.idleHertz, tuning.maxHertz));
  const span = tuning.maxHertz - tuning.idleHertz;
  const revs = span > 0 ? clamp((hertz - tuning.idleHertz) / span, 0, 1) : 0;

  const coast = clamp(tuning.coastShare, 0, 1);
  const level =
    tuning.idleLevel +
    (tuning.revLevel * revs * (coast + (1 - coast) * drive) + tuning.loadLevel * drive) * (1 - clamp(tuning.brakeCut, 0, 1) * braking);
  const brightness = tuning.coastBrightness + (tuning.loadBrightness - tuning.coastBrightness) * drive;
  const fade = tuning.wobbleFade > 0 ? clamp(1 - revs / tuning.wobbleFade, 0, 1) : 0;

  out.gear = gear;
  out.hertz = hertz;
  out.level = clamp(finite(level), 0, 1);
  out.cutoff = clamp(finite(hertz * brightness), tuning.minCutoff, Math.max(tuning.minCutoff, tuning.maxCutoff));
  out.noise = clamp(finite(tuning.noiseIdle + tuning.noiseLoad * drive), 0, 1);
  out.wobble = clamp(finite(tuning.wobbleCents * fade), 0, 1200);
  return out;
}

// The engine is heard whenever the player's car is drawn in the world: the daily's pre-race screen, the race (its
// countdown too), and behind the results while a race is left. The garage's car is a preview and stays silent.
export function engineHeard(state: GameState, raceLeft: boolean): boolean {
  switch (state.kind) {
    case 'preRace':
    case 'race':
    case 'results':
      return true;
    case 'dailyResults':
      return raceLeft;
    default:
      return false;
  }
}

// Signed speed for the engine: the whole speed (a slide keeps the revs up), backwards when the car moves tail first.
// Presentation, so Math is fine here.
export function engineSpeed(car: { heading: number; velocityX: number; velocityZ: number }): number {
  const along = -Math.sin(car.heading) * car.velocityX - Math.cos(car.heading) * car.velocityZ;
  const speed = Math.hypot(car.velocityX, car.velocityZ);
  return along < 0 ? -speed : speed;
}

const NOISE_SECONDS = 2;
const NOISE_SEED = 0x5eed;
// Time constants of the glides, short so they follow the car but never click.
export const PITCH_SECONDS = 0.05;
export const LEVEL_SECONDS = 0.04;
export const CUTOFF_SECONDS = 0.05;
export const SILENCE_SECONDS = 0.12; // fading out when the car leaves the screen
const NOISE_Q = 0.8;
const HIGHPASS_Q = Math.SQRT1_2;

export interface EngineGraph {
  saw: OscillatorLike;
  square: OscillatorLike;
  sub: OscillatorLike;
  sawGain: GainLike;
  squareGain: GainLike;
  subGain: GainLike;
  wobble: OscillatorLike;
  wobbleDepth: GainLike;
  noise: BufferSourceLike;
  noiseBand: FilterLike;
  noiseGain: GainLike;
  lowpass: FilterLike;
  level: GainLike;
  highpass: FilterLike;
}

// Builds the engine's nodes into `output`, silent until driven. `count` counts every node it makes.
export function buildEngine(
  context: ContextLike,
  output: NodeLike,
  count: <T extends NodeLike>(node: T) => T,
  tuning: EngineTuning,
): EngineGraph {
  const oscillator = (type: string, hertz: number) => {
    const node = count(context.createOscillator());
    node.type = type;
    node.frequency.value = hertz;
    return node;
  };
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

  const length = Math.round(context.sampleRate * NOISE_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = createRandom(NOISE_SEED);
  for (let i = 0; i < length; i++) data[i] = random() * 2 - 1;

  const graph: EngineGraph = {
    saw: oscillator('sawtooth', tuning.idleHertz),
    square: oscillator('square', tuning.idleHertz),
    sub: oscillator('sine', tuning.idleHertz / 2),
    sawGain: gain(tuning.sawMix),
    squareGain: gain(tuning.squareMix),
    subGain: gain(tuning.subMix),
    wobble: oscillator('sine', tuning.wobbleHertz),
    wobbleDepth: gain(0),
    noise: count(context.createBufferSource()),
    noiseBand: filter('bandpass', tuning.idleHertz * tuning.noiseBand, NOISE_Q),
    noiseGain: gain(0),
    lowpass: filter('lowpass', tuning.minCutoff, tuning.resonance),
    level: gain(0),
    highpass: filter('highpass', tuning.highpassHertz, HIGHPASS_Q),
  };
  graph.saw.detune.value = tuning.detuneCents;
  graph.square.detune.value = -tuning.detuneCents;
  graph.noise.buffer = buffer;
  graph.noise.loop = true;

  graph.saw.connect(graph.sawGain);
  graph.square.connect(graph.squareGain);
  graph.sub.connect(graph.subGain);
  graph.noise.connect(graph.noiseBand);
  graph.noiseBand.connect(graph.noiseGain);
  for (const source of [graph.sawGain, graph.squareGain, graph.subGain, graph.noiseGain]) source.connect(graph.lowpass);
  graph.lowpass.connect(graph.level);
  graph.level.connect(graph.highpass);
  graph.highpass.connect(output);
  graph.wobble.connect(graph.wobbleDepth);
  for (const pitched of [graph.saw, graph.square, graph.sub]) graph.wobbleDepth.connect(pitched.detune);

  for (const source of [graph.saw, graph.square, graph.sub, graph.wobble, graph.noise]) source.start(0);
  return graph;
}

// Glides every node towards the targets from `time`; a car not heard fades to silence (nothing stops).
export function driveEngine(graph: EngineGraph, targets: EngineTargets, heard: boolean, time: number, tuning: EngineTuning): void {
  const { hertz } = targets;
  graph.saw.frequency.setTargetAtTime(hertz, time, PITCH_SECONDS);
  graph.square.frequency.setTargetAtTime(hertz, time, PITCH_SECONDS);
  graph.sub.frequency.setTargetAtTime(hertz / 2, time, PITCH_SECONDS);
  graph.noiseBand.frequency.setTargetAtTime(hertz * tuning.noiseBand, time, PITCH_SECONDS);
  graph.lowpass.frequency.setTargetAtTime(targets.cutoff, time, CUTOFF_SECONDS);
  graph.noiseGain.gain.setTargetAtTime(targets.noise, time, LEVEL_SECONDS);
  graph.wobbleDepth.gain.setTargetAtTime(targets.wobble, time, LEVEL_SECONDS);
  graph.level.gain.setTargetAtTime(heard ? targets.level * tuning.gain : 0, time, heard ? LEVEL_SECONDS : SILENCE_SECONDS);
}

// The tuning values the graph holds as fixed settings, applied again after a dev slider change.
export function retuneEngine(graph: EngineGraph, tuning: EngineTuning, time: number): void {
  graph.sawGain.gain.setTargetAtTime(tuning.sawMix, time, LEVEL_SECONDS);
  graph.squareGain.gain.setTargetAtTime(tuning.squareMix, time, LEVEL_SECONDS);
  graph.subGain.gain.setTargetAtTime(tuning.subMix, time, LEVEL_SECONDS);
  graph.saw.detune.value = tuning.detuneCents;
  graph.square.detune.value = -tuning.detuneCents;
  graph.wobble.frequency.setTargetAtTime(tuning.wobbleHertz, time, LEVEL_SECONDS);
  graph.lowpass.Q.setTargetAtTime(tuning.resonance, time, LEVEL_SECONDS);
  graph.highpass.frequency.setTargetAtTime(tuning.highpassHertz, time, LEVEL_SECONDS);
}

export interface Engine {
  // Once per frame: what the car does now and whether it is heard. Does nothing before the context runs.
  update(input: Omit<EngineInput, 'previousGear'>, heard: boolean): void;
  retune(): void;
  targets(): Readonly<EngineTargets>;
}

// The engine on the game's audio: built in whenReady, on the world bus.
export function createEngine(audio: Audio, tuning: AudioTuning): Engine {
  let graph: EngineGraph | null = null;
  const targets = engineTargets();
  const input: EngineInput = { speed: 0, topSpeed: 0, throttle: 0, brake: 0, previousGear: 0 };
  audio.whenReady((ready, context) => {
    const out = ready.bus('world');
    if (out) graph = buildEngine(context, out, ready.counted, tuning.engine);
  });
  return {
    update(next, heard) {
      const context = audio.context();
      if (!graph || !context) return;
      input.speed = next.speed;
      input.topSpeed = next.topSpeed;
      input.throttle = next.throttle;
      input.brake = next.brake;
      input.previousGear = targets.gear;
      engineSound(input, tuning.engine, targets);
      driveEngine(graph, targets, heard, context.currentTime, tuning.engine);
    },
    retune() {
      const context = audio.context();
      if (graph && context) retuneEngine(graph, tuning.engine, context.currentTime);
    },
    targets: () => targets,
  };
}
