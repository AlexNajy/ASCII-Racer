import { CURB_HEIGHT } from '../game/city.ts';
import type { Vec3 } from '../math/mat4.ts';
import { box, disc, pixelArt } from './shapes.ts';

export interface StopSign {
  x: number;
  z: number;
  facingX: number; // the side the red face points to, towards the traffic that has to stop
  facingZ: number;
}

// Bigger than a real sign (0.75 m across) so the octagon still reads as one at a distance.
const POLE_WIDTH = 0.2;
const SIGN_HEIGHT = 2.6; // centre of the sign above the pavement
const SIGN_RADIUS = 0.55;
const BORDER = 0.07;
const PLATE_DEPTH = 0.05;
const LAYER_DEPTH = 0.02;
const POLE_COLOR: Vec3 = [0.35, 0.35, 0.35];
const BORDER_COLOR: Vec3 = [0.9, 0.9, 0.9];
const FACE_COLOR: Vec3 = [0.8, 0.08, 0.08];
const TEXT_COLOR: Vec3 = BORDER_COLOR;
const TEXT_PIXEL = 0.055;
// 3×5 pixel letters, one empty column between them.
const LETTERS = [
  ['###', '#..', '###', '..#', '###'], // S
  ['###', '.#.', '.#.', '.#.', '.#.'], // T
  ['###', '#.#', '#.#', '#.#', '###'], // O
  ['###', '#.#', '###', '#..', '#..'], // P
];
const WORD = LETTERS[0].map((_, row) => LETTERS.map((letter) => letter[row]).join('.'));

export function stopSignVertices({ x, z, facingX, facingZ }: StopSign): number[] {
  const facing: Vec3 = [facingX, 0, facingZ];
  const centreY = CURB_HEIGHT + SIGN_HEIGHT;
  const layer = (n: number): Vec3 => {
    const offset = PLATE_DEPTH / 2 + LAYER_DEPTH * (n - 0.5);
    return [x + facingX * offset, centreY, z + facingZ * offset];
  };
  // The pole stands behind the plate, so it never shows through the face.
  const poleOffset = PLATE_DEPTH / 2 + POLE_WIDTH / 2;
  const poleX = x - facingX * poleOffset;
  const poleZ = z - facingZ * poleOffset;
  const pole = POLE_WIDTH / 2;
  return [
    ...box([poleX - pole, CURB_HEIGHT, poleZ - pole], [poleX + pole, centreY, poleZ + pole], POLE_COLOR),
    ...disc([x, centreY, z], facing, SIGN_RADIUS, PLATE_DEPTH, 8, POLE_COLOR),
    ...disc(layer(1), facing, SIGN_RADIUS, LAYER_DEPTH, 8, BORDER_COLOR),
    ...disc(layer(2), facing, SIGN_RADIUS - BORDER, LAYER_DEPTH, 8, FACE_COLOR),
    ...pixelArt(WORD, layer(2.5), facing, TEXT_PIXEL, LAYER_DEPTH, TEXT_COLOR),
  ];
}
