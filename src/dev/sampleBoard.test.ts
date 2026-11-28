import { describe, expect, it } from 'vitest';
import { parseDailyResults } from '../app/dailyResults.ts';
import { validNickname } from '../app/nickname.ts';
import { sampleBoard } from './sampleBoard.ts';

describe('sample board', () => {
  it('answers as daily_results would, with the player among the runs when given', () => {
    for (const [players, own] of [[0, null], [1, 4900], [3, 4900], [300, 4900], [300, 3420], [300, null], [5000, 6000]] as const) {
      const board = sampleBoard(329, players, own, 'anon');
      expect(parseDailyResults(JSON.parse(JSON.stringify(board)))).toEqual(board);
      expect(board.count).toBe(players);
      expect(board.own?.ticks ?? null).toBe(own);
    }
    expect(sampleBoard(329, 300, 3420, 'anon').own?.rank).toBe(1);
    expect(() => sampleBoard(329, 0, 4900, 'anon')).toThrow();
  });

  it('is the same every time and has valid made-up nicknames', () => {
    expect(sampleBoard(329, 300, 4900, 'anon')).toEqual(sampleBoard(329, 300, 4900, 'anon'));
    expect(sampleBoard(329, 300, null, 'anon')).not.toEqual(sampleBoard(330, 300, null, 'anon'));
    for (let day = 0; day < 50; day++) {
      for (const { nickname } of sampleBoard(day, 10, null, 'anon').top) expect(validNickname(nickname), nickname).toBe(true);
    }
  });
});
