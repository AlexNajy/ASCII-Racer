// World glyphs prototype: street furniture, building outlines, road markings and the car as characters standing in
// space, instead of boxes wrapped in glyphs. Uses the same data as the models, so everything stands where its
// collider is.
import type { Building } from '../game/buildings.ts';
import { CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH } from '../game/car.ts';
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

// The characters sprites can use, filling as many atlas rows as they need.
export const SPRITE_GLYPHS = "|-=#&O()_/\\[]'.STP";
// centre 3, corner 2, size 2, repeat 2, glyph 2, colour 3, emission, id, right 3, up 3, two-sided.
export const FLOATS_PER_SPRITE_VERTEX = 23;
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
// Small things (signs, lamps) use glyphs this much smaller than the base glyph height, so they keep their real size.
const DETAIL_SCALE = 0.4;

const STOP_SIGN_ART = [' .--. ', '/STOP\\', '\\    /', " '--' "];
const STOP_SIGN_RED: Vec3 = [1, 0.15, 0.1];
const STOP_SIGN_WHITE: Vec3 = [0.95, 0.95, 0.95];
const STOP_SIGN_OFFSET = 0.3; // m in front of the pole
const LAMP_OFFSET = 0.4; // m in front of the arm, towards the traffic
const MARKING_HEIGHT = 0.03; // m above the road, over the old paint
const WIDE_MARKING = 0.9; // m, wider markings (crosswalk stripes) are = instead of -
const ROOF_EDGE_OFFSET = 0.05; // m out from the wall, so the roof line doesn't fight the wall for depth

// The car from its side, front to the left, then from behind and from the front. Front towards -z.
const CAR_SIDE = ['    ________    ', ' __/ |    | \\__ ', "'-(O)------(O)-'"];
const CAR_BACK = [' ____ ', '|[__]|', 'O====O'];
const CAR_FRONT = [' ____ ', '|/  \\|', 'O-==-O'];
const CAR_COLOR: Vec3 = [0.85, 0.15, 0.1];
const TAIL_LIGHT_COLOR: Vec3 = [1, 0.1, 0.05];
const HEADLIGHT_COLOR: Vec3 = [1, 0.95, 0.8];

export interface Sprite {
  centre: Vec3;
  size: [number, number]; // m, the whole sprite
  repeat?: [number, number]; // copies of the glyph across and up, default one
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

// One glyph repeated from bottom to top, turned towards the camera: whole glyphs of about `height`.
function stack(x: number, z: number, bottom: number, top: number, glyph: string, color: Vec3, height: number): Sprite {
  const count = Math.max(1, Math.round((top - bottom) / height));
  const h = (top - bottom) / count;
  return { centre: [x, (bottom + top) / 2, z], size: [h / CELL_ASPECT, top - bottom], repeat: [1, count], glyph, color };
}

// One glyph repeated from a to b, upright in the vertical plane through the line, seen from both sides.
function row(a: Vec3, b: Vec3, glyph: string, color: Vec3, height: number): Sprite {
  const along: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...along);
  const right = unit(along);
  const up = cross(unit(cross(right, UP)), right);
  const count = Math.max(1, Math.round(length / (height / CELL_ASPECT)));
  const width = length / count;
  return {
    centre: add(a, along, 0.5),
    size: [length, width * CELL_ASPECT],
    repeat: [count, 1],
    glyph,
    color,
    right,
    up,
    twoSided: true,
  };
}

// Lines of text standing upright, facing `facing`, centred on `centre`. Spaces are left out. `colorOf` picks each
// character's colour (and glow).
function art(
  lines: string[],
  centre: Vec3,
  facing: Vec3,
  glyphWidth: number,
  colorOf: (glyph: string) => { color: Vec3; emission?: number },
): Sprite[] {
  const right = rightFacing(facing);
  const glyphHeight = glyphWidth * CELL_ASPECT;
  const sprites: Sprite[] = [];
  lines.forEach((text, line) => {
    [...text].forEach((glyph, column) => {
      if (glyph === ' ') return;
      const across = (column - (text.length - 1) / 2) * glyphWidth;
      const upward = ((lines.length - 1) / 2 - line) * glyphHeight;
      sprites.push({
        centre: add(add(centre, right, across), UP, upward),
        size: [glyphWidth, glyphHeight],
        glyph,
        ...colorOf(glyph),
        right,
        up: UP,
      });
    });
  });
  return sprites;
}

export function streetLightSprites({ x, z, facingX, facingZ }: StreetLight, height: number): Sprite[] {
  const top = CURB_HEIGHT + STREET_LIGHT_POLE_HEIGHT;
  const armEnd: Vec3 = [x + facingX * ARM_REACH, top + ARM_RISE, z + facingZ * ARM_REACH];
  const bulb = height * DETAIL_SCALE * 1.5;
  return [
    stack(x, z, CURB_HEIGHT, top, '|', LIGHT_POLE_COLOR, height),
    row([x, top, z], armEnd, '-', LIGHT_POLE_COLOR, height),
    { centre: add(armEnd, UP, -bulb / 2), size: [bulb / CELL_ASPECT, bulb], glyph: '#', color: BULB_COLOR, emission: 1 },
  ];
}

export function trafficLightSprites(light: TrafficLight, height: number): Sprite[] {
  const { junction, x, z, armX, armZ, facingX, facingZ, heads, walkSignals } = light;
  const top = CURB_HEIGHT + (heads.length > 0 ? TRAFFIC_LIGHT_POLE_HEIGHT : WALK_POLE_HEIGHT);
  const detail = height * DETAIL_SCALE;
  const size: [number, number] = [detail / CELL_ASPECT, detail];
  const sprites = [stack(x, z, CURB_HEIGHT, top, '|', SIGNAL_POLE_COLOR, height)];
  // A red hand or a white walking person, one character in one spot; the shader hides the one that is off.
  for (const { facingX: walkX, facingZ: walkZ } of walkSignals) {
    const facing: Vec3 = [walkX, 0, walkZ];
    const centre: Vec3 = [x + walkX * LAMP_OFFSET, CURB_HEIGHT + WALK_HEIGHT, z + walkZ * LAMP_OFFSET];
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
    row([x, top, z], bend, '-', SIGNAL_POLE_COLOR, height),
    row(bend, [x + armX * armEnd, armY, z + armZ * armEnd], '-', SIGNAL_POLE_COLOR, height),
  );
  // Red, yellow, green hanging below the arm, facing the traffic they control.
  const facing: Vec3 = [facingX, 0, facingZ];
  for (const distance of heads) {
    LAMP_COLORS.forEach((color, i) => {
      sprites.push({
        centre: [x + armX * distance + facingX * LAMP_OFFSET, armY - detail * (i + 0.5), z + armZ * distance + facingZ * LAMP_OFFSET],
        size,
        glyph: 'O',
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
  const detail = height * DETAIL_SCALE;
  const front: Vec3 = [x + facingX * STOP_SIGN_OFFSET, centreY, z + facingZ * STOP_SIGN_OFFSET];
  const signBottom = centreY - (STOP_SIGN_ART.length * detail) / 2;
  return [
    stack(x, z, CURB_HEIGHT, signBottom, '|', SIGN_POLE_COLOR, height),
    // A red outline with white letters, like the real sign's white text on red.
    ...art(STOP_SIGN_ART, front, [facingX, 0, facingZ], detail / CELL_ASPECT, (glyph) => ({
      color: /[A-Z]/.test(glyph) ? STOP_SIGN_WHITE : STOP_SIGN_RED,
    })),
  ];
}

// A row of - along a painted line, or = along a wide stripe, in glyphs of the normal size.
export function markingSprite(rect: Rect, height: number): Sprite {
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
  const length = alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ;
  const width = alongX ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
  // Lying flat, seen from above: right along the line, up across it.
  return {
    centre: [(rect.minX + rect.maxX) / 2, MARKING_HEIGHT, (rect.minZ + rect.maxZ) / 2],
    size: [length, height],
    repeat: [Math.max(1, Math.round((length * CELL_ASPECT) / height)), 1],
    glyph: width >= WIDE_MARKING ? '=' : '-',
    color: [1, 1, 1],
    right: alongX ? [1, 0, 0] : [0, 0, 1],
    up: alongX ? [0, 0, -1] : [1, 0, 0],
  };
}

// A | up every corner and a - along every roof edge, exactly on the box's edges, so the outline is the real one.
export function buildingEdgeSprites({ rect, height: buildingHeight }: Building, color: Vec3, height: number): Sprite[] {
  const { minX, minZ, maxX, maxZ } = rect;
  const top = CURB_HEIGHT + buildingHeight;
  const corners = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  const sprites = corners.map(([x, z]) => stack(x, z, CURB_HEIGHT, top, '|', color, height));
  // Each roof edge faces out from its wall and is seen from that side.
  const edges: [Vec3, Vec3, Vec3][] = [
    [[minX, top, minZ], [maxX, top, minZ], [0, 0, -1]],
    [[maxX, top, minZ], [maxX, top, maxZ], [1, 0, 0]],
    [[maxX, top, maxZ], [minX, top, maxZ], [0, 0, 1]],
    [[minX, top, maxZ], [minX, top, minZ], [-1, 0, 0]],
  ];
  for (const [a, b, normal] of edges) {
    const edge = row(add(a, normal, ROOF_EDGE_OFFSET), add(b, normal, ROOF_EDGE_OFFSET), '-', color, height);
    sprites.push({ ...edge, right: rightFacing(normal), up: UP, twoSided: false });
  }
  return sprites;
}

// In the car's own space, drawn with its model matrix.
export function carSprites(): Sprite[] {
  const sideWidth = CAR_LENGTH / CAR_SIDE[0].length;
  const endWidth = CAR_WIDTH / CAR_BACK[0].length;
  const middle = CAR_HEIGHT / 2;
  const body = () => ({ color: CAR_COLOR });
  const lights = (color: Vec3) => (glyph: string) => (glyph === 'O' ? { color, emission: 1 } : { color: CAR_COLOR });
  // The side art has the front on the left, which is the -x side seen from outside; mirrored for the +x side.
  const swaps: Record<string, string> = { '/': '\\', '\\': '/', '(': ')', ')': '(' };
  const mirror = (lines: string[]) => lines.map((line) => [...line].reverse().map((c) => swaps[c] ?? c).join(''));
  return [
    ...art(CAR_SIDE, [-CAR_WIDTH / 2, middle, 0], [-1, 0, 0], sideWidth, body),
    ...art(mirror(CAR_SIDE), [CAR_WIDTH / 2, middle, 0], [1, 0, 0], sideWidth, body),
    ...art(CAR_BACK, [0, middle, CAR_LENGTH / 2], [0, 0, 1], endWidth, lights(TAIL_LIGHT_COLOR)),
    ...art(CAR_FRONT, [0, middle, -CAR_LENGTH / 2], [0, 0, -1], endWidth, lights(HEADLIGHT_COLOR)),
  ];
}

// Six vertices per sprite. SPRITE_GLYPHS fills atlas rows from `firstRow`, `columns` glyphs per row.
export function spriteVertices(sprites: Sprite[], firstRow: number, columns: number): number[] {
  const glyphs = [...SPRITE_GLYPHS];
  const vertices: number[] = [];
  for (const sprite of sprites) {
    const { centre, size, repeat = [1, 1], glyph, color, emission = 0, id = NO_ID } = sprite;
    const { right = [0, 0, 0], up = [0, 0, 0], twoSided = false } = sprite;
    const index = glyphs.indexOf(glyph);
    if (index < 0) throw new Error(`'${glyph}' is not in SPRITE_GLYPHS`);
    const cell = [index % columns, firstRow + Math.floor(index / columns)];
    for (const corner of CORNERS) {
      vertices.push(...centre, ...corner, ...size, ...repeat, ...cell, ...color, emission, id, ...right, ...up, twoSided ? 1 : 0);
    }
  }
  return vertices;
}
