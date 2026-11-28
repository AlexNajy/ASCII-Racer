import { describe, expect, it } from 'vitest';
import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, normaliseLobbyCode, randomLobbyCode, validLobbyCode } from './lobbyCode.ts';

describe('lobby code', () => {
  it('has no look-alikes and no repeats in its alphabet', () => {
    for (const char of '0O1IL') expect(LOBBY_CODE_ALPHABET).not.toContain(char);
    expect(new Set(LOBBY_CODE_ALPHABET).size).toBe(LOBBY_CODE_ALPHABET.length);
  });

  it('is made of alphabet characters, from the given source', () => {
    let state = 7;
    const random = () => ((state = (state * 48271) % 2147483647) / 2147483647);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = randomLobbyCode(random);
      expect(code).toHaveLength(LOBBY_CODE_LENGTH);
      expect(validLobbyCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(190);
    expect(randomLobbyCode(() => 0)).toBe(LOBBY_CODE_ALPHABET[0].repeat(LOBBY_CODE_LENGTH));
    expect(randomLobbyCode(() => 0.9999999)).toBe(LOBBY_CODE_ALPHABET.at(-1)!.repeat(LOBBY_CODE_LENGTH));
  });

  it('survives a bad source', () => {
    for (const bad of [NaN, -1, 2, Infinity]) expect(validLobbyCode(randomLobbyCode(() => bad))).toBe(true);
  });

  it('normalises typed codes', () => {
    expect(normaliseLobbyCode('abc234')).toBe('ABC234');
    expect(normaliseLobbyCode(' abc-234 ')).toBe('ABC234');
    expect(normaliseLobbyCode('AB C2 34')).toBe('ABC234');
    expect(normaliseLobbyCode('ABC23')).toBeNull();
    expect(normaliseLobbyCode('ABC2345')).toBeNull();
    expect(normaliseLobbyCode('ABCO23')).toBeNull();
    expect(normaliseLobbyCode('ABC123')).toBeNull();
    expect(normaliseLobbyCode('')).toBeNull();
    expect(normaliseLobbyCode('ABC23é')).toBeNull();
  });
});
