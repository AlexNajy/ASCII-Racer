import { DEFAULT_CITY_SETTINGS, type CitySettings } from './city.ts';
import { ROUTE_LENGTHS } from './route.ts';

// What a lobby's host picks. Plain data for the browser, a peer or a server: the city a lobby drives in is
// lobbyCitySettings(settings), the same for everyone with the same settings.

export const MAX_PLAYERS = 8;
export const LOBBY_SEED_MAX = 1_000_000; // seeds are 1 to this, as unlimited's

export const LOBBY_SIZES = ['small', 'medium', 'large'] as const;
export const LOBBY_DOWNTOWNS = ['small', 'medium', 'large'] as const;
export const LOBBY_AVENUES = ['few', 'some', 'many'] as const;
export const LOBBY_ROUTE_LENGTHS = ['short', 'medium', 'long'] as const;

export type LobbySize = (typeof LOBBY_SIZES)[number];
export type LobbyDowntown = (typeof LOBBY_DOWNTOWNS)[number];
export type LobbyAvenues = (typeof LOBBY_AVENUES)[number];
export type LobbyRouteLength = (typeof LOBBY_ROUTE_LENGTHS)[number];

export interface LobbySettings {
  seed: number;
  size: LobbySize;
  downtown: LobbyDowntown;
  avenues: LobbyAvenues;
  routeLength: LobbyRouteLength;
}

// Blocks per side; medium is the default city.
export const LOBBY_BLOCKS: Record<LobbySize, number> = { small: 6, medium: 8, large: 10 };

// Downtown size is how far the mid-rise zone reaches: its chance at the centre and at the edge of the downtown
// radius (the radius itself is fixed in the city generator). Medium is the default city.
export const LOBBY_DOWNTOWN_DENSITY: Record<LobbyDowntown, { centreDensityChance: number; edgeDensityChance: number }> = {
  small: { centreDensityChance: 0.8, edgeDensityChance: 0 },
  medium: { centreDensityChance: DEFAULT_CITY_SETTINGS.centreDensityChance, edgeDensityChance: DEFAULT_CITY_SETTINGS.edgeDensityChance },
  large: { centreDensityChance: 1, edgeDensityChance: 0.3 },
};

// Chance of an extra avenue beside a downtown one. `some` is the default city.
export const LOBBY_AVENUE_DENSITY: Record<LobbyAvenues, number> = { few: 0.1, some: DEFAULT_CITY_SETTINGS.avenueDensity, many: 0.7 };

export const DEFAULT_LOBBY_CHOICES = { size: 'medium', downtown: 'medium', avenues: 'some', routeLength: 'medium' } as const;

// The defaults with the seed the caller picked.
export function defaultLobbySettings(seed: number): LobbySettings {
  return { seed, ...DEFAULT_LOBBY_CHOICES };
}

export function lobbyCitySettings(settings: LobbySettings): CitySettings {
  return {
    ...DEFAULT_CITY_SETTINGS,
    seed: settings.seed,
    blocksPerSide: LOBBY_BLOCKS[settings.size],
    ...LOBBY_DOWNTOWN_DENSITY[settings.downtown],
    avenueDensity: LOBBY_AVENUE_DENSITY[settings.avenues],
  };
}

// The route length in metres a race of this lobby has.
export function lobbyRouteLength(settings: LobbySettings): number {
  return ROUTE_LENGTHS[settings.routeLength];
}

export function validLobbySeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 1 && seed <= LOBBY_SEED_MAX;
}

function oneOf<T extends string>(choices: readonly T[], value: unknown): T | null {
  return typeof value === 'string' ? (choices.find((choice) => choice === value) ?? null) : null;
}

// Settings from untrusted input (a parsed object or its JSON text): every field must be right, else null. Unknown
// fields are ignored.
export function parseLobbySettings(json: unknown): LobbySettings | null {
  let value = json;
  if (typeof json === 'string') {
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const size = oneOf(LOBBY_SIZES, fields.size);
  const downtown = oneOf(LOBBY_DOWNTOWNS, fields.downtown);
  const avenues = oneOf(LOBBY_AVENUES, fields.avenues);
  const routeLength = oneOf(LOBBY_ROUTE_LENGTHS, fields.routeLength);
  if (!validLobbySeed(fields.seed) || !size || !downtown || !avenues || !routeLength) return null;
  return { seed: fields.seed, size, downtown, avenues, routeLength };
}

// Canonical JSON text: fixed field order, so equal settings give equal text.
export function serialiseLobbySettings(settings: LobbySettings): string {
  const { seed, size, downtown, avenues, routeLength } = settings;
  return JSON.stringify({ seed, size, downtown, avenues, routeLength });
}
