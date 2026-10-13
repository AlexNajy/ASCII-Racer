import { createRandom } from '../math/random.ts';

export const FLOATS_PER_STAR = 6; // x, y, z direction, r, g, b
const STAR_COLOR = [0.85, 0.9, 1];

export interface SkySettings {
  starCount: number;
  starSeed: number;
  starMinY: number; // lowest star, as the y of its direction (0 = horizon, 1 = straight up)
  starMinBrightness: number;
  starBrightnessPower: number; // higher: more dim stars, fewer bright ones
}

export const DEFAULT_SKY_SETTINGS: SkySettings = {
  starCount: 1500,
  starSeed: 1,
  starMinY: 0.03,
  starMinBrightness: 0.15,
  starBrightnessPower: 3,
};

// Directions on the upper half of a unit sphere. A uniform y gives an even spread over the sphere's surface.
export function starVertices(settings: SkySettings): number[] {
  const { starCount, starSeed, starMinY, starMinBrightness, starBrightnessPower } = settings;
  const random = createRandom(starSeed);
  const vertices: number[] = [];
  for (let i = 0; i < starCount; i++) {
    const y = starMinY + (1 - starMinY) * random();
    const angle = 2 * Math.PI * random();
    const across = Math.sqrt(1 - y * y);
    const brightness = starMinBrightness + (1 - starMinBrightness) * random() ** starBrightnessPower;
    vertices.push(across * Math.cos(angle), y, across * Math.sin(angle), ...STAR_COLOR.map((c) => c * brightness));
  }
  return vertices;
}
