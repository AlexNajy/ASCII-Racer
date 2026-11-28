import { describe, expect, it } from 'vitest';
import { VOLUME_STEPS } from '../app/settings.ts';
import { masterGain } from './gain.ts';
import { createAudioTuning, DEFAULT_AUDIO_TUNING } from './tuning.ts';

describe('masterGain', () => {
  it('is exactly 0 at volume 0 and when muted, at any volume', () => {
    expect(masterGain(0, false)).toBe(0);
    for (let volume = 0; volume <= VOLUME_STEPS; volume++) expect(masterGain(volume, true)).toBe(0);
  });

  it('is exactly the top gain at the top step', () => {
    expect(masterGain(VOLUME_STEPS, false)).toBe(DEFAULT_AUDIO_TUNING.topGain);
    expect(masterGain(VOLUME_STEPS, false, { volumeCurve: 2, topGain: 0.7 })).toBe(0.7);
  });

  it('rises with every step', () => {
    for (let volume = 1; volume <= VOLUME_STEPS; volume++) {
      expect(masterGain(volume, false)).toBeGreaterThan(masterGain(volume - 1, false));
    }
  });

  it('follows the power curve', () => {
    const table = [0, 0.0316, 0.0894, 0.1643, 0.253, 0.3536, 0.4648, 0.5857, 0.7155, 0.8538, 1];
    table.forEach((expected, volume) => expect(masterGain(volume, false)).toBeCloseTo(expected, 4));
  });

  it('keeps the volume inside 0 to the top step', () => {
    expect(masterGain(-3, false)).toBe(0);
    expect(masterGain(VOLUME_STEPS + 5, false)).toBe(DEFAULT_AUDIO_TUNING.topGain);
  });

  it('reads the tuning it is given', () => {
    const tuning = createAudioTuning();
    tuning.topGain = 0.5;
    expect(masterGain(VOLUME_STEPS, false, tuning)).toBe(0.5);
  });
});
