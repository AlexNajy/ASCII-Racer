import type { Side } from '../../game/buildings.ts';
import type { Rect } from '../../game/city.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { MATERIAL } from '../materials.ts';
import { pixelArt, withMaterial } from '../shapes.ts';
import { faceOf } from './model.ts';

const FONT: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.####|#....|#....|#....|#....|#....|.####',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.####|#....|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

const GLYPH_ROWS = 7;
const GLYPH_COLUMNS = 5;
const OFFSET = 0.05; // m in front of the board, so letters don't fight it for depth

function letters(text: string): string[][] {
  return [...text].map((char) => (FONT[char] ?? FONT[' ']).split('|'));
}

function neon(vertices: number[]): number[] {
  return withMaterial(vertices, MATERIAL.neon);
}

// Rows of '#' for a word written across: one column gap between letters.
function acrossRows(text: string): string[] {
  const glyphs = letters(text);
  return Array.from({ length: GLYPH_ROWS }, (_, row) => glyphs.map((glyph) => glyph[row]).join('.'));
}

export function textWidth(text: string): number {
  return text.length * (GLYPH_COLUMNS + 1) - 1; // in pixels
}

// A word across a flat face, in neon, facing `facing`.
export function neonText(text: string, centre: Vec3, facing: Vec3, pixel: number, color: Vec3): number[] {
  return neon(pixelArt(acrossRows(text), centre, facing, pixel, OFFSET, color, 1));
}

// A word stacked downwards, each letter on its own line.
export function neonStack(text: string, centre: Vec3, facing: Vec3, pixel: number, color: Vec3): number[] {
  const line = (GLYPH_ROWS + 2) * pixel;
  const top = ((text.length - 1) * line) / 2;
  return [...text].flatMap((char, i) => {
    const at: Vec3 = [centre[0], centre[1] + top - i * line, centre[2]];
    return neon(pixelArt(letters(char)[0], at, facing, pixel, OFFSET, color, 1));
  });
}

// A thin glowing tube along part of a wall, `w` in front of it.
export function neonTube(rect: Rect, side: Side, u0: number, u1: number, y: number, thickness: number, w: number, color: Vec3): number[] {
  return neon(faceOf(rect, side).box(u0, u1, y, y + thickness, w, w + thickness, color, 1));
}
