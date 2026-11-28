import type { GameState } from '../app/gameState.ts';
import { noiseBuffer, type Audio, type BufferSourceLike, type ContextLike, type FilterLike, type GainLike, type NodeLike, type OscillatorLike } from './audio.ts';
import type { AmbienceTuning, AudioTuning } from './tuning.ts';

// The city's hum: a continuous bed, far-off traffic and air conditioning at night.
//   three looped noises of different lengths -> a low band-pass (rumble) and a higher one (air), plus mains-like sines at 60 Hz and two harmonics
//   -> level (fades with the screen, ducks with speed) -> high-pass -> the ambience bus
// Slow sine LFOs, none in step, move the rumble's and air's levels, the air band's pitch and the hum's level, so it
// never settles into a static hiss. Nothing stops; silence is level 0.

export interface AmbienceInput {
  speed: number; // m/s, the whole speed
  topSpeed: number; // m/s
  car: boolean; // the car's engine is heard
}

export interface AmbienceTargets {
  level: number; // 0 to 1, before the tuning's output gain
}

export function ambienceTargets(): AmbienceTargets {
  return { level: 1 };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

// The hum is heard wherever the city is drawn: the menu and settings (the flight), the daily's pre-race screen, the
// race, the results, loading (the hum carries on while the city builds). The garage is its own dark scene.
export function ambienceHeard(state: GameState): boolean {
  return state.kind !== 'garage';
}

// How loud the hum is: the engine covers it standing (`carShare`) and the engine and wind more as the car goes faster. Writes into `out`.
export function ambienceSound(input: AmbienceInput, tuning: AmbienceTuning, out: AmbienceTargets = ambienceTargets()): AmbienceTargets {
  const top = finite(input.topSpeed);
  const share = top > 0 ? clamp(Math.abs(finite(input.speed)) / top, 0, 1) : 0;
  const heard = input.car ? clamp(finite(tuning.carShare), 0, 1) : 1;
  out.level = clamp((1 - clamp(finite(tuning.duck), 0, 1) * share) * heard, 0, 1);
  return out;
}

const NOISE_SECONDS = 16;
// Every noise source plays the same buffer; the first all of it, the others this much of it, so no cycle shorter than the
// buffer carries more than a third of the noise's power.
const SHORT_LOOP_SECONDS = [11.3, 7.7];
const NOISE_SEED = 0xc17;
const HIGHPASS_Q = Math.SQRT1_2;
const PARAM_SECONDS = 0.05;
// Periods of the slow movements, seconds; unrelated so they never line up.
export const RUMBLE_PERIOD = 13;
export const AIR_PERIOD = 8.3;
export const SWEEP_PERIOD = 21;
export const HUM_PERIOD = 29;
const HUM_SECOND = 2;
const HUM_THIRD = 3;
const THIRD_SHARE = 0.5; // the third harmonic's gain against the second's

export interface AmbienceGraph {
  noises: BufferSourceLike[];
  noiseGain: GainLike;
  rumble: FilterLike;
  rumbleGain: GainLike;
  air: FilterLike;
  airGain: GainLike;
  hum: OscillatorLike[];
  humGains: GainLike[];
  humGain: GainLike;
  lfos: OscillatorLike[];
  depths: GainLike[]; // rumble level, air level, air pitch, hum level
  level: GainLike;
  highpass: FilterLike;
}

const humMixes = (tuning: AmbienceTuning) => [tuning.humMix, tuning.harmonicMix, tuning.harmonicMix * THIRD_SHARE];
const HUM_MULTIPLES = [1, HUM_SECOND, HUM_THIRD];

// Builds the hum's nodes into `output`, silent until driven. `count` counts every node it makes.
export function buildAmbience(context: ContextLike, output: NodeLike, count: <T extends NodeLike>(node: T) => T, tuning: AmbienceTuning): AmbienceGraph {
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
  const oscillator = (hertz: number) => {
    const node = count(context.createOscillator());
    node.type = 'sine';
    node.frequency.value = hertz;
    return node;
  };
  const mixes = humMixes(tuning);
  const graph: AmbienceGraph = {
    noises: [0, ...SHORT_LOOP_SECONDS].map(() => count(context.createBufferSource())),
    noiseGain: gain(1 / Math.sqrt(SHORT_LOOP_SECONDS.length + 1)),
    rumble: filter('bandpass', tuning.rumbleHertz, tuning.rumbleQ),
    rumbleGain: gain(tuning.rumbleMix),
    air: filter('bandpass', tuning.airHertz, tuning.airQ),
    airGain: gain(tuning.airMix),
    hum: HUM_MULTIPLES.map((multiple) => oscillator(tuning.humHertz * multiple)),
    humGains: mixes.map((mix) => gain(mix)),
    humGain: gain(1),
    lfos: [1 / RUMBLE_PERIOD, 1 / AIR_PERIOD, 1 / SWEEP_PERIOD, 1 / HUM_PERIOD].map(oscillator),
    depths: [
      gain(tuning.rumbleMix * tuning.swell),
      gain(tuning.airMix * tuning.swell),
      gain(tuning.sweepCents),
      gain(tuning.swell),
    ],
    level: gain(0),
    highpass: filter('highpass', tuning.highpassHertz, HIGHPASS_Q),
  };
  const buffer = noiseBuffer(context, NOISE_SECONDS, NOISE_SEED);
  graph.noises.forEach((source, i) => {
    source.buffer = buffer;
    source.loop = true;
    if (i > 0) source.loopEnd = SHORT_LOOP_SECONDS[i - 1];
    source.connect(graph.noiseGain);
  });
  graph.noiseGain.connect(graph.rumble);
  graph.noiseGain.connect(graph.air);
  graph.rumble.connect(graph.rumbleGain);
  graph.air.connect(graph.airGain);
  graph.hum.forEach((osc, i) => {
    osc.connect(graph.humGains[i]);
    graph.humGains[i].connect(graph.humGain);
  });
  for (const part of [graph.rumbleGain, graph.airGain, graph.humGain]) part.connect(graph.level);
  graph.level.connect(graph.highpass);
  graph.highpass.connect(output);
  const [rumbleLfo, airLfo, sweepLfo, humLfo] = graph.lfos;
  const [rumbleDepth, airDepth, sweepDepth, humDepth] = graph.depths;
  rumbleLfo.connect(rumbleDepth);
  rumbleDepth.connect(graph.rumbleGain.gain);
  airLfo.connect(airDepth);
  airDepth.connect(graph.airGain.gain);
  sweepLfo.connect(sweepDepth);
  sweepDepth.connect(graph.air.detune);
  humLfo.connect(humDepth);
  humDepth.connect(graph.humGain.gain);

  for (const source of graph.noises) source.start(0);
  for (const osc of [...graph.hum, ...graph.lfos]) osc.start(0);
  return graph;
}

// Glides the nodes towards the targets from `time`; a hum not heard fades to silence.
export function driveAmbience(graph: AmbienceGraph, targets: AmbienceTargets, heard: boolean, time: number, tuning: AmbienceTuning): void {
  const level = heard ? targets.level * tuning.gain : 0;
  graph.level.gain.setTargetAtTime(level, time, Math.max(0.001, tuning.fadeSeconds));
}

export function retuneAmbience(graph: AmbienceGraph, tuning: AmbienceTuning, time: number): void {
  graph.rumble.frequency.setTargetAtTime(tuning.rumbleHertz, time, PARAM_SECONDS);
  graph.rumble.Q.setTargetAtTime(tuning.rumbleQ, time, PARAM_SECONDS);
  graph.rumbleGain.gain.setTargetAtTime(tuning.rumbleMix, time, PARAM_SECONDS);
  graph.air.frequency.setTargetAtTime(tuning.airHertz, time, PARAM_SECONDS);
  graph.air.Q.setTargetAtTime(tuning.airQ, time, PARAM_SECONDS);
  graph.airGain.gain.setTargetAtTime(tuning.airMix, time, PARAM_SECONDS);
  graph.hum.forEach((osc, i) => osc.frequency.setTargetAtTime(tuning.humHertz * HUM_MULTIPLES[i], time, PARAM_SECONDS));
  humMixes(tuning).forEach((mix, i) => graph.humGains[i].gain.setTargetAtTime(mix, time, PARAM_SECONDS));
  graph.depths[0].gain.setTargetAtTime(tuning.rumbleMix * tuning.swell, time, PARAM_SECONDS);
  graph.depths[1].gain.setTargetAtTime(tuning.airMix * tuning.swell, time, PARAM_SECONDS);
  graph.depths[2].gain.setTargetAtTime(tuning.sweepCents, time, PARAM_SECONDS);
  graph.depths[3].gain.setTargetAtTime(tuning.swell, time, PARAM_SECONDS);
  graph.highpass.frequency.setTargetAtTime(tuning.highpassHertz, time, PARAM_SECONDS);
}

export interface Ambience {
  // Once per frame: the car's speed and whether the city is on screen (ambienceHeard). Does nothing before the context runs.
  update(input: AmbienceInput, heard: boolean): void;
  retune(): void;
  targets(): Readonly<AmbienceTargets>;
}

// The hum on the game's audio: built in whenReady, on the ambience bus.
export function createAmbience(audio: Audio, tuning: AudioTuning): Ambience {
  let graph: AmbienceGraph | null = null;
  const targets = ambienceTargets();
  audio.whenReady((ready, context) => {
    const out = ready.bus('ambience');
    if (out) graph = buildAmbience(context, out, ready.counted, tuning.ambience);
  });
  return {
    update(input, heard) {
      const context = audio.context();
      if (!graph || !context) return;
      ambienceSound(input, tuning.ambience, targets);
      driveAmbience(graph, targets, heard, context.currentTime, tuning.ambience);
    },
    retune() {
      const context = audio.context();
      if (graph && context) retuneAmbience(graph, tuning.ambience, context.currentTime);
    },
    targets: () => targets,
  };
}
