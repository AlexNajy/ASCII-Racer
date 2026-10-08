import { CURB_HEIGHT } from '../game/city.ts';
import type { StreetLight } from '../game/streetLights.ts';
import type { Vec3 } from '../math/mat4.ts';
import { beam, box } from './shapes.ts';

const POLE_WIDTH = 0.4;
const POLE_HEIGHT = 7;
const ARM_THICKNESS = 0.3;
const ARM_REACH = 3;
const ARM_RISE = 0.8;
const HEAD_LENGTH = 1.2;
const HEAD_WIDTH = 0.6;
const HEAD_HEIGHT = 0.35;
const HEAD_OVERHANG = 0.2;
const BULB_INSET = 0.1;
const BULB_HEIGHT = 0.15;
const POLE_COLOR: Vec3 = [0.35, 0.35, 0.35];
const BULB_COLOR: Vec3 = [1, 0.9, 0.6];

export function streetLightVertices({ x, z, facingX, facingZ }: StreetLight): number[] {
  const pole = POLE_WIDTH / 2;
  const top = CURB_HEIGHT + POLE_HEIGHT;
  const armEnd: Vec3 = [x + facingX * ARM_REACH, top + ARM_RISE, z + facingZ * ARM_REACH];
  const headCentreX = armEnd[0] + facingX * (HEAD_OVERHANG - HEAD_LENGTH / 2);
  const headCentreZ = armEnd[2] + facingZ * (HEAD_OVERHANG - HEAD_LENGTH / 2);
  const flatBox = (length: number, width: number, bottom: number, height: number) => {
    const halfX = (Math.abs(facingX) * length + Math.abs(facingZ) * width) / 2;
    const halfZ = (Math.abs(facingZ) * length + Math.abs(facingX) * width) / 2;
    const min: Vec3 = [headCentreX - halfX, bottom, headCentreZ - halfZ];
    const max: Vec3 = [headCentreX + halfX, bottom + height, headCentreZ + halfZ];
    return [min, max] as const;
  };
  // Level with the arm's underside where it enters the back of the head, so the arm never reaches the bulb.
  const armDrop = (ARM_RISE / ARM_REACH) * (HEAD_LENGTH - HEAD_OVERHANG);
  const headBottom = armEnd[1] - armDrop - ARM_THICKNESS / 2;
  return [
    ...box([x - pole, CURB_HEIGHT, z - pole], [x + pole, top, z + pole], POLE_COLOR),
    ...beam([x, top - ARM_THICKNESS / 2, z], armEnd, ARM_THICKNESS, POLE_COLOR),
    ...box(...flatBox(HEAD_LENGTH, HEAD_WIDTH, headBottom, HEAD_HEIGHT), POLE_COLOR),
    ...box(
      ...flatBox(HEAD_LENGTH - 2 * BULB_INSET, HEAD_WIDTH - 2 * BULB_INSET, headBottom - BULB_HEIGHT, BULB_HEIGHT),
      BULB_COLOR,
      1,
    ),
  ];
}
