import { describe, expect, it } from 'vitest';
import { bucketOf, type DailyResults, ownBucket, parseDailyResults, percentFaster, RESULT_BUCKETS } from './dailyResults.ts';

function counts(filled: Record<number, number>): number[] {
  return Array.from({ length: RESULT_BUCKETS }, (_, i) => filled[i] ?? 0);
}

// The answer daily_results gives for day 20 in supabase/tests/daily_results.test.sql.
function sample(): Record<string, unknown> {
  return {
    count: 6,
    own: { ticks: 4500, rank: 4, slower: 2 },
    top: [
      { rank: 1, nickname: 'sea', ticks: 4000, own: false },
      { rank: 1, nickname: 'dee', ticks: 4000, own: false },
      { rank: 1, nickname: 'eee', ticks: 4000, own: false },
      { rank: 4, nickname: 'anon', ticks: 4500, own: true },
      { rank: 5, nickname: 'bee', ticks: 5000, own: false },
      { rank: 6, nickname: 'eff', ticks: 6000, own: false },
    ],
    histogram: { from: 4000, to: 6000, counts: counts({ 0: 3, 12: 1, 24: 1, 47: 1 }) },
  };
}

type Json = Record<string, unknown>;

function edit(change: (json: Json) => void): Json {
  const json = structuredClone(sample());
  change(json);
  return json;
}

function top(json: Json): Json[] {
  return json.top as Json[];
}

function histogram(json: Json): Json {
  return json.histogram as Json;
}

const EMPTY = { count: 0, own: null, top: [], histogram: null };

describe('parseDailyResults', () => {
  it('reads a valid answer', () => {
    const results = parseDailyResults(sample());
    expect(results).toEqual(sample());
  });

  it('reads a day with no runs', () => {
    expect(parseDailyResults(EMPTY)).toEqual(EMPTY);
  });

  it('reads an answer without an own run', () => {
    const json = edit((j) => {
      j.own = null;
      top(j)[3].own = false;
    });
    expect(parseDailyResults(json)?.own).toBeNull();
  });

  it('ignores unknown fields', () => {
    const json = edit((j) => {
      j.extra = 1;
      top(j)[0].more = 'x';
    });
    expect(parseDailyResults(json)).toEqual(sample());
  });

  it('reads one run, a top of ten from more runs, all equal times', () => {
    const one = {
      count: 1,
      own: { ticks: 5000, rank: 1, slower: 0 },
      top: [{ rank: 1, nickname: 'anon', ticks: 5000, own: true }],
      histogram: { from: 5000, to: 5048, counts: counts({ 0: 1 }) },
    };
    expect(parseDailyResults(one)).toEqual(one);
    const many = {
      count: 21,
      own: null,
      top: Array.from({ length: 10 }, () => ({ rank: 1, nickname: 'same', ticks: 7000, own: false })),
      histogram: { from: 7000, to: 7048, counts: counts({ 0: 21 }) },
    };
    expect(parseDailyResults(many)).toEqual(many);
  });

  const MALFORMED: [string, unknown][] = [
    ['null', null],
    ['a number', 5],
    ['a string', '{}'],
    ['an array', [sample()]],
    ['no count', edit((j) => delete j.count)],
    ['count a string', edit((j) => (j.count = '6'))],
    ['count fractional', edit((j) => (j.count = 6.5))],
    ['count negative', { ...EMPTY, count: -1 }],
    ['count does not match the counts', edit((j) => (j.count = 7))],
    ['no own key', edit((j) => delete j.own)],
    ['own not an object', edit((j) => (j.own = 4500))],
    ['own ticks zero', edit((j) => ((j.own as Json).ticks = 0))],
    ['own ticks past the cap', edit((j) => ((j.own as Json).ticks = 36000))],
    ['own rank zero', edit((j) => ((j.own as Json).rank = 0))],
    ['own rank past count', edit((j) => ((j.own as Json).rank = 7))],
    ['own rank plus slower past count', edit((j) => ((j.own as Json).slower = 3))],
    ['own missing slower', edit((j) => delete (j.own as Json).slower)],
    ['own differs from its top row', edit((j) => ((j.own as Json).rank = 3))],
    ['own row without own', edit((j) => (j.own = null))],
    ['own faster than the fastest', edit((j) => ((j.own as Json).ticks = 3999))],
    ['own in an empty bucket', edit((j) => {
      (j.own as Json).ticks = 4600;
      top(j)[3].ticks = 4600;
    })],
    ['own rank 1 but slower than the fastest', {
      count: 2,
      own: { ticks: 5100, rank: 1, slower: 0 },
      top: [
        { rank: 1, nickname: 'abc', ticks: 5000, own: false },
        { rank: 2, nickname: 'anon', ticks: 5100, own: true },
      ],
      histogram: { from: 5000, to: 5048, counts: counts({ 0: 1, 47: 1 }) },
    }],
    ['top not an array', edit((j) => (j.top = {}))],
    ['top too short', edit((j) => top(j).pop())],
    ['top longer than ten', {
      count: 11,
      own: null,
      top: Array.from({ length: 11 }, () => ({ rank: 1, nickname: 'same', ticks: 7000, own: false })),
      histogram: { from: 7000, to: 7048, counts: counts({ 0: 11 }) },
    }],
    ['top out of order', edit((j) => {
      top(j)[4].ticks = 6000;
      top(j)[5].ticks = 5000;
    })],
    ['top tie with another rank', edit((j) => (top(j)[1].rank = 2))],
    ['top rank skips', edit((j) => (top(j)[4].rank = 6))],
    ['top row not an object', edit((j) => ((j.top as unknown[])[2] = 'x'))],
    ['top nickname invalid', edit((j) => (top(j)[0].nickname = 'a'))],
    ['top nickname with double space', edit((j) => (top(j)[0].nickname = 'a  bc'))],
    ['top nickname not a string', edit((j) => (top(j)[0].nickname = 123))],
    ['top own not a boolean', edit((j) => (top(j)[0].own = 0))],
    ['two own rows', edit((j) => (top(j)[4].own = true))],
    ['top ticks a string', edit((j) => (top(j)[5].ticks = '6000'))],
    ['top first is not the fastest', edit((j) => (histogram(j).from = 3990))],
    ['top on an empty day', { ...EMPTY, top: [{ rank: 1, nickname: 'abc', ticks: 1, own: false }] }],
    ['own on an empty day', { ...EMPTY, own: { ticks: 1, rank: 1, slower: 0 } }],
    ['histogram on an empty day', { ...EMPTY, histogram: { from: 1, to: 49, counts: counts({}) } }],
    ['no histogram with runs', edit((j) => (j.histogram = null))],
    ['histogram not an object', edit((j) => (j.histogram = []))],
    ['histogram to too close', edit((j) => (histogram(j).to = 4047))],
    ['histogram from zero', edit((j) => (histogram(j).from = 0))],
    ['histogram counts too short', edit((j) => (histogram(j).counts as number[]).pop())],
    ['histogram counts too long', edit((j) => (histogram(j).counts as number[]).push(0))],
    ['histogram count negative', edit((j) => {
      const c = histogram(j).counts as number[];
      c[1] = -1;
      c[2] = 1;
    })],
    ['histogram count fractional', edit((j) => {
      const c = histogram(j).counts as number[];
      c[1] = 0.5;
      c[2] = 0.5;
      c[47] = 0;
    })],
    ['histogram count a string', edit((j) => ((histogram(j).counts as unknown[])[1] = '0'))],
    ['histogram bucket 0 empty', edit((j) => {
      const c = histogram(j).counts as number[];
      c[0] = 0;
      c[1] = 3;
    })],
  ];

  it.each(MALFORMED)('gives null for %s', (_, json) => {
    expect(parseDailyResults(json)).toBeNull();
  });

  it('never throws on odd values', () => {
    for (const json of [undefined, true, Symbol('x'), () => 1, new Date(), Object.create(null), { count: 1n }]) {
      expect(() => parseDailyResults(json)).not.toThrow();
      expect(parseDailyResults(json)).toBeNull();
    }
  });
});

describe('percentFaster', () => {
  const results = parseDailyResults(sample()) as DailyResults;

  it('counts the other players, rounded down', () => {
    expect(percentFaster(results)).toBe(40); // 2 of 5
    expect(percentFaster({ ...results, count: 4, own: { ticks: 4500, rank: 2, slower: 2 } })).toBe(66);
  });

  it('is 100 for the fastest and 0 for the slowest', () => {
    expect(percentFaster({ ...results, own: { ticks: 4000, rank: 1, slower: 3 }, count: 4 })).toBe(100);
    expect(percentFaster({ ...results, own: { ticks: 6000, rank: 6, slower: 0 } })).toBe(0);
  });

  it('is null without an own run or anyone else', () => {
    expect(percentFaster({ ...results, own: null })).toBeNull();
    expect(percentFaster({ ...results, count: 1, own: { ticks: 4000, rank: 1, slower: 0 } })).toBeNull();
  });
});

describe('ownBucket', () => {
  const results = parseDailyResults(sample()) as DailyResults;

  it('is the bucket the database counted the own run in', () => {
    expect(ownBucket(results)).toBe(12);
  });

  it('is null without an own run', () => {
    expect(ownBucket({ ...results, own: null })).toBeNull();
    expect(ownBucket(EMPTY)).toBeNull();
  });

  it('follows the formula of daily_results', () => {
    const h = { from: 4000, to: 6000, counts: counts({}) };
    expect([4000, 4041, 4042, 5000, 5999, 6000, 30000].map((t) => bucketOf(h, t))).toEqual([0, 0, 1, 24, 47, 47, 47]);
    const narrow = { from: 7000, to: 7048, counts: counts({}) };
    expect([7000, 7001, 7047, 7048, 9000].map((t) => bucketOf(narrow, t))).toEqual([0, 1, 47, 47, 47]);
  });
});
