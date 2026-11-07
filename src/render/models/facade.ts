import type { Side } from '../../game/buildings.ts';
import type { Rect } from '../../game/city.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { quad, withMaterial, withSideMaterial } from '../shapes.ts';
import { box } from '../shapes.ts';
import { faceOf, SIDES } from './model.ts';

// Windows aren't geometry: a wall is one quad whose corners say how many bays and rows it holds, and the scene shader
// draws them, so a tower costs the same as a box. A bay is one window and the wall beside it.
export interface WindowStyle {
  bay: number; // m
  width: number; // share of a bay
  height: number; // share of a row
  lit: number; // share of windows lit
  run: number; // bays lit together: 1 for flats, more for office floors
}

const STYLES = {
  flat: { bay: 3.2, width: 0.5, height: 0.55, lit: 0.34, run: 1 },
  walkup: { bay: 2.8, width: 0.42, height: 0.62, lit: 0.36, run: 1 },
  ribbon: { bay: 2.4, width: 0.92, height: 0.42, lit: 0.26, run: 1 },
  office: { bay: 3, width: 0.78, height: 0.6, lit: 0.26, run: 2 },
  curtain: { bay: 1.8, width: 0.92, height: 0.8, lit: 0.22, run: 3 },
  pier: { bay: 2.5, width: 0.6, height: 0.82, lit: 0.24, run: 2 },
  hotel: { bay: 3.4, width: 0.56, height: 0.6, lit: 0.5, run: 1 },
  house: { bay: 3.6, width: 0.38, height: 0.42, lit: 0.42, run: 1 },
  shopfront: { bay: 1.7, width: 0.9, height: 0.86, lit: 0.72, run: 2 },
  closedFront: { bay: 2.2, width: 0.9, height: 0.86, lit: 0.08, run: 1 },
  lobby: { bay: 2.2, width: 0.88, height: 0.86, lit: 0.8, run: 2 },
} satisfies Record<string, WindowStyle>;

export type WindowStyleName = keyof typeof STYLES;

const STYLE_NUMBERS = Object.fromEntries(Object.keys(STYLES).map((name, i) => [name, i + 1])) as Record<WindowStyleName, number>;

// Width, height, lit, run per style number, for the scene shader's u_windowStyles. Style 0 is no windows.
export function windowStyleParams(): Float32Array {
  const params = new Float32Array(16 * 4);
  for (const [name, { width, height, lit, run }] of Object.entries(STYLES)) {
    params.set([width, height, lit, run], STYLE_NUMBERS[name as WindowStyleName] * 4);
  }
  return params;
}

export interface Windows {
  style: WindowStyleName;
  seed: number; // whole number, 16 bits, picks which windows are lit
}

export function seedFrom(random: () => number): number {
  return Math.floor(random() * 65536);
}

// A wall between two heights whose rows are `rowHeight` tall. Whole bays and rows, so they fit the wall exactly.
// Each side gets its own seed.
export function windowWall(rect: Rect, side: Side, bottom: number, top: number, rowHeight: number, color: Vec3, windows: Windows, w = 0): number[] {
  const face = faceOf(rect, side);
  const { bay } = STYLES[windows.style];
  const bays = Math.max(1, Math.round(face.length / bay));
  const rows = Math.max(1, Math.round((top - bottom) / rowHeight));
  const corners = [face.point(0, bottom, w), face.point(face.length, bottom, w), face.point(face.length, top, w), face.point(0, top, w)] as const;
  const seed = (windows.seed + SIDES.indexOf(side) * 257) % 65536;
  return quad(corners, face.normal, color, 0, [[0, 0], [bays, 0], [bays, rows], [0, rows]], seed, STYLE_NUMBERS[windows.style]);
}

// A storefront or other glass strip `w` in front of a stretch of wall.
export function glassStrip(rect: Rect, side: Side, u0: number, u1: number, bottom: number, top: number, color: Vec3, windows: Windows, w = 0.06): number[] {
  const face = faceOf(rect, side);
  const { bay } = STYLES[windows.style];
  const bays = Math.max(1, Math.round((u1 - u0) / bay));
  const corners = [face.point(u0, bottom, w), face.point(u1, bottom, w), face.point(u1, top, w), face.point(u0, top, w)] as const;
  const seed = (windows.seed + Math.round(u0 * 7) * 31 + SIDES.indexOf(side) * 257) % 65536;
  return quad(corners, face.normal, color, 0, [[0, 0], [bays, 0], [bays, 1], [0, 1]], seed, STYLE_NUMBERS[windows.style]);
}

// A box of floors: four walls of windows and a flat roof, in one material with `roofMaterial` on top.
export function floorsBox(rect: Rect, bottom: number, top: number, rowHeight: number, color: Vec3, material: number, windows: Windows, roofMaterial: number, roofColor: Vec3 = color): number[] {
  const walls = SIDES.flatMap((side) => windowWall(rect, side, bottom, top, rowHeight, color, windows));
  return [...withMaterial(walls, material), ...roofCap(rect, top, roofColor, roofMaterial)];
}

export function roofCap(rect: Rect, y: number, color: Vec3, material: number): number[] {
  const { minX, minZ, maxX, maxZ } = rect;
  return withMaterial(quad([[minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ]], [0, 1, 0], color), material);
}

// A plain box in `material` with its top in `roofMaterial`.
export function plainBox(rect: Rect, bottom: number, top: number, color: Vec3, material: number, roofMaterial = material): number[] {
  const vertices = box([rect.minX, bottom, rect.minZ], [rect.maxX, top, rect.maxZ], color);
  return withSideMaterial(withMaterial(vertices, roofMaterial), material);
}

// A low wall around a flat roof.
export function parapet(rect: Rect, y: number, height: number, thickness: number, color: Vec3, material: number): number[] {
  const { minX, minZ, maxX, maxZ } = rect;
  const rects: Rect[] = [
    { ...rect, maxX: minX + thickness },
    { ...rect, minX: maxX - thickness },
    { minX: minX + thickness, maxX: maxX - thickness, minZ, maxZ: minZ + thickness },
    { minX: minX + thickness, maxX: maxX - thickness, minZ: maxZ - thickness, maxZ },
  ];
  return rects.flatMap((r) => plainBox(r, y, y + height, color, material));
}
