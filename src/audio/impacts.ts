import { noiseBuffer, type Audio, type BufferLike, type FilterLike, type NodeLike, type ParamLike } from './audio.ts';
import type { AudioTuning, ImpactTuning } from './tuning.ts';

// The impact thud: a one-shot per hit, its nodes made for it and released when it ends.
//   triangle dropping in pitch (the body) + a short burst of band-passed noise (the crunch), each with its own
//   envelope -> a shared high-pass -> the world bus
// thudSound turns the impact's speed into the hit's numbers.

export interface ThudTargets {
  level: number; // 0 silent, else minLevel to 1, before the tuning's output gain
  startHertz: number; // the body's pitch at the hit
  crunch: number; // the crunch's peak against the body's
  crunchHertz: number; // the crunch's band-pass centre
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

// A hit at `speed` m/s into the wall: nothing below minSpeed, louder, higher and brighter up to fullSpeed.
export function thudSound(speed: number, tuning: ImpactTuning): ThudTargets {
  const hit = finite(speed);
  if (!(hit >= tuning.minSpeed) || hit <= 0) return { level: 0, startHertz: 0, crunch: 0, crunchHertz: 0 };
  const range = tuning.fullSpeed - tuning.minSpeed;
  const share = range > 0 ? clamp((hit - tuning.minSpeed) / range, 0, 1) : 1;
  const minLevel = clamp(tuning.minLevel, 0, 1);
  const soft = clamp(tuning.crunchSoftMix, 0, 1);
  const low = Math.max(20, tuning.crunchLowHertz);
  const high = Math.max(low, tuning.crunchHighHertz);
  return {
    level: clamp(finite(minLevel + (1 - minLevel) * share ** Math.max(0.01, tuning.levelCurve)), 0, 1),
    startHertz: Math.max(20, finite(tuning.bodyStartHertz * (1 - clamp(tuning.bodyStartSoft, 0, 1) * (1 - share)))),
    crunch: Math.max(0, finite(tuning.crunchMix * (soft + (1 - soft) * share))),
    crunchHertz: finite(low * (high / low) ** share),
  };
}

// The last thud (when, how hard, which wall) and when the last contact with that wall was. A hit on the same wall that
// a louder thud just masked refreshes `contactTime`, so a car pushed along a wall, which gives an impact every tick,
// stays masked for as long as it keeps touching and thuds once.
export interface ThudGate {
  lastTime: number;
  lastSpeed: number;
  lastNormalX: number;
  lastNormalZ: number;
  contactTime: number;
}

export function thudGate(): ThudGate {
  return { lastTime: -Infinity, lastSpeed: 0, lastNormalX: 0, lastNormalZ: 0, contactTime: -Infinity };
}

// Whether a hit at `speed` (loud enough, see thudSound) on the wall with this normal plays at `now` s with `playing`
// thuds sounding; records it if so. A hit at least harderRatio times the last thud always plays: a faint contact must
// not hide the crash right after it. The gap, the cap and the mask refuse the rest; the mask only against the same
// wall (normals within sameWallDot), a different wall is a new hit.
export function allowThud(
  gate: ThudGate,
  speed: number,
  normalX: number,
  normalZ: number,
  now: number,
  playing: number,
  tuning: ImpactTuning,
): boolean {
  const harder = speed >= gate.lastSpeed * tuning.harderRatio;
  if (!harder) {
    const sameWall = normalX * gate.lastNormalX + normalZ * gate.lastNormalZ > tuning.sameWallDot;
    const since = now - gate.lastTime;
    if (!(since >= tuning.minGapSeconds) || playing >= tuning.maxPlaying) {
      if (sameWall) gate.contactTime = now;
      return false;
    }
    if (sameWall && tuning.maskSeconds > 0) {
      const mask = gate.lastSpeed * tuning.maskRatio * Math.exp(-(now - gate.contactTime) / tuning.maskSeconds);
      gate.contactTime = now;
      if (!(speed > mask)) return false;
    }
  }
  gate.lastTime = now;
  gate.contactTime = now;
  gate.lastSpeed = speed;
  gate.lastNormalX = normalX;
  gate.lastNormalZ = normalZ;
  return true;
}

const NOISE_SECONDS = 0.5; // longer than any crunch
const NOISE_SEED = 0xb0d7;
const DELAY_SECONDS = 0.005; // scheduled a moment ahead, never in the past
const ATTACK_SECONDS = 0.002;
const TAIL_SECONDS = 0.005; // from -60 dB to 0, so the stop never clicks
const FLOOR = 0.001; // -60 dB, where the exponential decays end
const CRUNCH_Q = 1.2;
const HIGHPASS_Q = Math.SQRT1_2;
export const NODES_PER_THUD = 5;

// Attack to `peak`, exponential decay to -60 dB at `seconds`, then to 0.
function envelope(gain: ParamLike, peak: number, start: number, seconds: number) {
  const decayEnd = start + Math.max(ATTACK_SECONDS * 2, seconds);
  gain.setValueAtTime(0, start);
  gain.linearRampToValueAtTime(peak, start + ATTACK_SECONDS);
  gain.exponentialRampToValueAtTime(peak * FLOOR, decayEnd);
  gain.linearRampToValueAtTime(0, decayEnd + TAIL_SECONDS);
  return decayEnd + TAIL_SECONDS;
}

export interface Thuds {
  // The frame's hardest impact: plays a thud if it is hard enough, the car is heard and allowThud lets it. Returns
  // whether it played.
  hit(speed: number, normalX: number, normalZ: number, heard: boolean): boolean;
  retune(): void;
  playing(): number;
  played(): number; // since startup, for headless checks
}

// The thuds on the game's audio: the shared high-pass is built in whenReady, on the world bus.
export function createThuds(audio: Audio, tuning: AudioTuning): Thuds {
  let out: FilterLike | null = null;
  let noise: BufferLike | null = null;
  const gate = thudGate();
  let sounding = 0;
  let total = 0;
  audio.whenReady((ready, context) => {
    const bus = ready.bus('world');
    if (!bus) return;
    out = ready.counted(context.createBiquadFilter());
    out.type = 'highpass';
    out.frequency.value = tuning.impacts.highpassHertz;
    out.Q.value = HIGHPASS_Q;
    out.connect(bus);
    noise = noiseBuffer(context, NOISE_SECONDS, NOISE_SEED);
  });
  return {
    hit(speed, normalX, normalZ, heard) {
      const context = audio.context();
      const t = tuning.impacts;
      if (!out || !noise || !context || !heard) return false;
      const sound = thudSound(speed, t);
      const peak = sound.level * t.gain;
      if (peak <= 0) return false;
      const now = context.currentTime;
      if (!allowThud(gate, speed, normalX, normalZ, now, sounding, t)) return false;

      const start = now + DELAY_SECONDS;
      const body = audio.counted(context.createOscillator());
      const bodyGain = audio.counted(context.createGain());
      const crunch = audio.counted(context.createBufferSource());
      const band = audio.counted(context.createBiquadFilter());
      const crunchGain = audio.counted(context.createGain());
      body.type = 'triangle';
      body.frequency.setValueAtTime(sound.startHertz, start);
      body.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(sound.startHertz, t.bodyEndHertz)), start + Math.max(0.01, t.pitchSeconds));
      const bodyEnd = envelope(bodyGain.gain, peak, start, t.bodySeconds);
      crunch.buffer = noise;
      band.type = 'bandpass';
      band.frequency.value = sound.crunchHertz;
      band.Q.value = CRUNCH_Q;
      const crunchPeak = peak * sound.crunch;
      crunchGain.gain.value = 0;
      const crunchEnd = crunchPeak > 0 ? envelope(crunchGain.gain, crunchPeak, start, Math.min(t.crunchSeconds, NOISE_SECONDS)) : start;

      body.connect(bodyGain);
      bodyGain.connect(out);
      crunch.connect(band);
      band.connect(crunchGain);
      crunchGain.connect(out);
      const end = Math.max(bodyEnd, crunchEnd);
      sounding++;
      total++;
      body.onended = () => {
        for (const node of [body, bodyGain, crunch, band, crunchGain] as NodeLike[]) node.disconnect();
        audio.released(NODES_PER_THUD);
        sounding--;
      };
      body.start(start);
      crunch.start(start, Math.random() * Math.max(0, NOISE_SECONDS - (crunchEnd - start)));
      body.stop(end);
      crunch.stop(end);
      return true;
    },
    retune() {
      const context = audio.context();
      if (out && context) out.frequency.setTargetAtTime(tuning.impacts.highpassHertz, context.currentTime, 0.05);
    },
    playing: () => sounding,
    played: () => total,
  };
}
