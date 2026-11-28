import { describe, expect, it } from 'vitest';
import type { CarInput } from './carInput.ts';
import {
  codeInput,
  decodeLog,
  decodeLogText,
  encodeLog,
  encodeLogText,
  INPUT_LOG_VERSION,
  inputCode,
  InputLogError,
  InputRecorder,
  isInputCode,
  MAX_LOG_BYTES,
  MAX_LOG_TEXT,
  MAX_RUN_TICKS,
  toBase64Url,
  type DecodedLog,
} from './inputLog.ts';
import { createRandom } from '../math/random.ts';

const CODES = Array.from({ length: 32 }, (_, code) => code).filter(isInputCode);
const THROTTLE = inputCode({ throttle: 1, brake: 0, steer: 0, drift: 0 });
const LEFT = inputCode({ throttle: 1, brake: 0, steer: 1, drift: 0 });
const STEER_BITS_UNUSED = 3 << 2; // steer field 3: no input has it

function ok(result: DecodedLog): Uint8Array {
  if (!result.ok) throw new Error(`rejected: ${result.fault}`);
  return result.log;
}

function fault(result: DecodedLog): string | null {
  return result.ok ? null : result.fault;
}

function randomLog(random: () => number, maxTicks: number): Uint8Array {
  const ticks = Math.floor(random() * maxTicks);
  const log = new Uint8Array(ticks);
  let code = CODES[0];
  for (let i = 0; i < ticks; ) {
    const run = 1 + Math.floor(random() ** 3 * 300);
    log.fill(code, i, Math.min(ticks, i + run));
    i += run;
    code = CODES[Math.floor(random() * CODES.length)];
  }
  return log;
}

describe('input codes', () => {
  it('give every keyboard input its own code, and back', () => {
    const inputs: CarInput[] = [];
    for (const throttle of [0, 1]) for (const brake of [0, 1]) for (const steer of [-1, 0, 1]) for (const drift of [0, 1]) inputs.push({ throttle, brake, steer, drift });
    const codes = inputs.map(inputCode);
    expect(new Set(codes).size).toBe(24);
    expect([...codes].sort((a, b) => a - b)).toEqual(CODES);
    codes.forEach((code, i) => expect(codeInput(code)).toEqual(inputs[i]));
  });

  it('refuse inputs the keyboard cannot make, rather than rounding them', () => {
    for (const input of [
      { throttle: 0.6, brake: 0, steer: 0, drift: 0 },
      { throttle: 1, brake: 0, steer: 0.5, drift: 0 },
      { throttle: 1, brake: 0, steer: -0, drift: 0 },
      { throttle: 1, brake: 0, steer: 2, drift: 0 },
      { throttle: 0, brake: 0, steer: 0, drift: 0.5 },
    ]) {
      expect(() => inputCode(input)).toThrow(InputLogError);
    }
    expect(() => codeInput(STEER_BITS_UNUSED)).toThrow(InputLogError);
  });
});

describe('input recorder', () => {
  it('keeps one code per tick, grows as it goes and starts again on reset', () => {
    const recorder = new InputRecorder();
    for (let i = 0; i < 10000; i++) recorder.record(codeInput(i % 100 < 50 ? THROTTLE : LEFT));
    const log = recorder.log();
    expect(log.length).toBe(10000);
    expect(log[49]).toBe(THROTTLE);
    expect(log[50]).toBe(LEFT);
    recorder.reset();
    expect(recorder.ticks).toBe(0);
    expect(recorder.log().length).toBe(0);
  });

  it('stops at the longest run and says so', () => {
    const recorder = new InputRecorder();
    for (let i = 0; i < MAX_RUN_TICKS; i++) recorder.record(codeInput(THROTTLE));
    expect(recorder.overflowed).toBe(false);
    recorder.record(codeInput(THROTTLE));
    expect(recorder.overflowed).toBe(true);
    expect(recorder.ticks).toBe(MAX_RUN_TICKS);
  });
});

describe('packed input log', () => {
  it('packs runs as documented', () => {
    const log = new Uint8Array([...Array(3).fill(THROTTLE), ...Array(8).fill(LEFT), ...Array(200).fill(THROTTLE)]);
    const bytes = encodeLog(log);
    // version, 211 ticks (varint 0xd3 0x01), 3 × throttle, 8 × left (long form, 0 more), 200 × throttle (192 more)
    expect([...bytes]).toEqual([INPUT_LOG_VERSION, 0xd3, 0x01, THROTTLE | (2 << 5), LEFT | (7 << 5), 0, THROTTLE | (7 << 5), 0xc0, 0x01]);
    expect(ok(decodeLog(bytes))).toEqual(log);
    expect([...encodeLog(new Uint8Array(0))]).toEqual([INPUT_LOG_VERSION, 0]);
  });

  it('round-trips random logs, and their bytes and text are the only encoding of them', () => {
    const random = createRandom(17);
    for (let i = 0; i < 2000; i++) {
      const log = randomLog(random, i < 1000 ? 400 : 8000);
      const bytes = encodeLog(log);
      const decoded = ok(decodeLog(bytes));
      expect(decoded).toEqual(log);
      expect(encodeLog(decoded)).toEqual(bytes);
      expect(ok(decodeLogText(encodeLogText(log)))).toEqual(log);
    }
  });

  it('fits a log changing every tick for the longest run in the limits', () => {
    const log = new Uint8Array(MAX_RUN_TICKS).map((_, i) => CODES[i % CODES.length]);
    const bytes = encodeLog(log);
    expect(bytes.length).toBe(MAX_LOG_BYTES);
    const text = encodeLogText(log);
    expect(text.length).toBeLessThanOrEqual(MAX_LOG_TEXT);
    expect(ok(decodeLogText(text))).toEqual(log);
    expect(() => encodeLog(new Uint8Array(MAX_RUN_TICKS + 1))).toThrow(InputLogError);
    expect(() => encodeLog(new Uint8Array([STEER_BITS_UNUSED]))).toThrow(InputLogError);
  });

  it('rejects what no recorder writes', () => {
    const v = INPUT_LOG_VERSION;
    const cases: [string, number[]][] = [
      ['empty', []],
      ['version', [v + 1, 1, THROTTLE]],
      ['version', [0, 1, THROTTLE]],
      ['truncated', [v]],
      ['truncated', [v, 2, THROTTLE]], // one tick of two
      ['truncated', [v, 0x80]], // the tick count's varint stops
      ['truncated', [v, 20, THROTTLE | (7 << 5)]], // a long run without its length
      ['trailing', [v, 1, THROTTLE, LEFT]],
      ['trailing', [v, 0, THROTTLE]],
      ['tickCount', [v, 2, THROTTLE | (2 << 5)]], // three ticks for two
      ['tickCount', [v, 8, THROTTLE | (7 << 5), 1]],
      ['code', [v, 1, STEER_BITS_UNUSED]],
      ['notCanonical', [v, 2, THROTTLE, THROTTLE]], // one run written as two
      ['notCanonical', [v, 0x81, 0x00, THROTTLE]], // tick count 1 as two varint bytes
      ['notCanonical', [v, 9, THROTTLE | (7 << 5), 0x81, 0x00]], // run length as two varint bytes
      ['tooLong', [v, 0xff, 0xff, 0xff, 0x0f, THROTTLE]], // claims 4 billion ticks
      ['tooLong', [v, 0xa0, 0x99, 0x02, THROTTLE]], // MAX_RUN_TICKS + 1
    ];
    expect(MAX_RUN_TICKS + 1).toBe(0x20 + (0x19 << 7) + (0x02 << 14));
    for (const [expected, bytes] of cases) expect(fault(decodeLog(new Uint8Array(bytes))), bytes.join(',')).toBe(expected);
    expect(fault(decodeLog(new Uint8Array(MAX_LOG_BYTES + 1)))).toBe('tooLong');
  });

  it('has no way to write a run of zero ticks: a short run is 1 to 7, a long one at least 8', () => {
    expect(ok(decodeLog(new Uint8Array([INPUT_LOG_VERSION, 1, THROTTLE])))).toEqual(new Uint8Array([THROTTLE]));
    expect(ok(decodeLog(new Uint8Array([INPUT_LOG_VERSION, 8, THROTTLE | (7 << 5), 0]))).length).toBe(8);
    expect(fault(decodeLog(new Uint8Array([INPUT_LOG_VERSION, 7, THROTTLE | (7 << 5), 0])))).toBe('tickCount');
  });

  it('never throws, hangs or accepts a second encoding on random and mutated bytes', () => {
    const random = createRandom(29);
    const valid = Array.from({ length: 50 }, () => encodeLog(randomLog(random, 2000)));
    for (let i = 0; i < 4000; i++) {
      let bytes: Uint8Array;
      if (i % 2 === 0) {
        bytes = new Uint8Array(Math.floor(random() * 40)).map(() => Math.floor(random() * 256));
        if (bytes.length > 0 && random() < 0.7) bytes[0] = INPUT_LOG_VERSION;
      } else {
        const source = [...valid[i % valid.length]];
        const at = Math.floor(random() * source.length);
        const kind = Math.floor(random() * 4);
        if (kind === 0) source[at] = Math.floor(random() * 256);
        else if (kind === 1) source.splice(at, 1);
        else if (kind === 2) source.splice(at, 0, Math.floor(random() * 256));
        else source.length = at;
        bytes = new Uint8Array(source);
      }
      const result = decodeLog(bytes);
      if (!result.ok) continue;
      expect(result.log.length).toBeLessThanOrEqual(MAX_RUN_TICKS);
      expect(encodeLog(result.log)).toEqual(bytes);
    }
  });
});

describe('input log text', () => {
  it('is base64url without padding', () => {
    const random = createRandom(5);
    for (let length = 0; length < 50; length++) {
      const bytes = new Uint8Array(length).map(() => Math.floor(random() * 256));
      const base64 = btoa(String.fromCharCode(...bytes));
      expect(toBase64Url(bytes)).toBe(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    }
  });

  it('rejects other characters, padding, impossible lengths, unused bits and anything too long', () => {
    const text = encodeLogText(new Uint8Array([THROTTLE, LEFT]));
    expect(ok(decodeLogText(text))).toEqual(new Uint8Array([THROTTLE, LEFT]));
    expect(text.length % 4).not.toBe(0);
    for (const bad of [`${text}=`, text.replace('A', '+'), `${text} `, `${text}A`, `${text}AA`]) {
      expect(decodeLogText(bad).ok, bad).toBe(false);
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lowBitSet = alphabet[alphabet.indexOf(text[text.length - 1]) ^ 1];
    expect(decodeLogText(text.slice(0, -1) + lowBitSet).ok).toBe(false);
    expect(fault(decodeLogText('A'.repeat(MAX_LOG_TEXT + 4)))).toBe('tooLong');
  });

  it('never throws on random or mutated text', () => {
    const random = createRandom(31);
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_+/= ';
    const valid = Array.from({ length: 20 }, () => encodeLogText(randomLog(random, 500)));
    for (let i = 0; i < 2000; i++) {
      const source = [...valid[i % valid.length]];
      const at = Math.floor(random() * source.length);
      source[at] = characters[Math.floor(random() * characters.length)];
      if (random() < 0.3) source.length = at;
      const text = source.join('');
      const result = decodeLogText(text);
      if (result.ok) expect(encodeLogText(result.log)).toBe(text);
    }
  });
});
