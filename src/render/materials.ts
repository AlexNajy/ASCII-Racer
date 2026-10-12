// One glyph set per material, each one atlas row: the brightness ramp (darkest to brightest), then the
// edge glyphs if it has any (dim edge, left edge, right edge).
// A material's number is its place in this list plus 1, because 0 in the scene alpha means empty.
interface GlyphSet {
  ramp: string;
  edges?: string;
}

export const RAMP_LENGTH = 10;
const EDGE_GLYPHS = 3;

const SETS = {
  default: { ramp: ' .-:=+*%#@' },
  defaultBuilding: { ramp: ' .,:;||IH#', edges: '|[]' },
  defaultRoad: { ramp: ' ...,,,---' },
  defaultCurb: { ramp: ' ___---===' },
  defaultCurbSide: { ramp: ' ..::|||||' },
  // Placeholders
  streetLightPole: { ramp: ' .-:=+*%#@' },
  streetLight: { ramp: ' .-:=+*%#@' },
  trafficLightPole: { ramp: ' .-:=+*%#@' },
  trafficLight: { ramp: ' .-:=+*%#@' },
  walkSign: { ramp: ' .-:=+*%#@' },
  stopSignPole: { ramp: ' .-:=+*%#@' },
  stopSign: { ramp: ' .-:=+*%#@' },
  roadMarkings: { ramp: ' .-:=+*%#@' },
} satisfies Record<string, GlyphSet>;

export type Material = keyof typeof SETS;

const sets: GlyphSet[] = Object.values(SETS);
for (const { ramp, edges = ' '.repeat(EDGE_GLYPHS) } of sets) {
  if ([...ramp].length !== RAMP_LENGTH || [...edges].length !== EDGE_GLYPHS) {
    throw new Error(`Glyph set '${ramp}' needs ${RAMP_LENGTH} ramp and ${EDGE_GLYPHS} edge glyphs`);
  }
}

export const GLYPH_RAMPS: string[] = sets.map(({ ramp, edges = ' '.repeat(EDGE_GLYPHS) }) => ramp + edges);

export const MATERIAL = Object.fromEntries(Object.keys(SETS).map((name, i) => [name, i + 1])) as Record<Material, number>;

// Bit n is set when material n has edge glyphs. An int uniform has 32 bits, so only materials 1-31 can have edges.
export const EDGE_MATERIALS = sets.reduce((mask, { edges }, i) => (edges ? mask | (1 << (i + 1)) : mask), 0);
