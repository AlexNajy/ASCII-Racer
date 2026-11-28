import { VOLUME_STEPS } from '../app/settings.ts';
import { DEFAULT_AUDIO_TUNING } from './tuning.ts';

// The master gain for the player's volume step and mute: exactly 0 when silent, a power curve between, exactly the
// top gain at the top step.
export function masterGain(
  volume: number,
  muted: boolean,
  tuning: { volumeCurve: number; topGain: number } = DEFAULT_AUDIO_TUNING,
): number {
  if (muted || !(volume > 0)) return 0;
  const share = Math.min(1, volume / VOLUME_STEPS);
  return share === 1 ? tuning.topGain : tuning.topGain * share ** tuning.volumeCurve;
}
