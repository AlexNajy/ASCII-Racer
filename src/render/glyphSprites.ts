// World glyphs prototype: street furniture and road markings as single characters standing in space, instead of
// boxes wrapped in glyphs. Uses the same data as the models, so everything stands where its collider is.
import { CURB_HEIGHT, type Rect } from '../game/city.ts';
import {
  STOP_SIGN_HEIGHT,
  TRAFFIC_LIGHT_POLE_HEIGHT,
  WALK_POLE_HEIGHT,
  type StopSign,
  type TrafficLight,
} from '../game/intersections.ts';
import { STREET_LIGHT_POLE_HEIGHT, type StreetLight } from '../game/streetLights.ts';
import type { Vec3 } from '../math/mat4.ts';
import { POLE_COLOR as SIGN_POLE_COLOR } from './models/street/stopSign.ts';
import { ARM_REACH, ARM_RISE, BULB_COLOR, POLE_COLOR as LIGHT_POLE_COLOR } from './models/street/streetLight.ts';
import {
  BEND_REACH,
  BEND_RISE,
  HAND_COLOR,
  HAND_LAMP,
  LAMP_COLORS,
  POLE_COLOR as SIGNAL_POLE_COLOR,
  RED,
  signalId,
  WALK_HEIGHT,
  WALKER_COLOR,
  WALKER_LAMP,
} from './models/street/trafficLight.ts';
import { NO_ID } from './shapes.ts';

// The characters sprites can use, one atlas row.
export const SPRITE_GLYPHS = '|-=#&@STOP';
// centre 3, corner 2, size 2, glyph 2, colour 3, emission, id, right 3, up 3, two-sided.
export const FLOATS_PER_SPRITE_VERTEX = 21;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];
const UP: Vec3 = [0, 1, 0];
const CELL_ASPECT = 1.75; // glyph height / width

const STOP_TEXT_COLOR: Vec3 = [1, 0.15, 0.1]; // brighter than the plate, since the letters are all there is
const STOP_TEXT_OFFSET = 0.3; // m in front of the pole
const LAMP_OFFSET = 0.4; // m in front of the arm, towards the traffic
const MARKING_HEIGHT = 0.03; // m above the road, over the old paint
// A marking is one big glyph. How much of a glyph cell its ink fills, so the ink matches the painted rectangle.
const MARKING_INK_LENGTH = 0.7; // along the line
const DASH_INK_WIDTH = 0.08; // across a -
const EQUALS_INK_WIDTH = 0.3; // across a =, both bars and the gap
const WIDE_MARKING = 0.9; // m, wider markings (crosswalk stripes) are = instead of -
const LONGEST_MARKING_GLYPH = 4.5; // m, longer lines are split into a row of dashes
const MARKING_PIECE = 3; // m, length of one dash in a split line

interface Sprite {
  centre: Vec3;
  size: [number, number];
  glyph: string;
  color: Vec3;
  emission?: number;
  id?: number;
  // Leave out to turn the glyph towards the camera.
  right?: Vec3;
  up?: Vec3;
  twoSided?: boolean;
}

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};
// Right for a glyph standing upright and facing the given horizontal direction.
const rightFacing = (facing: Vec3): Vec3 => cross(UP, facing);

// Glyphs stacked from bottom to top, as many whole glyphs of about `height` as fit.
function stack(x: number, z: number, bottom: number, top: number, glyph: string, color: Vec3, height: number): Sprite[] {
  const count = Math.max(1, Math.round((top - bottom) / height));
  const h = (top - bottom) / count;
  return Array.from({ length: count }, (_, i) => ({
    centre: [x, bottom + h * (i + 0.5), z] as Vec3,
    size: [h / CELL_ASPECT, h] as [number, number],
    glyph,
    color,
  }));
}

// Glyphs in a row from a to b, upright in the vertical plane through the line and seen from both sides.
function row(a: Vec3, b: Vec3, glyph: string, color: Vec3, height: number): Sprite[] {
  const along: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...along);
  const right = unit(along);
  const up = cross(unit(cross(right, UP)), right);
  const count = Math.max(1, Math.round(length / (height / CELL_ASPECT)));
  const width = length / count;
  return Array.from({ length: count }, (_, i) => ({
    centre: add(a, right, width * (i + 0.5)),
    size: [width, width * CELL_ASPECT] as [number, number],
    glyph,
    color,
    right,
    up,
    twoSided: true,
  }));
}

export function streetLightSprites({ x, z, facingX, facingZ }: StreetLight, height: number): Sprite[] {
  const top = CURB_HEIGHT + STREET_LIGHT_POLE_HEIGHT;
  const armEnd: Vec3 = [x + facingX * ARM_REACH, top + ARM_RISE, z + facingZ * ARM_REACH];
  return [
    ...stack(x, z, CURB_HEIGHT, top, '|', LIGHT_POLE_COLOR, height),
    ...row([x, top, z], armEnd, '-', LIGHT_POLE_COLOR, height),
    { centre: add(armEnd, UP, -height / 2), size: [height / CELL_ASPECT, height], glyph: '#', color: BULB_COLOR, emission: 1 },
  ];
}

export function trafficLightSprites(light: TrafficLight, height: number): Sprite[] {
  const { junction, x, z, armX, armZ, facingX, facingZ, heads, walkSignals } = light;
  const top = CURB_HEIGHT + (heads.length > 0 ? TRAFFIC_LIGHT_POLE_HEIGHT : WALK_POLE_HEIGHT);
  const size: [number, number] = [height / CELL_ASPECT, height];
  const sprites = stack(x, z, CURB_HEIGHT, top, '|', SIGNAL_POLE_COLOR, height);
  // A red hand or a white walking person, one character in one spot; the shader hides the one that is off.
  for (const { facingX: walkX, facingZ: walkZ } of walkSignals) {
    const facing: Vec3 = [walkX, 0, walkZ];
    const centre: Vec3 = [x + walkX * size[0], CURB_HEIGHT + WALK_HEIGHT, z + walkZ * size[0]];
    const symbol = (glyph: string, color: Vec3, lamp: number): Sprite => ({
      centre,
      size,
      glyph,
      color,
      emission: 1,
      id: signalId(junction, walkZ !== 0, lamp),
      right: rightFacing(facing),
      up: UP,
    });
    sprites.push(symbol('#', HAND_COLOR, HAND_LAMP), symbol('&', WALKER_COLOR, WALKER_LAMP));
  }
  if (heads.length === 0) return sprites;

  const armY = top + BEND_RISE;
  const bend: Vec3 = [x + armX * BEND_REACH, armY, z + armZ * BEND_REACH];
  const armEnd = Math.max(...heads);
  sprites.push(
    ...row([x, top, z], bend, '-', SIGNAL_POLE_COLOR, height),
    ...row(bend, [x + armX * armEnd, armY, z + armZ * armEnd], '-', SIGNAL_POLE_COLOR, height),
  );
  // Red, yellow, green hanging below the arm, facing the traffic they control.
  const facing: Vec3 = [facingX, 0, facingZ];
  for (const distance of heads) {
    LAMP_COLORS.forEach((color, i) => {
      sprites.push({
        centre: [x + armX * distance + facingX * LAMP_OFFSET, armY - height * (i + 0.5), z + armZ * distance + facingZ * LAMP_OFFSET],
        size,
        glyph: '#',
        color,
        emission: 1,
        id: signalId(junction, facingZ !== 0, RED + i),
        right: rightFacing(facing),
        up: UP,
      });
    });
  }
  return sprites;
}

export function stopSignSprites({ x, z, facingX, facingZ }: StopSign, height: number): Sprite[] {
  const centreY = CURB_HEIGHT + STOP_SIGN_HEIGHT;
  const facing: Vec3 = [facingX, 0, facingZ];
  const right = rightFacing(facing);
  const width = height / CELL_ASPECT;
  const front: Vec3 = [x + facingX * STOP_TEXT_OFFSET, centreY, z + facingZ * STOP_TEXT_OFFSET];
  return [
    ...stack(x, z, CURB_HEIGHT, centreY - height / 2, '|', SIGN_POLE_COLOR, height),
    ...[...'STOP'].map((glyph, i) => ({
      centre: add(front, right, (i - 1.5) * width),
      size: [width, height] as [number, number],
      glyph,
      color: STOP_TEXT_COLOR,
      right,
      up: UP,
    })),
  ];
}

// Each painted rectangle is one big - (or = for wide stripes) lying on the road; long lines become a row of them.
export function markingSprites(rect: Rect): Sprite[] {
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
  const length = alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
  const width = alongX ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
  const glyph = width >= WIDE_MARKING ? '=' : '-';
  const inkWidth = glyph === '=' ? EQUALS_INK_WIDTH : DASH_INK_WIDTH;
  // Lying flat, seen from above: right along the line, up across it.
  const right: Vec3 = alongX ? [1, 0, 0] : [0, 0, 1];
  const up: Vec3 = alongX ? [0, 0, -1] : [1, 0, 0];
  const count = length > LONGEST_MARKING_GLYPH ? Math.max(1, Math.round(length / MARKING_PIECE)) : 1;
  const piece = length / count;
  const start: Vec3 = alongX
    ? [rect.minX, MARKING_HEIGHT, (rect.minZ + rect.maxZ) / 2]
    : [(rect.minX + rect.maxX) / 2, MARKING_HEIGHT, rect.minZ];
  // A single glyph's ink covers the whole marking; a split line's glyphs keep the gaps between their dashes.
  const glyphLength = count > 1 ? piece : piece / MARKING_INK_LENGTH;
  return Array.from({ length: count }, (_, i) => ({
    centre: add(start, right, piece * (i + 0.5)),
    size: [glyphLength, width / inkWidth] as [number, number],
    glyph,
    color: [1, 1, 1] as Vec3,
    right,
    up,
  }));
}

// Six vertices per sprite. `row` is the atlas row holding SPRITE_GLYPHS.
export function spriteVertices(sprites: Sprite[], row: number): number[] {
  const columns = [...SPRITE_GLYPHS];
  const vertices: number[] = [];
  for (const { centre, size, glyph, color, emission = 0, id = NO_ID, right = [0, 0, 0], up = [0, 0, 0], twoSided = false } of sprites) {
    const column = columns.indexOf(glyph);
    if (column < 0) throw new Error(`'${glyph}' is not in SPRITE_GLYPHS`);
    for (const corner of CORNERS) {
      vertices.push(...centre, ...corner, ...size, column, row, ...color, emission, id, ...right, ...up, twoSided ? 1 : 0);
    }
  }
  return vertices;
}
