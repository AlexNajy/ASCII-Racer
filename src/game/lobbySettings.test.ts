import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity } from './city.ts';
import {
  defaultLobbySettings,
  LOBBY_AVENUES,
  LOBBY_BLOCKS,
  LOBBY_DOWNTOWNS,
  LOBBY_ROUTE_LENGTHS,
  LOBBY_SEED_MAX,
  LOBBY_SIZES,
  lobbyCitySettings,
  lobbyRouteLength,
  parseLobbySettings,
  serialiseLobbySettings,
  type LobbySettings,
} from './lobbySettings.ts';
import { roadGraph } from './roadGraph.ts';
import { generateRoute, RouteError, ROUTE_LENGTHS } from './route.ts';
import { createWorld, stepWorld } from './world.ts';
import { DEFAULT_CAR_SETTINGS } from './car.ts';
import { dailyCitySettings } from './daily.ts';

describe('lobby settings', () => {
  it('maps the medium choices exactly onto the default city of the seed', () => {
    for (const seed of [1, 777, LOBBY_SEED_MAX]) {
      expect(lobbyCitySettings(defaultLobbySettings(seed))).toEqual({ ...DEFAULT_CITY_SETTINGS, seed });
    }
  });

  it('is the daily city only for medium choices, so the daily rebuilds after any other lobby city', () => {
    const same = (settings: LobbySettings) => JSON.stringify(lobbyCitySettings(settings)) === JSON.stringify(dailyCitySettings(settings.seed));
    const base = defaultLobbySettings(329);
    expect(same(base)).toBe(true);
    expect(same({ ...base, routeLength: 'long' })).toBe(true); // the route length is not the city
    for (const change of [{ size: 'small' }, { size: 'large' }, { downtown: 'small' }, { downtown: 'large' }, { avenues: 'few' }, { avenues: 'many' }] as const) {
      expect(same({ ...base, ...change })).toBe(false);
    }
  });

  it('maps the sizes and the other choices to city settings', () => {
    const base = defaultLobbySettings(5);
    expect(LOBBY_SIZES.map((size) => lobbyCitySettings({ ...base, size }).blocksPerSide)).toEqual([6, 8, 10]);
    expect(LOBBY_SIZES.map((size) => LOBBY_BLOCKS[size])).toEqual([6, 8, 10]);
    const avenues = LOBBY_AVENUES.map((choice) => lobbyCitySettings({ ...base, avenues: choice }).avenueDensity);
    expect(avenues).toEqual([...avenues].sort((a, b) => a - b));
    expect(new Set(avenues).size).toBe(3);
    const downtown = LOBBY_DOWNTOWNS.map((choice) => lobbyCitySettings({ ...base, downtown: choice }).edgeDensityChance);
    expect(downtown).toEqual([...downtown].sort((a, b) => a - b));
    expect(new Set(downtown).size).toBe(3);
    expect(lobbyRouteLength({ ...base, routeLength: 'long' })).toBe(ROUTE_LENGTHS.long);
  });

  it('parses what it serialises and nothing else', () => {
    const settings: LobbySettings = { seed: 4242, size: 'large', downtown: 'small', avenues: 'many', routeLength: 'short' };
    expect(parseLobbySettings(JSON.parse(serialiseLobbySettings(settings)))).toEqual(settings);
    expect(parseLobbySettings(serialiseLobbySettings(settings))).toEqual(settings);
    expect(serialiseLobbySettings(settings)).toBe(serialiseLobbySettings({ routeLength: 'short', avenues: 'many', downtown: 'small', size: 'large', seed: 4242 }));
    expect(parseLobbySettings({ ...settings, extra: 1 })).toEqual(settings);
  });

  it('refuses anything that is not exactly right', () => {
    const good = defaultLobbySettings(10);
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'text',
      '{',
      [],
      {},
      { ...good, seed: 0 },
      { ...good, seed: LOBBY_SEED_MAX + 1 },
      { ...good, seed: 1.5 },
      { ...good, seed: NaN },
      { ...good, seed: '5' },
      { ...good, seed: -3 },
      { ...good, size: 'huge' },
      { ...good, size: 1 },
      { ...good, downtown: 'few' },
      { ...good, avenues: 'small' },
      { ...good, routeLength: 'medium ' },
      { ...good, routeLength: undefined },
    ];
    for (const value of bad) expect(parseLobbySettings(value)).toBeNull();
    for (const field of ['seed', 'size', 'downtown', 'avenues', 'routeLength']) {
      const missing: Record<string, unknown> = { ...good };
      delete missing[field];
      expect(parseLobbySettings(missing)).toBeNull();
    }
    expect(parseLobbySettings({ ...good, seed: 1 })).not.toBeNull();
    expect(parseLobbySettings({ ...good, seed: LOBBY_SEED_MAX })).not.toBeNull();
  });
});

describe('lobby cities', () => {
  const SEEDS = 30;
  const EXTREME_SEEDS = 8;

  function routeFails(settings: LobbySettings): boolean {
    try {
      generateRoute(roadGraph(generateCity(lobbyCitySettings(settings))), settings.seed, { length: ROUTE_LENGTHS[settings.routeLength] });
      return false;
    } catch (error) {
      if (!(error instanceof RouteError)) throw error;
      return true;
    }
  }

  it('hold a route for every size and route length', () => {
    const failures: string[] = [];
    for (const size of LOBBY_SIZES) {
      for (const routeLength of LOBBY_ROUTE_LENGTHS) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const settings = { ...defaultLobbySettings(seed * 7919), size, routeLength };
          if (routeFails(settings)) failures.push(serialiseLobbySettings(settings));
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('hold a route with the downtown and avenue extremes', () => {
    const failures: string[] = [];
    for (const size of LOBBY_SIZES) {
      for (const routeLength of LOBBY_ROUTE_LENGTHS) {
        for (const downtown of ['small', 'large'] as const) {
          for (const avenues of ['few', 'many'] as const) {
            for (let seed = 1; seed <= EXTREME_SEEDS; seed++) {
              const settings = { seed: seed * 104729, size, downtown, avenues, routeLength };
              if (routeFails(settings)) failures.push(serialiseLobbySettings(settings));
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('exist for free driving without asking for a route', () => {
    for (const size of LOBBY_SIZES) {
      for (const [downtown, avenues] of [['small', 'few'], ['medium', 'some'], ['large', 'many']] as const) {
        const settings: LobbySettings = { seed: 321, size, downtown, avenues, routeLength: 'long' };
        const world = createWorld(lobbyCitySettings(settings), { ...DEFAULT_CAR_SETTINGS }, false);
        expect(world.race).toBeNull();
        expect(world.city.blocks.length).toBeGreaterThan(0);
        stepWorld(world, { throttle: 1, brake: 0, steer: 0, drift: 0 });
        expect(world.tick).toBe(1);
      }
    }
  });
});
