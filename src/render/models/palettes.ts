import type { Vec3 } from '../../math/mat4.ts';

// Hand-picked per style. Brightness stays similar within a palette, so the glyphs do too and only the colour changes.
export const BRICK: readonly Vec3[] = [[0.62, 0.33, 0.27], [0.56, 0.3, 0.3], [0.6, 0.38, 0.28], [0.5, 0.33, 0.33], [0.55, 0.36, 0.42]];
export const STUCCO: readonly Vec3[] = [[0.68, 0.58, 0.48], [0.5, 0.6, 0.58], [0.68, 0.52, 0.5], [0.58, 0.58, 0.68], [0.66, 0.62, 0.42]];
export const CONCRETE: readonly Vec3[] = [[0.52, 0.52, 0.5], [0.48, 0.5, 0.54], [0.54, 0.5, 0.46], [0.46, 0.46, 0.5]];
export const GLASS: readonly Vec3[] = [[0.3, 0.42, 0.56], [0.26, 0.46, 0.5], [0.36, 0.38, 0.56], [0.34, 0.44, 0.46]];
export const STONE: readonly Vec3[] = [[0.66, 0.6, 0.5], [0.6, 0.56, 0.54], [0.56, 0.58, 0.6], [0.68, 0.56, 0.46]];
export const SHOP_WALL: readonly Vec3[] = [[0.42, 0.38, 0.36], [0.36, 0.4, 0.42], [0.44, 0.36, 0.4], [0.38, 0.38, 0.44], [0.46, 0.4, 0.32]];
export const HOUSE_WALL: readonly Vec3[] = [[0.72, 0.68, 0.58], [0.56, 0.64, 0.66], [0.72, 0.58, 0.52], [0.6, 0.66, 0.54], [0.68, 0.66, 0.68]];
export const HOUSE_ROOF: readonly Vec3[] = [[0.42, 0.26, 0.22], [0.3, 0.32, 0.38], [0.36, 0.3, 0.26], [0.26, 0.34, 0.3]];
export const AWNING: readonly Vec3[] = [[0.75, 0.15, 0.15], [0.15, 0.5, 0.35], [0.2, 0.3, 0.7], [0.8, 0.55, 0.1], [0.55, 0.2, 0.55]];
export const CAR_PAINT: readonly Vec3[] = [[0.7, 0.12, 0.12], [0.15, 0.3, 0.65], [0.75, 0.75, 0.78], [0.2, 0.2, 0.22], [0.75, 0.6, 0.15], [0.15, 0.5, 0.45]];
export const ROOF_GREY: Vec3 = [0.3, 0.3, 0.32];

// Saturated, so neon shows colour even at the dim end of its ramp. Neighbourhoods get a run of this list,
// so a street stays in one colour family.
export const NEON: readonly Vec3[] = [
  [1, 0.15, 0.55], // pink
  [0.2, 0.95, 1], // cyan
  [1, 0.2, 0.15], // red
  [0.75, 0.3, 1], // violet
  [0.3, 1, 0.45], // green
  [1, 0.7, 0.15], // amber
];

// Three colours in a row from the list, starting where the neighbourhood says.
export function neonFamily(neighbourhood: number): Vec3[] {
  const start = Math.floor(neighbourhood * NEON.length);
  return [0, 1, 2].map((i) => NEON[(start + i) % NEON.length]);
}
