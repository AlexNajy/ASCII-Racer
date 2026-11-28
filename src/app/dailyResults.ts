// What the database function daily_results answers (supabase/migrations/*_daily_results.sql), checked as untrusted input.

import { MAX_RUN_TICKS } from '../game/inputLog.ts';
import { validNickname } from './nickname.ts';

// Copies of the constants in daily_results; backendRules.test.ts keeps them equal.
export const TOP_ROWS = 10;
export const RESULT_BUCKETS = 48;
export const CAP_PERCENTILE = 95;

export interface OwnResult {
  ticks: number;
  rank: number; // 1 + runs strictly faster
  slower: number; // runs strictly slower
}

export interface TopRow {
  rank: number;
  nickname: string;
  ticks: number;
  own: boolean;
}

export interface Histogram {
  from: number; // the fastest time
  to: number; // the cap; slower runs are in the last bucket
  counts: number[]; // RESULT_BUCKETS of them, summing to count
}

export interface DailyResults {
  count: number;
  own: OwnResult | null; // no run of the caller's that day
  top: TopRow[];
  histogram: Histogram | null; // null exactly when count is 0
}

type Fields = Record<string, unknown>;

function object(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function ticks(value: unknown): value is number {
  return integer(value, 1, MAX_RUN_TICKS);
}

// The histogram bucket of `t` (from <= t), as daily_results counts it.
export function bucketOf(histogram: Histogram, t: number): number {
  return Math.min(RESULT_BUCKETS - 1, Math.floor(((t - histogram.from) * RESULT_BUCKETS) / (histogram.to - histogram.from)));
}

function parseOwn(value: unknown, count: number): OwnResult | null {
  const fields = object(value);
  if (!fields) return null;
  const { ticks: t, rank, slower } = fields;
  if (!ticks(t) || !integer(rank, 1, count) || !integer(slower, 0, count - rank)) return null;
  return { ticks: t, rank, slower };
}

function parseTop(value: unknown, count: number): TopRow[] | null {
  if (!Array.isArray(value) || value.length !== Math.min(count, TOP_ROWS)) return null;
  const rows: TopRow[] = [];
  for (const [index, item] of value.entries()) {
    const fields = object(item);
    if (!fields) return null;
    const { rank, nickname, ticks: t, own } = fields;
    if (!ticks(t) || typeof nickname !== 'string' || !validNickname(nickname) || typeof own !== 'boolean') return null;
    const previous = rows[index - 1];
    if (previous && t < previous.ticks) return null;
    // The first rows in order: a tie keeps the rank above it, anything else is its place.
    const expected = previous && t === previous.ticks ? previous.rank : index + 1;
    if (rank !== expected) return null;
    rows.push({ rank, nickname, ticks: t, own });
  }
  if (rows.filter((row) => row.own).length > 1) return null;
  return rows;
}

function parseHistogram(value: unknown, count: number): Histogram | null {
  const fields = object(value);
  if (!fields) return null;
  const { from, to, counts } = fields;
  if (!ticks(from) || !integer(to, from + RESULT_BUCKETS, MAX_RUN_TICKS + RESULT_BUCKETS)) return null;
  if (!Array.isArray(counts) || counts.length !== RESULT_BUCKETS) return null;
  let sum = 0;
  for (const n of counts) {
    if (!integer(n, 0, count)) return null;
    sum += n;
  }
  if (sum !== count || counts[0] === 0) return null;
  return { from, to, counts: counts.slice() };
}

// Unknown fields are ignored; anything missing, of the wrong type, out of range or inconsistent gives null.
export function parseDailyResults(json: unknown): DailyResults | null {
  const fields = object(json);
  if (!fields || !integer(fields.count, 0, Number.MAX_SAFE_INTEGER)) return null;
  const count = fields.count;
  const own = fields.own === null ? null : parseOwn(fields.own, count);
  if (own === null && fields.own !== null) return null;
  const top = parseTop(fields.top, count);
  if (!top) return null;
  if (count === 0) {
    return fields.histogram === null && own === null ? { count, own, top, histogram: null } : null;
  }
  const histogram = parseHistogram(fields.histogram, count);
  if (!histogram) return null;
  if (top[0].ticks !== histogram.from) return null;
  const ownRow = top.find((row) => row.own);
  if (ownRow && (!own || ownRow.ticks !== own.ticks || ownRow.rank !== own.rank)) return null;
  if (own) {
    if (own.ticks < histogram.from || histogram.counts[bucketOf(histogram, own.ticks)] === 0) return null;
    if ((own.rank === 1) !== (own.ticks === histogram.from)) return null;
  }
  return { count, own, top, histogram };
}

// Whole percent of the other players the caller was faster than, rounded down; null without an own run or anyone else.
export function percentFaster(results: DailyResults): number | null {
  if (!results.own || results.count < 2) return null;
  return Math.floor((results.own.slower * 100) / (results.count - 1));
}

export function ownBucket(results: DailyResults): number | null {
  if (!results.own || !results.histogram) return null;
  return bucketOf(results.histogram, results.own.ticks);
}
