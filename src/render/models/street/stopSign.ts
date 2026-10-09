import { CURB_HEIGHT } from '../../../game/city.ts';
import { STOP_SIGN_HEIGHT, STOP_SIGN_POLE_WIDTH, type StopSign } from '../../../game/intersections.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { box, disc, pixelArt } from '../../shapes.ts';

// Bigger than a real sign (0.75 m across) so the octagon still reads as one at a distance.
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
  const centreY = CURB_HEIGHT + STOP_SIGN_HEIGHT;
  const pole = STOP_SIGN_POLE_WIDTH / 2;
  // The plate hangs just in front of the pole, so the pole never shows through the face.
  const plateOffset = pole + PLATE_DEPTH / 2;
  const plate: Vec3 = [x + facingX * plateOffset, centreY, z + facingZ * plateOffset];
  const layer = (n: number): Vec3 => {
    const offset = plateOffset + PLATE_DEPTH / 2 + LAYER_DEPTH * (n - 0.5);
    return [x + facingX * offset, centreY, z + facingZ * offset];
  };
  return [
    ...box([x - pole, CURB_HEIGHT, z - pole], [x + pole, centreY, z + pole], POLE_COLOR),
    ...disc(plate, facing, SIGN_RADIUS, PLATE_DEPTH, 8, POLE_COLOR),
    ...disc(layer(1), facing, SIGN_RADIUS, LAYER_DEPTH, 8, BORDER_COLOR),
    ...disc(layer(2), facing, SIGN_RADIUS - BORDER, LAYER_DEPTH, 8, FACE_COLOR),
    ...pixelArt(WORD, layer(2.5), facing, TEXT_PIXEL, LAYER_DEPTH, TEXT_COLOR),
  ];
}
