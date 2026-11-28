import { DRIFT_SLIDE_SPEED } from '../render/drift.ts';

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

// The tyre screech's numbers (audio/tyres.ts). Slide is the car's sideways speed, m/s.
export interface TyreTuning {
  slideStart: number; // silent at or below this slide, where the drift sparks start
  slideFull: number; // full level from this slide on
  fadeCurve: number; // level = share of the range ^ this, so it creeps in
  hertz: number; // the main peak at slideStart
  pitchRise: number; // added to every peak at slideFull, as a share of the note
  spread: number; // the second peak at this multiple of the main one, slightly off so the two beat
  spreadMix: number; // its gain against the main peak's 1
  harmonicMix: number; // gain of a peak an octave above the main one
  q: number; // the peaks' Q: high is a whistle, low is hiss
  wobbleCents: number; // depth of the pitch wobble
  wobbleHertz: number;
  attackSeconds: number; // time constant of the level rising
  releaseSeconds: number; // and falling
  highpassHertz: number; // nothing below this reaches the bus
  gain: number; // the whole screech's output gain at full level (narrow band noise is quiet)
}

// The impact thud's numbers (audio/impacts.ts). Speed is the impact's speed into the wall, m/s.
export interface ImpactTuning {
  minSpeed: number; // no thud below this
  fullSpeed: number; // full level and brightness from this on
  minLevel: number; // level at minSpeed, rising to 1 at fullSpeed
  levelCurve: number; // level rises with share of the range ^ this
  bodyStartHertz: number; // the body's pitch at the hit, at fullSpeed (minSpeed starts bodyStartSoft lower)
  bodyStartSoft: number; // share of the start pitch lost on the softest hit
  bodyEndHertz: number; // where the body's pitch drops to
  pitchSeconds: number; // how long the drop takes
  bodySeconds: number; // the body's length to -60 dB
  crunchMix: number; // the crunch's gain against the body's 1, at fullSpeed
  crunchSoftMix: number; // its share at minSpeed
  crunchLowHertz: number; // the crunch's band-pass centre at minSpeed
  crunchHighHertz: number; // at fullSpeed
  crunchSeconds: number; // the crunch's length to -60 dB
  minGapSeconds: number; // no thud this soon after the last
  maxPlaying: number; // thuds sounding at once
  maskSeconds: number; // a thud masks softer hits after it, fading with this time constant (0: no masking)
  maskRatio: number; // a hit on the same wall must beat the last thud's speed times this, faded
  sameWallDot: number; // two normals with a dot product above this are the same wall
  harderRatio: number; // a hit this many times the last thud's speed always plays, past the gap, cap and mask
  highpassHertz: number;
  gain: number; // the thud's output gain at full level
}

// Numbers to tune by ear; the dev menu's Sound page edits this object and the audio module reads it on `retune`.
export interface AudioTuning {
  volumeCurve: number; // master gain = (volume / steps) ^ this, so each step sounds like the one before
  topGain: number; // master gain at the top volume step, 0 to 1
  busGains: Record<string, number>; // per bus name; a bus not listed is 1
  blipGain: number; // peak gain of the settings screen's blip
  blipHertz: number;
  engine: EngineTuning;
  tyres: TyreTuning;
  impacts: ImpactTuning;
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

export const DEFAULT_TYRE_TUNING: Readonly<TyreTuning> = {
  slideStart: DRIFT_SLIDE_SPEED,
  slideFull: 9,
  fadeCurve: 1.5,
  hertz: 1300,
  pitchRise: 0.25,
  spread: 1.045,
  spreadMix: 0.7,
  harmonicMix: 0.35,
  q: 19,
  wobbleCents: 35,
  wobbleHertz: 6.5,
  attackSeconds: 0.05,
  releaseSeconds: 0.1,
  highpassHertz: 200,
  gain: 0.9,
};

export const DEFAULT_IMPACT_TUNING: Readonly<ImpactTuning> = {
  minSpeed: 2, // under the debris threshold (3 m/s), so every hit that throws debris thuds
  fullSpeed: 16,
  minLevel: 0.25,
  levelCurve: 1,
  bodyStartHertz: 320,
  bodyStartSoft: 0.25,
  bodyEndHertz: 60,
  pitchSeconds: 0.12,
  bodySeconds: 0.32,
  crunchMix: 1,
  crunchSoftMix: 0.5,
  crunchLowHertz: 700,
  crunchHighHertz: 2800,
  crunchSeconds: 0.12,
  minGapSeconds: 0.08,
  maxPlaying: 3,
  maskSeconds: 0.5,
  maskRatio: 1.15,
  sameWallDot: 0.7,
  harderRatio: 1.5,
  highpassHertz: 40,
  gain: 0.3,
};

export const DEFAULT_AUDIO_TUNING: Readonly<AudioTuning> = {
  volumeCurve: 1.5,
  topGain: 1,
  busGains: { world: 1, interface: 1 },
  blipGain: 0.12,
  blipHertz: 880,
  engine: DEFAULT_ENGINE_TUNING,
  tyres: DEFAULT_TYRE_TUNING,
  impacts: DEFAULT_IMPACT_TUNING,
};

export function createAudioTuning(): AudioTuning {
  const { engine, tyres, impacts } = DEFAULT_AUDIO_TUNING;
  return {
    ...DEFAULT_AUDIO_TUNING,
    busGains: { ...DEFAULT_AUDIO_TUNING.busGains },
    engine: { ...engine, gearTops: [...engine.gearTops] },
    tyres: { ...tyres },
    impacts: { ...impacts },
  };
}
