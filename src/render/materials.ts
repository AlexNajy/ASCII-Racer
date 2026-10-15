// One glyph set per material, each one atlas row: the brightness ramp (darkest to brightest), then the
// edge glyphs if it has any (dim edge, left edge, right edge).
// A material's number is its place in this list plus 1, because 0 in the scene alpha means empty.
export interface ScatterSettings {
  square: number; // m, size of one random square on a surface
  patch: number; // m, size of the patches the squares clump into
  patchiness: number; // 0 = every square on its own, 1 = patches only
}

interface GlyphSet {
  ramp: string;
  edges?: string;
  animated?: boolean; // the glyph moves up and down the ramp over time and across cells
  scatter?: ScatterSettings; // the ramp is 10 variants picked at random by world position, not by brightness
  strokes?: boolean; // faces sloping on screen use the stroke set for their direction instead of this ramp
}

export const RAMP_LENGTH = 10;
const EDGE_GLYPHS = 3;

const SETS = {
  default: { ramp: ' .-:=+*%#@' },
  defaultBuilding: { ramp: ' .:!|I%&#H', edges: '|[]'},
  houseRoof: { ramp: ' .:!|I%&#H', edges: '|[]', strokes: true },
  defaultRoad: { ramp: ' ...,,,---' },
  defaultCurb: { ramp: ' :::--=*##' },
  defaultCurbSide: { ramp: ' :::==**##' },
  // Placeholders
  streetLightPole: { ramp: ' :|THH####' },
  streetLight: { ramp: ' .-:=+*%#@' },
  trafficLightPole: { ramp: ' .-:=+*%#@' },
  trafficLight: { ramp: ' .-:=+*%#@' },
  walkSign: { ramp: ' .-:o+*%#*' },
  stopSignPole: { ramp: ' .-:=+*%#@' },
  stopSign: { ramp: ' .-:=+*%#@' },
  roadMarkings: { ramp: ' .-:=+*%#@' },
  star: { ramp: ' ..\'\'+++**' },
  grass: { ramp: `.,.,''v"";`, scatter: { square: 0.3, patch: 4, patchiness: 0.5 } },
  concrete: { ramp: `---==--===`, scatter: { square: 0.3, patch: 3, patchiness: 0.8 } },
  water: { ramp: ' ~≈=oe*O6@', animated: true },
  // Stroke sets, in the order the ASCII pass numbers the directions.
  strokeVertical: { ramp: ' .:!!|||||' },
  strokeBackslash: { ramp: ' .`\\\\\\\\\\\\\\' },
  strokeHorizontal: { ramp: ' .,=======' },
  strokeSlash: { ramp: ' .,///////' },
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

// Bit n is set when material n is animated. Same 1-31 limit as edges.
export const ANIMATED_MATERIALS = sets.reduce((mask, { animated }, i) => (animated ? mask | (1 << (i + 1)) : mask), 0);

// Bit n is set when material n is a scatter set. Same 1-31 limit as edges.
export const SCATTER_MATERIALS = sets.reduce((mask, { scatter }, i) => (scatter ? mask | (1 << (i + 1)) : mask), 0);

// Bit n is set when material n uses the stroke sets. Same 1-31 limit as edges.
export const STROKE_MATERIALS = sets.reduce((mask, { strokes }, i) => (strokes ? mask | (1 << (i + 1)) : mask), 0);

// Atlas row of the first stroke set; the other directions follow it.
export const STROKE_ROW = MATERIAL.strokeVertical - 1;
if (
  MATERIAL.strokeBackslash !== MATERIAL.strokeVertical + 1 ||
  MATERIAL.strokeHorizontal !== MATERIAL.strokeVertical + 2 ||
  MATERIAL.strokeSlash !== MATERIAL.strokeVertical + 3
) {
  throw new Error('Stroke sets must follow each other: vertical, backslash, horizontal, slash');
}

// Each scatter set's settings, by name. A copy of the defaults above, so the dev menu can change them.
export const SCATTER_SETTINGS = Object.fromEntries(
  Object.entries(SETS as Record<string, GlyphSet>).flatMap(([name, { scatter }]) => (scatter ? [[name, { ...scatter }]] : [])),
) as Partial<Record<Material, ScatterSettings>>;

// Square, patch and patchiness per material number, for the scene shader's u_scatterParams.
export function scatterParams(): Float32Array {
  const params = new Float32Array(32 * 3);
  for (const [name, scatter] of Object.entries(SCATTER_SETTINGS) as [Material, ScatterSettings][]) {
    params.set([scatter.square, scatter.patch, scatter.patchiness], MATERIAL[name] * 3);
  }
  return params;
}
