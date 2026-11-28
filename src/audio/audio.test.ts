import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../app/settings.ts';
import {
  BLIP_SECONDS,
  createAudio,
  GESTURE_EVENTS,
  installGestureStart,
  installVisibility,
  shouldBlip,
} from './audio.ts';
import { FakeContext, type FakeNode } from './fakeContext.ts';
import { createAudioTuning } from './tuning.ts';

function setup() {
  const context = new FakeContext();
  let made = 0;
  const audio = createAudio(() => {
    made++;
    return context;
  }, createAudioTuning());
  return { context, audio, made: () => made };
}

describe('start rule', () => {
  it('does nothing before the first start: no context, calls are no-ops', () => {
    const { audio, made } = setup();
    audio.setLevels(8, false);
    audio.blip();
    audio.retune();
    expect(audio.bus('world')).toBeNull();
    expect(audio.context()).toBeNull();
    expect(audio.stats()).toMatchObject({ state: 'none', masterGain: 0, nodes: 0 });
    expect(made()).toBe(0);
  });

  it('creates the context once, on the first start, with the levels set before it', () => {
    const { audio, made } = setup();
    audio.setLevels(10, false);
    audio.start();
    audio.start();
    expect(made()).toBe(1);
    expect(audio.stats()).toMatchObject({ state: 'running', masterGain: 1 });
  });

  it('resumes a suspended context on a later start, and only then', () => {
    const { audio, context } = setup();
    audio.start();
    audio.start();
    expect(context.resumes).toBe(0);
    context.state = 'suspended';
    expect(audio.stats().state).toBe('suspended');
    expect(audio.context()).toBeNull();
    audio.start();
    expect(context.resumes).toBe(1);
  });

  it('runs silent without a context factory and when creating one throws', () => {
    const none = createAudio(null, createAudioTuning());
    none.start();
    expect(none.stats().state).toBe('none');
    const broken = createAudio(() => {
      throw new Error('no audio');
    }, createAudioTuning());
    broken.start();
    broken.start();
    expect(broken.stats().state).toBe('none');
    expect(broken.bus('world')).toBeNull();
  });

  it('does not queue sounds called before the start', () => {
    const { audio, context } = setup();
    audio.blip();
    audio.setLevels(8, false);
    audio.start();
    expect(context.oscillators).toHaveLength(0);
  });

  it('starts from every gesture event on the target', () => {
    const listeners = new Map<string, () => void>();
    let starts = 0;
    const captures: boolean[] = [];
    installGestureStart(
      {
        addEventListener: (type, listener, capture) => {
          listeners.set(type, listener);
          captures.push(capture);
        },
      },
      { start: () => starts++ },
    );
    expect(captures.every(Boolean)).toBe(true);
    expect([...listeners.keys()]).toEqual([...GESTURE_EVENTS]);
    listeners.forEach((listener) => listener());
    expect(starts).toBe(GESTURE_EVENTS.length);
  });
});

describe('graph and buses', () => {
  it('has the world and interface buses under the master, which feeds the limiter', () => {
    const { audio, context } = setup();
    audio.start();
    const world = audio.bus('world') as FakeNode | null;
    const ui = audio.bus('interface') as FakeNode | null;
    expect(world).not.toBeNull();
    expect(ui).not.toBe(world);
    const master = context.gains[0];
    expect(world!.connections).toEqual([master]);
    expect(ui!.connections).toEqual([master]);
    expect(master.connections).toHaveLength(1);
  });

  it('makes other buses by name once and counts every node', () => {
    const { audio } = setup();
    audio.start();
    const base = audio.stats().nodes;
    expect(base).toBe(6);
    const tyres = audio.bus('tyres');
    expect(audio.bus('tyres')).toBe(tyres);
    expect(audio.stats().nodes).toBe(base + 1);
  });

  it('runs whenReady callbacks once, at the start or at once when already started', () => {
    const { audio } = setup();
    let calls = 0;
    audio.whenReady(() => calls++);
    expect(calls).toBe(0);
    audio.start();
    audio.start();
    expect(calls).toBe(1);
    audio.whenReady(() => calls++);
    expect(calls).toBe(2);
  });

  it('sets bus gains from the tuning and applies a retune', () => {
    const tuning = createAudioTuning();
    tuning.busGains.world = 0.5;
    const context = new FakeContext();
    const audio = createAudio(() => context, tuning);
    audio.start();
    expect(audio.bus('world')!.gain.value).toBe(0.5);
    tuning.busGains.world = 0.25;
    audio.retune();
    expect(audio.bus('world')!.gain.value).toBe(0.25);
  });

  it('follows volume and mute changes on the master gain', () => {
    const { audio } = setup();
    audio.start();
    audio.setLevels(5, false);
    const five = audio.stats().masterGain;
    expect(five).toBeGreaterThan(0);
    audio.setLevels(5, true);
    expect(audio.stats().masterGain).toBe(0);
    audio.setLevels(5, false);
    expect(audio.stats().masterGain).toBe(five);
  });
});

describe('hidden tab', () => {
  it('fades the master to 0 while hidden and back to the volume when shown', () => {
    const { audio } = setup();
    audio.setLevels(8, false);
    audio.start();
    const shown = audio.stats().masterGain;
    expect(shown).toBeGreaterThan(0);
    audio.setHidden(true);
    expect(audio.stats().masterGain).toBe(0);
    audio.setLevels(10, false);
    audio.retune();
    expect(audio.stats().masterGain).toBe(0);
    audio.setHidden(false);
    expect(audio.stats().masterGain).toBe(1);
  });

  it('starts silent when the tab is hidden before the context exists, and plays no blip', () => {
    const { audio, context } = setup();
    audio.setLevels(8, false);
    audio.setHidden(true);
    audio.start();
    expect(audio.stats().masterGain).toBe(0);
    audio.blip();
    expect(context.oscillators).toHaveLength(0);
  });

  it('follows the visibilitychange event of the target', () => {
    let listener: (() => void) | null = null;
    const target = {
      hidden: true,
      addEventListener: (_type: 'visibilitychange', callback: () => void) => {
        listener = callback;
      },
    };
    const calls: boolean[] = [];
    installVisibility(target, { setHidden: (hidden) => calls.push(hidden) });
    target.hidden = false;
    listener!();
    target.hidden = true;
    listener!();
    expect(calls).toEqual([true, false, true]);
  });
});

describe('blip', () => {
  it('plays through the interface bus and releases its nodes when it ends', () => {
    const { audio, context } = setup();
    audio.setLevels(8, false);
    audio.start();
    const base = audio.stats().nodes;
    audio.blip();
    expect(audio.stats().nodes).toBe(base + 2);
    const osc = context.oscillators[0];
    expect(BLIP_SECONDS).toBeLessThanOrEqual(0.07);
    osc.onended!();
    expect(audio.stats().nodes).toBe(base);
    expect(osc.disconnected).toBe(true);
  });

  it('stays silent when muted, at volume 0 or suspended', () => {
    const { audio, context } = setup();
    audio.start();
    audio.setLevels(8, true);
    audio.blip();
    audio.setLevels(0, false);
    audio.blip();
    audio.setLevels(8, false);
    context.state = 'suspended';
    audio.blip();
    expect(context.oscillators).toHaveLength(0);
  });

  describe('rule', () => {
    const base: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, volume: 5, muted: false };
    const tuning = createAudioTuning();
    it('blips when the volume changes to an audible level', () => {
      expect(shouldBlip(base, { ...base, volume: 6 }, tuning)).toBe(true);
      expect(shouldBlip(base, { ...base, volume: 4 }, tuning)).toBe(true);
    });
    it('does not blip at volume 0 or while muted', () => {
      expect(shouldBlip(base, { ...base, volume: 0 }, tuning)).toBe(false);
      expect(shouldBlip({ ...base, muted: true }, { ...base, muted: true, volume: 6 }, tuning)).toBe(false);
    });
    it('blips when mute is switched off, not on', () => {
      expect(shouldBlip({ ...base, muted: true }, base, tuning)).toBe(true);
      expect(shouldBlip(base, { ...base, muted: true }, tuning)).toBe(false);
    });
    it('does not blip when neither changed', () => {
      expect(shouldBlip(base, { ...base, nickname: 'zed', cellWidth: 8 }, tuning)).toBe(false);
    });
  });
});
