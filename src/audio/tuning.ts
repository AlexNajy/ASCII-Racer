// Numbers to tune by ear; the dev menu's Sound page edits this object and the audio module reads it on `retune`.
export interface AudioTuning {
  volumeCurve: number; // master gain = (volume / steps) ^ this, so each step sounds like the one before
  topGain: number; // master gain at the top volume step, 0 to 1
  busGains: Record<string, number>; // per bus name; a bus not listed is 1
  blipGain: number; // peak gain of the settings screen's blip
  blipHertz: number;
}

export const DEFAULT_AUDIO_TUNING: Readonly<AudioTuning> = {
  volumeCurve: 1.5,
  topGain: 1,
  busGains: { world: 1, interface: 1 },
  blipGain: 0.12,
  blipHertz: 880,
};

export function createAudioTuning(): AudioTuning {
  return { ...DEFAULT_AUDIO_TUNING, busGains: { ...DEFAULT_AUDIO_TUNING.busGains } };
}
