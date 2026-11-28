import { describe, expect, it } from 'vitest';
import { CAP_PERCENTILE, RESULT_BUCKETS, TOP_ROWS } from '../app/dailyResults';
import { NICKNAME_MAX, NICKNAME_MIN, validNickname } from '../app/settings';
import { MAX_LOG_TEXT, MAX_RUN_TICKS } from './inputLog';

const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const sql = Object.keys(migrations)
  .sort()
  .map((path) => migrations[path])
  .join('\n');

function bounds(pattern: RegExp): number[] {
  const match = pattern.exec(sql);
  if (!match) throw new Error(`migration has no ${pattern}`);
  return [Number(match[1]), Number(match[2])];
}

describe('database rules copied from the game', () => {
  it('ticks run from 1 to MAX_RUN_TICKS', () => {
    expect(bounds(/ticks integer not null check \(ticks between (\d+) and (\d+)\)/)).toEqual([1, MAX_RUN_TICKS]);
  });

  it('log text runs from 1 to MAX_LOG_TEXT characters', () => {
    expect(bounds(/char_length\(log\) between (\d+) and (\d+)/)).toEqual([1, MAX_LOG_TEXT]);
  });

  it('nickname length matches validNickname', () => {
    expect(bounds(/char_length\(nickname\) between (\d+) and (\d+)/)).toEqual([NICKNAME_MIN, NICKNAME_MAX]);
  });

  it('nickname characters match validNickname', () => {
    const match = /nickname ~ '([^']+)'/.exec(sql);
    if (!match) throw new Error('migration has no nickname pattern');
    const pattern = new RegExp(match[1]);
    const samples = [
      'abc', 'A b 1', 'abcdefghijkl', 'abcdefghijklm', 'ab', ' abc', 'abc ', 'a  b', 'a_b', 'zoë',
      'abc\n', 'ab\tc', 'abc٣', 'ａbc', 'abcß', '',
    ];
    for (const text of samples) {
      const inDatabase = text.length >= NICKNAME_MIN && text.length <= NICKNAME_MAX && pattern.test(text);
      expect(inDatabase, JSON.stringify(text)).toBe(validNickname(text));
    }
  });

  it('daily_results constants match dailyResults.ts', () => {
    const constant = (name: string) => {
      const match = new RegExp(`${name} constant integer := (\\d+);`).exec(sql);
      if (!match) throw new Error(`migration has no constant ${name}`);
      return Number(match[1]);
    };
    expect(constant('top_rows')).toBe(TOP_ROWS);
    expect(constant('buckets')).toBe(RESULT_BUCKETS);
    expect(constant('cap_percentile')).toBe(CAP_PERCENTILE);
  });
});
