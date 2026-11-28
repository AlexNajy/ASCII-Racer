// Stored results that pin what a city seed, route seed and input log mean. Replace them by hand, only on purpose,
// together with a new SIMULATION_VERSION and its fingerprint (version.test.ts).

export const REFERENCE_HASHES: Record<number, number> = {
  1: 3477829500,
  42: 932636931,
};

export const DRIVEN_RACE_HASH = 3683511602;

export const PACKED_RACE_HASH = 3079937558;

// city seed, route seed, hash
export const REFERENCE_ROUTES: [number, number, number][] = [
  [1, 1, 1172941461],
  [42, 42, 473546309],
  [7, 12345, 469151771],
];

// day, daily seed
export const REFERENCE_SEEDS: [number, number][] = [
  [0, 746813],
  [1, 661912],
  [329, 424449],
  [1000, 14021],
];

// day, city and route seed, route digest
export const REFERENCE_RACES: [number, number, number][] = [
  [0, 746813, 2422616063],
  [329, 424449, 1818073889],
];
