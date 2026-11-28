// The engine's numbers (audio/engine.ts). Hertz are the engine's firing frequency, the note heard.
export interface EngineTuning {
  idleHertz: number; // standing, no throttle
  launchHertz: number; // added to the idle floor at full throttle, so a standing car revs as it pulls away
  shiftHertz: number; // at the top of each gear, where it shifts up
  maxHertz: number; // never above, also past top speed after a dev slider change
  gearTops: number[]; // share of top speed at the top of each virtual gear, rising, the last 1
  shiftHysteresis: number; // share of top speed past a gear's edge before it shifts, so it doesn't hunt
  reverseTop: number; // share of top speed at which reverse reaches shiftHertz
  idleLevel: number; // gain at idle
  revLevel: number; // added at maxHertz under load
  loadLevel: number; // added at full throttle
  coastShare: number; // share of revLevel left off the throttle, 0 to 1
  brakeCut: number; // level lost at full brake, 0 to 1
  coastBrightness: number; // low-pass cutoff in multiples of the note off the throttle
  loadBrightness: number; // at full throttle
  minCutoff: number; // Hz
  maxCutoff: number; // Hz
  resonance: number; // the low-pass's Q, in dB
  highpassHertz: number; // nothing below this reaches the bus (small speakers don't play it, infrasound eats headroom)
  sawMix: number; // gain of the sawtooth at the note
  squareMix: number; // gain of the square at the note, detuned from the sawtooth
  subMix: number; // gain of the sine an octave below
  detuneCents: number; // the sawtooth this far up, the square this far down
  noiseIdle: number; // gain of the filtered noise (breath) at idle
  noiseLoad: number; // added at full throttle
  noiseBand: number; // the noise's band-pass centre in multiples of the note
  wobbleCents: number; // depth of the pitch wobble at idle, gone by wobbleFade
  wobbleFade: number; // share of the rev range over which the wobble fades out
  wobbleHertz: number; // rate of the wobble
  gain: number; // the whole engine's output gain
}

// Numbers to tune by ear; the dev menu's Sound page edits this object and the audio module reads it on `retune`.
export interface AudioTuning {
  volumeCurve: number; // master gain = (volume / steps) ^ this, so each step sounds like the one before
  topGain: number; // master gain at the top volume step, 0 to 1
  busGains: Record<string, number>; // per bus name; a bus not listed is 1
  blipGain: number; // peak gain of the settings screen's blip
  blipHertz: number;
  engine: EngineTuning;
}

export const DEFAULT_ENGINE_TUNING: Readonly<EngineTuning> = {
  idleHertz: 50,
  launchHertz: 30,
  shiftHertz: 140,
  maxHertz: 175,
  gearTops: [0.2, 0.38, 0.57, 0.78, 1],
  shiftHysteresis: 0.03,
  reverseTop: 0.45,
  idleLevel: 0.45,
  revLevel: 0.2,
  loadLevel: 0.15,
  coastShare: 0.45,
  brakeCut: 0.4,
  coastBrightness: 5,
  loadBrightness: 9,
  minCutoff: 900,
  maxCutoff: 5000,
  resonance: 5,
  highpassHertz: 40,
  sawMix: 0.45,
  squareMix: 0.25,
  subMix: 0.2,
  detuneCents: 7,
  noiseIdle: 0.02,
  noiseLoad: 0.08,
  noiseBand: 6,
  wobbleCents: 20,
  wobbleFade: 0.25,
  wobbleHertz: 4.5,
  gain: 0.3,
};

export const DEFAULT_AUDIO_TUNING: Readonly<AudioTuning> = {
  volumeCurve: 1.5,
  topGain: 1,
  busGains: { world: 1, interface: 1 },
  blipGain: 0.12,
  blipHertz: 880,
  engine: DEFAULT_ENGINE_TUNING,
};

export function createAudioTuning(): AudioTuning {
  const { engine } = DEFAULT_AUDIO_TUNING;
  return {
    ...DEFAULT_AUDIO_TUNING,
    busGains: { ...DEFAULT_AUDIO_TUNING.busGains },
    engine: { ...engine, gearTops: [...engine.gearTops] },
  };
}
