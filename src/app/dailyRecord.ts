import { DAILY_EPOCH, MS_PER_DAY } from '../game/daily.ts';
import { decodeLogText, MAX_LOG_TEXT, MAX_RUN_TICKS } from '../game/inputLog.ts';
import { SIMULATION_VERSION } from '../game/version.ts';
import type { SettingsStorage } from './settings.ts';

// The daily's one try, kept in the browser: only the latest day's. Parsing and the rules are pure; loading and saving
// only touch the storage they are given and never throw, so without storage the try lives in memory only.

export const DAILY_KEY = 'ascii-racer-daily';
export const DAILY_STATUSES = ['started', 'finished', 'didNotFinish'] as const;
export type DailyStatus = (typeof DAILY_STATUSES)[number];

export interface DailyRecord {
  day: number;
  status: DailyStatus; // started: the countdown began and nothing came of it yet
  ticks: number | null; // the race time, when finished
  log: string | null; // the packed input log as text, when finished, for sending later
  version: number | null; // the SIMULATION_VERSION it was driven with, null when unreadable
  sent: DailySent | null; // what the server made of the finished run; null: not sent yet, or nothing to send
}

// The server's answer to a finished run, once it is final: stored with the server's time, or refused for good with
// the reason it gave (versionMismatch, tooLate, badLog...).
export type DailySent = { status: 'stored'; ticks: number } | { status: 'refused'; reason: string };
const REASON = /^[A-Za-z]{1,40}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

// The stored log, if it is one this many ticks long.
function logText(value: unknown, ticks: number): string | null {
  if (typeof value !== 'string' || value.length > MAX_LOG_TEXT) return null;
  const decoded = decodeLogText(value);
  return decoded.ok && decoded.log.length === ticks ? value : null;
}

function sentOf(value: unknown): DailySent | null {
  const fields = record(value);
  if (fields?.status === 'stored') {
    const ticks = wholeNumber(fields.ticks, 1, MAX_RUN_TICKS);
    return ticks === null ? null : { status: 'stored', ticks };
  }
  if (fields?.status === 'refused' && typeof fields.reason === 'string' && REASON.test(fields.reason)) {
    return { status: 'refused', reason: fields.reason };
  }
  return null;
}

// Null when there is nothing usable: no day or no status means no try is known, so the day's try is open. A finished
// try without a valid time stays used but did not finish; a bad log or version is dropped on its own.
export function parseDailyRecord(text: string | null): DailyRecord | null {
  let stored: unknown = null;
  try {
    stored = text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
  const fields = record(stored);
  if (!fields) return null;
  const day = wholeNumber(fields.day, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const status = DAILY_STATUSES.find((name) => name === fields.status);
  if (day === null || !status) return null;
  const version = wholeNumber(fields.version, 1, Number.MAX_SAFE_INTEGER);
  const ticks = status === 'finished' ? wholeNumber(fields.ticks, 1, MAX_RUN_TICKS) : null;
  if (status === 'finished' && ticks === null) return { day, status: 'didNotFinish', ticks: null, log: null, version, sent: null };
  const sent = ticks === null ? null : sentOf(fields.sent);
  return { day, status, ticks, log: ticks === null ? null : logText(fields.log, ticks), version, sent };
}

export function serialiseDailyRecord(record: DailyRecord): string {
  return JSON.stringify(record);
}

// Written before the countdown's first tick: from here on the try is used.
export function startedRecord(day: number): DailyRecord {
  return { day, status: 'started', ticks: null, log: null, version: SIMULATION_VERSION, sent: null };
}

export function finishedRecord(day: number, ticks: number, log: string): DailyRecord {
  return { day, status: 'finished', ticks, log, version: SIMULATION_VERSION, sent: null };
}

export function didNotFinishRecord(day: number): DailyRecord {
  return { day, status: 'didNotFinish', ticks: null, log: null, version: SIMULATION_VERSION, sent: null };
}

// A try that started and never finished (tab closed, reload, crash) did not finish.
export function settleRecord(record: DailyRecord | null): DailyRecord | null {
  return record?.status === 'started' ? { ...record, status: 'didNotFinish' } : record;
}

const STATUS_RANK: Record<DailyStatus, number> = { started: 0, didNotFinish: 1, finished: 2 };

// The one that says more: the later day, on the same day the further status, then the one with the server's answer.
// For the record in memory against the stored one, which another tab may have changed or which may be gone.
export function newerRecord(a: DailyRecord | null, b: DailyRecord | null): DailyRecord | null {
  if (!a || !b) return a ?? b;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  if (a.status !== b.status) return STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a;
  return b.sent && !a.sent && b.ticks === a.ticks && b.log === a.log ? b : a;
}

// The time the results show: the server's once it stored the run, else the browser's.
export function recordTicks(record: DailyRecord): number | null {
  if (record.status !== 'finished') return null;
  return record.sent?.status === 'stored' ? record.sent.ticks : record.ticks;
}

export type DailyTry = { day: number; used: false } | { day: number; used: true; ticks: number | null }; // ticks null: did not finish

// A clock briefly ahead or a time zone slip is at most this many days; a record further ahead than that is unreadable.
export const MAX_DAYS_AHEAD = 1;

// Null for a record further ahead of the clock than MAX_DAYS_AHEAD: the day's try is open and the next write
// replaces it.
export function readableRecord(record: DailyRecord | null, today: number): DailyRecord | null {
  return record && record.day > today + MAX_DAYS_AHEAD ? null : record;
}

// The try for the day the clock says. A record of an earlier day is history, so today's is open. A record of today,
// or of the next day when the clock was set back, is a used try, whatever simulation version it was driven with; the
// next day stays the one shown, so nothing stored is overwritten and no day gets a second try.
export function dailyTry(record: DailyRecord | null, today: number): DailyTry {
  const known = readableRecord(record, today);
  if (!known || known.day < today) return { day: today, used: false };
  return { day: known.day, used: true, ticks: recordTicks(known) };
}

// What storage holds after writing `next` over `stored` (read just before): `next` only if newerRecord picks it, so
// never an older day over a newer one, a lower status over a higher one, or a second finish over the first.
export function mergeForStore(stored: DailyRecord | null, next: DailyRecord, today: number): DailyRecord {
  const current = readableRecord(stored, today);
  return current && newerRecord(current, next) !== next ? current : next;
}

// Milliseconds from `now` to the start (00:00 UTC) of `day`.
export function millisecondsToDay(day: number, now: number): number {
  return DAILY_EPOCH + day * MS_PER_DAY - now;
}

// `storage` is a getter because even reaching window.localStorage can throw.
export function loadDailyRecord(storage: () => SettingsStorage): DailyRecord | null {
  try {
    return parseDailyRecord(storage().getItem(DAILY_KEY));
  } catch {
    return null;
  }
}

// False when it could not be written: the try then lives in memory only, until the page is closed.
export function saveDailyRecord(storage: () => SettingsStorage, record: DailyRecord): boolean {
  try {
    storage().setItem(DAILY_KEY, serialiseDailyRecord(record));
    return true;
  } catch {
    return false;
  }
}
