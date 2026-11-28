import type { PlayerSettings } from '../app/settings.ts';
import { masterGain } from './gain.ts';
import type { AudioTuning } from './tuning.ts';

// The game's one AudioContext and the root of its node graph:
//   sources -> bus (world, interface, more by name) -> master gain -> limiter -> destination
// with an analyser listening after the limiter. Audio reads the game and never feeds back into it. Before the first
// user gesture nothing exists and every call is a no-op; nothing is queued for later.

export interface ParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
}
export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface CompressorLike extends NodeLike {
  threshold: ParamLike;
  knee: ParamLike;
  ratio: ParamLike;
  attack: ParamLike;
  release: ParamLike;
}
export interface AnalyserLike extends NodeLike {
  fftSize: number;
  getFloatTimeDomainData(into: Float32Array): void;
}
export interface OscillatorLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  onended: (() => void) | null;
  start(when: number): void;
  stop(when: number): void;
}
export interface ContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: NodeLike;
  resume(): Promise<void>;
  createGain(): GainLike;
  createDynamicsCompressor(): CompressorLike;
  createAnalyser(): AnalyserLike;
  createOscillator(): OscillatorLike;
}

export type AudioState = 'none' | 'suspended' | 'running';
export interface AudioStats {
  state: AudioState;
  masterGain: number; // the master gain node's current value, 0 before a context exists
  nodes: number; // nodes alive in the graph, permanent ones and sounds still playing
  rmsDb: number; // output level over the last analyser window
  peakDb: number;
}

const RAMP_SECONDS = 0.005; // time constant of gain changes, so none clicks
const LIMITER = { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 };
const ANALYSER_SIZE = 2048;
const FLOOR_DB = -120;
const BLIP_DELAY_SECONDS = 0.02; // lets the new master gain settle first
const BLIP_ATTACK_SECONDS = 0.005;
export const BLIP_SECONDS = 0.06;

// The browser's AudioContext, or null where there is none (the game then runs silent).
export function browserContextFactory(): (() => ContextLike) | null {
  if (typeof AudioContext === 'undefined') return null;
  // The DOM types and ContextLike differ only in how loosely they type connect and onended.
  return () => new AudioContext() as unknown as ContextLike;
}

function decibels(amplitude: number): number {
  return amplitude > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(amplitude)) : FLOOR_DB;
}

export interface Audio {
  // Called on a user gesture: creates the context on the first, resumes a suspended one on later ones.
  start(): void;
  setLevels(volume: number, muted: boolean): void;
  // Applies the tuning object's current values to the live graph.
  retune(): void;
  // A bus under the master, made on first ask (null until the context exists). Sources connect to it.
  bus(name: string): GainLike | null;
  // Runs once when the graph first exists (at once if it does already): where later sounds build their nodes.
  whenReady(callback: (audio: Audio) => void): void;
  // Creates a node counted in the stats; release it with `released` when it is disconnected for good.
  counted<T extends NodeLike>(node: T): T;
  released(count?: number): void;
  context(): ContextLike | null; // only when running
  blip(): void;
  stats(): AudioStats;
}

export function createAudio(makeContext: (() => ContextLike) | null, tuning: AudioTuning): Audio {
  let ctx: ContextLike | null = null;
  let failed = false;
  let master: GainLike | null = null;
  let analyser: AnalyserLike | null = null;
  const buses = new Map<string, GainLike>();
  const waiting: ((audio: Audio) => void)[] = [];
  let nodes = 0;
  let volume = 0;
  let muted = true;
  const samples = new Float32Array(ANALYSER_SIZE);

  const targetGain = () => masterGain(volume, muted, tuning);

  function counted<T extends NodeLike>(node: T): T {
    nodes++;
    return node;
  }

  function bus(name: string): GainLike | null {
    if (!ctx || !master) return null;
    let found = buses.get(name);
    if (!found) {
      found = counted(ctx.createGain());
      found.gain.value = tuning.busGains[name] ?? 1;
      found.connect(master);
      buses.set(name, found);
    }
    return found;
  }

  function build(context: ContextLike) {
    master = counted(context.createGain());
    master.gain.value = targetGain();
    const limiter = counted(context.createDynamicsCompressor());
    for (const key of Object.keys(LIMITER) as (keyof typeof LIMITER)[]) limiter[key].value = LIMITER[key];
    analyser = counted(context.createAnalyser());
    analyser.fftSize = ANALYSER_SIZE;
    master.connect(limiter);
    limiter.connect(context.destination);
    limiter.connect(analyser);
    ctx = context;
    for (const name of Object.keys(tuning.busGains)) bus(name);
    for (const callback of waiting.splice(0)) callback(self);
  }

  const self: Audio = {
    start() {
      if (failed || !makeContext) return;
      if (!ctx) {
        try {
          build(makeContext());
        } catch {
          failed = true;
          ctx = null;
          return;
        }
      }
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    setLevels(nextVolume, nextMuted) {
      volume = nextVolume;
      muted = nextMuted;
      if (ctx && master) master.gain.setTargetAtTime(targetGain(), ctx.currentTime, RAMP_SECONDS);
    },
    retune() {
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(targetGain(), ctx.currentTime, RAMP_SECONDS);
      for (const [name, node] of buses) node.gain.setTargetAtTime(tuning.busGains[name] ?? 1, ctx.currentTime, RAMP_SECONDS);
    },
    bus,
    whenReady(callback) {
      if (ctx) callback(self);
      else waiting.push(callback);
    },
    counted,
    released(count = 1) {
      nodes -= count;
    },
    context: () => (ctx && ctx.state === 'running' ? ctx : null),
    blip() {
      const context = self.context();
      const out = bus('interface');
      if (!context || !out || targetGain() <= 0) return;
      const osc = counted(context.createOscillator());
      const envelope = counted(context.createGain());
      osc.type = 'sine';
      osc.frequency.value = tuning.blipHertz;
      const start = context.currentTime + BLIP_DELAY_SECONDS;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(tuning.blipGain, start + BLIP_ATTACK_SECONDS);
      envelope.gain.linearRampToValueAtTime(0, start + BLIP_SECONDS);
      osc.connect(envelope);
      envelope.connect(out);
      osc.onended = () => {
        osc.disconnect();
        envelope.disconnect();
        self.released(2);
      };
      osc.start(start);
      osc.stop(start + BLIP_SECONDS);
    },
    stats() {
      const state: AudioState = !ctx ? 'none' : ctx.state === 'running' ? 'running' : 'suspended';
      let rms = 0;
      let peak = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          sum += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        rms = Math.sqrt(sum / samples.length);
      }
      return { state, masterGain: master ? master.gain.value : 0, nodes, rmsDb: decibels(rms), peakDb: decibels(peak) };
    },
  };
  return self;
}

// Whether a settings change plays the blip: the volume or the mute changed and the result is audible.
export function shouldBlip(previous: PlayerSettings, next: PlayerSettings, tuning: AudioTuning): boolean {
  if (previous.volume === next.volume && previous.muted === next.muted) return false;
  return masterGain(next.volume, next.muted, tuning) > 0;
}

export interface GestureTarget {
  addEventListener(type: string, listener: () => void, capture: boolean): void;
}
export const GESTURE_EVENTS = ['keydown', 'pointerup', 'click'] as const;

// Every gesture calls `start`, which does nothing once the context runs. In the capture phase, so a screen's own
// key handler that stops the event (the settings screen's) can't hide the gesture.
export function installGestureStart(target: GestureTarget, audio: Pick<Audio, 'start'>): void {
  for (const type of GESTURE_EVENTS) target.addEventListener(type, () => audio.start(), true);
}
