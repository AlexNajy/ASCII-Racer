import type {
  AnalyserLike,
  BufferLike,
  BufferSourceLike,
  CompressorLike,
  ContextLike,
  FilterLike,
  GainLike,
  NodeLike,
  OscillatorLike,
  ParamLike,
} from './audio.ts';

// A stand-in AudioContext for tests: params jump straight to their targets, nodes remember what they connect to.

export function param(): ParamLike {
  const self: ParamLike = {
    value: 0,
    setTargetAtTime(target) {
      self.value = target;
    },
    setValueAtTime(value) {
      self.value = value;
    },
    linearRampToValueAtTime(value) {
      self.value = value;
    },
    exponentialRampToValueAtTime(value) {
      self.value = value;
    },
  };
  return self;
}

export class FakeNode implements NodeLike {
  connections: (NodeLike | ParamLike)[] = [];
  disconnected = false;
  connect(destination: NodeLike | ParamLike) {
    this.connections.push(destination);
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class FakeContext implements ContextLike {
  state = 'running';
  time = 1;
  held = false; // a clock that has not started: reads 0 whatever `time` is
  get currentTime() {
    return this.held ? 0 : this.time;
  }
  set currentTime(value: number) {
    this.time = value;
  }
  sampleRate = 48000;
  resumes = 0;
  destination = new FakeNode();
  oscillators: (FakeNode & OscillatorLike)[] = [];
  gains: (FakeNode & GainLike)[] = [];
  filters: (FakeNode & FilterLike)[] = [];
  sources: (FakeNode & BufferSourceLike & { started: boolean; stopped: boolean; offset: number })[] = [];
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    const node = Object.assign(new FakeNode(), { gain: param() });
    this.gains.push(node);
    return node;
  }
  createDynamicsCompressor(): CompressorLike {
    return Object.assign(new FakeNode(), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  }
  createAnalyser(): AnalyserLike {
    return Object.assign(new FakeNode(), { fftSize: 0, getFloatTimeDomainData: () => {} });
  }
  createOscillator() {
    const node = Object.assign(new FakeNode(), {
      type: '',
      frequency: param(),
      detune: param(),
      onended: null as (() => void) | null,
      started: false,
      start: () => {
        node.started = true;
      },
      stop: () => {},
    });
    this.oscillators.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = Object.assign(new FakeNode(), { type: '', frequency: param(), detune: param(), Q: param() });
    this.filters.push(node);
    return node;
  }
  createBuffer(channels: number, length: number): BufferLike {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => data[channel] };
  }
  createBufferSource() {
    const node = Object.assign(new FakeNode(), {
      buffer: null as BufferLike | null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      started: false,
      stopped: false,
      offset: 0,
      start: (_when: number, offset = 0) => {
        node.started = true;
        node.offset = offset;
      },
      stop: () => {
        node.stopped = true;
      },
    });
    this.sources.push(node);
    return node;
  }
}
