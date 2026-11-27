import type { CarInput } from './carInput.ts';
import { TICKS_PER_SECOND } from './clock.ts';

// A race's inputs, one per tick from the go tick to the tick the finish is crossed in, as the keyboard makes them:
// throttle, brake and drift 0 or 1, steer -1, 0 or 1. Each tick is a 5-bit code (bit 0 throttle, 1 brake, 2-3
// steer + 1, 4 drift; steer bits 3 are no input). Packed: a version byte, the tick count as a varint, then runs of
// one code: a byte of code | (short << 5), the run 1 to 7 ticks long when short is 0 to 6, at least 8 when short is
// 7, then a varint of the length - 8. Varints are LEB128, shortest form; neighbouring runs have different codes;
// nothing follows the last run. So every log has exactly one packed form.

export const INPUT_LOG_VERSION = 1;
export const MAX_RUN_TICKS = 10 * 60 * TICKS_PER_SECOND - 1; // the race timer's 9:59.983

// One input code per tick.
export type InputLog = Uint8Array;

const STEER_SHIFT = 2;
const DRIFT_BIT = 16;
const CODE_BITS = 5;
const CODE_MASK = (1 << CODE_BITS) - 1;
const LONG_RUN = 7; // the short field's value for a run of LONG_RUN + 1 or more
const INVALID_STEER = 3;
const VARINT_MAX_BYTES = 3; // enough for any count up to MAX_RUN_TICKS

function varintSize(value: number): number {
  let size = 1;
  while (value >= 0x80) {
    value = Math.floor(value / 0x80);
    size++;
  }
  return size;
}

// A run of 1 is one byte, a longer run never more bytes than ticks.
export const MAX_LOG_BYTES = 1 + varintSize(MAX_RUN_TICKS) + MAX_RUN_TICKS;
export const MAX_LOG_TEXT = Math.ceil((MAX_LOG_BYTES * 4) / 3);

export type InputLogFault =
  | 'empty'
  | 'tooLong'
  | 'version'
  | 'truncated'
  | 'trailing'
  | 'tickCount'
  | 'code'
  | 'notCanonical'
  | 'text'
  | 'notKeyboardInput';

export class InputLogError extends Error {
  readonly fault: InputLogFault;

  constructor(fault: InputLogFault) {
    super(`Input log: ${fault}`);
    this.fault = fault;
  }
}

export type DecodedLog = { ok: true; log: InputLog } | { ok: false; fault: InputLogFault };

export function isInputCode(code: number): boolean {
  return Number.isInteger(code) && code >= 0 && code <= CODE_MASK && ((code >> STEER_SHIFT) & 3) !== INVALID_STEER;
}

function bit(value: number): number {
  if (value !== 0 && value !== 1) throw new InputLogError('notKeyboardInput');
  return value;
}

// Throws for an input the keyboard can't make (an analogue value).
export function inputCode({ throttle, brake, steer, drift }: CarInput): number {
  if ((steer !== -1 && steer !== 0 && steer !== 1) || Object.is(steer, -0)) throw new InputLogError('notKeyboardInput');
  return bit(throttle) | (bit(brake) << 1) | ((steer + 1) << STEER_SHIFT) | (bit(drift) ? DRIFT_BIT : 0);
}

const INPUTS: readonly (CarInput | null)[] = Array.from({ length: CODE_MASK + 1 }, (_, code) =>
  isInputCode(code)
    ? Object.freeze({ throttle: code & 1, brake: (code >> 1) & 1, steer: ((code >> STEER_SHIFT) & 3) - 1, drift: code & DRIFT_BIT ? 1 : 0 })
    : null,
);

export function codeInput(code: number): CarInput {
  const input = INPUTS[code];
  if (!input) throw new InputLogError('code');
  return input;
}

// Keeps a race's inputs as one byte per tick, up to MAX_RUN_TICKS; `overflowed` once more were given.
export class InputRecorder {
  private codes = new Uint8Array(TICKS_PER_SECOND * 60);
  private length = 0;
  overflowed = false;

  get ticks(): number {
    return this.length;
  }

  record(input: CarInput): void {
    const code = inputCode(input);
    if (this.length === MAX_RUN_TICKS) {
      this.overflowed = true;
      return;
    }
    if (this.length === this.codes.length) {
      const grown = new Uint8Array(Math.min(MAX_RUN_TICKS, this.codes.length * 2));
      grown.set(this.codes);
      this.codes = grown;
    }
    this.codes[this.length++] = code;
  }

  log(): InputLog {
    return this.codes.slice(0, this.length);
  }

  reset(): void {
    this.length = 0;
    this.overflowed = false;
  }
}

// Throws an InputLogError unless every code is an input and the log is no longer than a run may be.
export function checkLog(log: InputLog): void {
  if (log.length > MAX_RUN_TICKS) throw new InputLogError('tooLong');
  for (const code of log) if (!isInputCode(code)) throw new InputLogError('code');
}

class Writer {
  readonly bytes = new Uint8Array(MAX_LOG_BYTES);
  length = 0;

  byte(value: number): void {
    this.bytes[this.length++] = value;
  }

  varint(value: number): void {
    while (value >= 0x80) {
      this.byte((value & 0x7f) | 0x80);
      value = Math.floor(value / 0x80);
    }
    this.byte(value);
  }
}

export function encodeLog(log: InputLog): Uint8Array {
  checkLog(log);
  const writer = new Writer();
  writer.byte(INPUT_LOG_VERSION);
  writer.varint(log.length);
  for (let start = 0; start < log.length; ) {
    const code = log[start];
    let end = start + 1;
    while (end < log.length && log[end] === code) end++;
    const run = end - start;
    if (run <= LONG_RUN) writer.byte(code | ((run - 1) << CODE_BITS));
    else {
      writer.byte(code | (LONG_RUN << CODE_BITS));
      writer.varint(run - LONG_RUN - 1);
    }
    start = end;
  }
  return writer.bytes.slice(0, writer.length);
}

class Reader {
  offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) throw new InputLogError('truncated');
    return this.bytes[this.offset++];
  }

  // Shortest form only, at most VARINT_MAX_BYTES long.
  varint(): number {
    let value = 0;
    for (let i = 0; i < VARINT_MAX_BYTES; i++) {
      const byte = this.byte();
      value += (byte & 0x7f) * 2 ** (7 * i);
      if (byte < 0x80) {
        if (i > 0 && byte === 0) throw new InputLogError('notCanonical');
        return value;
      }
    }
    throw new InputLogError('tooLong');
  }
}

function decode(bytes: Uint8Array): InputLog {
  if (bytes.length === 0) throw new InputLogError('empty');
  if (bytes.length > MAX_LOG_BYTES) throw new InputLogError('tooLong');
  const reader = new Reader(bytes);
  if (reader.byte() !== INPUT_LOG_VERSION) throw new InputLogError('version');
  const ticks = reader.varint();
  if (ticks > MAX_RUN_TICKS) throw new InputLogError('tooLong');
  const log = new Uint8Array(ticks);
  let filled = 0;
  let previous = -1;
  while (filled < ticks) {
    const byte = reader.byte();
    const code = byte & CODE_MASK;
    const short = byte >> CODE_BITS;
    if (!isInputCode(code)) throw new InputLogError('code');
    if (code === previous) throw new InputLogError('notCanonical');
    let run = short + 1;
    if (short === LONG_RUN) {
      const extra = reader.varint();
      run = LONG_RUN + 1 + extra;
    }
    if (run > ticks - filled) throw new InputLogError('tickCount');
    log.fill(code, filled, filled + run);
    filled += run;
    previous = code;
  }
  if (!reader.done) throw new InputLogError('trailing');
  return log;
}

// Safe on any bytes: rejects instead of throwing, and never allocates more than MAX_RUN_TICKS ticks.
export function decodeLog(bytes: Uint8Array): DecodedLog {
  try {
    return { ok: true, log: decode(bytes) };
  } catch (error) {
    if (error instanceof InputLogError) return { ok: false, fault: error.fault };
    throw error;
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALPHABET_INDEX = new Map([...ALPHABET].map((character, index) => [character.charCodeAt(0), index]));

// Base64url without padding.
export function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    const characters = Math.min(4, Math.ceil(((bytes.length - i) * 4) / 3));
    for (let k = 0; k < characters; k++) text += ALPHABET[(triple >> (18 - 6 * k)) & 63];
  }
  return text;
}

// Only the canonical form: no padding, no other characters, unused low bits zero.
function fromBase64Url(text: string, maxBytes: number): Uint8Array {
  if (text.length % 4 === 1) throw new InputLogError('text');
  const size = Math.floor((text.length * 3) / 4);
  if (size > maxBytes) throw new InputLogError('tooLong');
  const bytes = new Uint8Array(size);
  let bits = 0;
  let count = 0;
  let out = 0;
  for (let i = 0; i < text.length; i++) {
    const value = ALPHABET_INDEX.get(text.charCodeAt(i));
    if (value === undefined) throw new InputLogError('text');
    bits = ((bits << 6) | value) & 0xffffff;
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes[out++] = (bits >> count) & 0xff;
    }
  }
  if ((bits & ((1 << count) - 1)) !== 0) throw new InputLogError('text');
  return bytes;
}

export function encodeLogText(log: InputLog): string {
  return toBase64Url(encodeLog(log));
}

export function decodeLogText(text: string): DecodedLog {
  if (text.length > MAX_LOG_TEXT) return { ok: false, fault: 'tooLong' };
  try {
    return decodeLog(fromBase64Url(text, MAX_LOG_BYTES));
  } catch (error) {
    if (error instanceof InputLogError) return { ok: false, fault: error.fault };
    throw error;
  }
}
