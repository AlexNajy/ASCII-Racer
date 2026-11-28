import {
  DAILY_EPOCH,
  dayNumber,
  decodeLogText,
  MAX_LOG_TEXT,
  MS_PER_DAY,
  replayDaily,
  SIMULATION_VERSION,
  validNickname,
} from './game.ts';

// What the functions do, without HTTP or a database: functions of the request body, the verified user id, the
// server's clock and a store. The checks run cheapest first.

export const DAY_GRACE_MS = 5 * 60 * 1000; // after 00:00 UTC yesterday's daily can still be started
export const SUBMIT_DAYS_AFTER = 1; // a run can be submitted on its day and this many days after
const BODY_SLACK = 1024; // bytes for everything in a submit besides the log
export const START_BODY_MAX = BODY_SLACK;
export const SUBMIT_BODY_MAX = MAX_LOG_TEXT + BODY_SLACK;

export interface Reply {
  code: number;
  body: Record<string, unknown>;
}

export interface StoredRun {
  userId: string;
  day: number;
  ticks: number;
  nickname: string;
  version: number;
  log: string;
}

export interface Store {
  startAttempt(userId: string, day: number): Promise<boolean>; // true when the attempt is new
  hasAttempt(userId: string, day: number): Promise<boolean>;
  runTicks(userId: string, day: number): Promise<number | null>;
  // Run and log together; when a run for that try is there already nothing changes and its ticks come back.
  storeRun(run: StoredRun): Promise<{ stored: boolean; ticks: number }>;
}

const OK = 200;
const MALFORMED = 400;
const CONFLICT = 409; // the request doesn't fit the server's state: version, day, attempt
const UNPROCESSABLE = 422; // the run itself is refused: nickname, log, replay

function refuse(code: number, error: string, extra: Record<string, unknown> = {}): Reply {
  return { code, body: { error, ...extra } };
}

const MALFORMED_REPLY = refuse(MALFORMED, 'malformed');

function field(body: unknown, name: string): unknown {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

function wholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function dayStart(day: number): number {
  return DAILY_EPOCH + day * MS_PER_DAY;
}

// Today's daily, or yesterday's within DAY_GRACE_MS after midnight.
export function attemptDayRefusal(day: number, nowMs: number): 'dayOver' | 'dayNotOpen' | null {
  const today = dayNumber(nowMs);
  if (day > today) return 'dayNotOpen';
  if (day === today || (day === today - 1 && nowMs - dayStart(today) < DAY_GRACE_MS)) return null;
  return 'dayOver';
}

export function submitDayRefusal(day: number, nowMs: number): 'tooLate' | 'dayNotOpen' | null {
  const today = dayNumber(nowMs);
  if (day > today) return 'dayNotOpen';
  return today - day > SUBMIT_DAYS_AFTER ? 'tooLate' : null;
}

export async function startAttempt(body: unknown, userId: string, nowMs: number, store: Store): Promise<Reply> {
  const day = field(body, 'day');
  if (!wholeNumber(day)) return MALFORMED_REPLY;
  const refusal = attemptDayRefusal(day, nowMs);
  if (refusal) return refuse(CONFLICT, refusal);
  const isNew = await store.startAttempt(userId, day);
  return { code: OK, body: { status: isNew ? 'started' : 'alreadyStarted' } };
}

export async function submitRun(body: unknown, userId: string, nowMs: number, store: Store): Promise<Reply> {
  const day = field(body, 'day');
  const log = field(body, 'log');
  const nickname = field(body, 'nickname');
  const version = field(body, 'version');
  if (!wholeNumber(day) || typeof log !== 'string' || typeof nickname !== 'string' || !wholeNumber(version)) {
    return MALFORMED_REPLY;
  }
  if (version !== SIMULATION_VERSION) return refuse(CONFLICT, 'versionMismatch', { version: SIMULATION_VERSION });
  if (!validNickname(nickname)) return refuse(UNPROCESSABLE, 'invalidNickname');
  const dayRefusal = submitDayRefusal(day, nowMs);
  if (dayRefusal) return refuse(CONFLICT, dayRefusal);
  if (!(await store.hasAttempt(userId, day))) return refuse(CONFLICT, 'noAttempt');
  const storedTicks = await store.runTicks(userId, day);
  if (storedTicks !== null) return { code: OK, body: { status: 'alreadyStored', ticks: storedTicks } };

  const decoded = decodeLogText(log);
  if (!decoded.ok) return refuse(UNPROCESSABLE, 'badLog', { fault: decoded.fault });
  const result = replayDaily(day, decoded.log);
  if (!result.finished) return refuse(UNPROCESSABLE, result.reason);

  const stored = await store.storeRun({ userId, day, ticks: result.ticks, nickname, version, log });
  return { code: OK, body: { status: stored.stored ? 'stored' : 'alreadyStored', ticks: stored.ticks } };
}
