import { CAR_LENGTH, CAR_WIDTH } from '../../game/car.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { MATERIAL } from '../materials.ts';
import { BRAKE_ID, box, disc, polygon, quad, withId, withMaterial } from '../shapes.ts';
import { CAR_COLORS, type CarColor } from './palettes.ts';

// The body shapes the garage offers, all inside the same collision box. The id is what is stored and sent.
export const CAR_SHAPES = ['coupe', 'hatchback', 'pickup', 'van', 'wedge'] as const;
export type CarShape = (typeof CAR_SHAPES)[number];

const GLASS_COLOR: Vec3 = [0.25, 0.3, 0.4];
export const TYRE_COLOR: Vec3 = [0.12, 0.12, 0.12];
const BED_COLOR: Vec3 = [0.1, 0.1, 0.11];
const HEADLIGHT_COLOR: Vec3 = [1, 0.95, 0.8];
const TAIL_LIGHT_COLOR: Vec3 = [1, 0.3, 0.25]; // pure red is too dark as a glyph
// The car is what the player watches, so its paint glows a little and it reads even with its back to the moonlight.
const BODY_GLOW = 0.3;

// Metres, in the car's own space: x across, y up, front towards -Z. The collision box is CAR_WIDTH × CAR_LENGTH.
const HALF_WIDTH = CAR_WIDTH / 2;
const HALF_LENGTH = CAR_LENGTH / 2;
const SKIRT_BOTTOM = 0.2;
const SKIRT_TOP = 0.35;
const BODY_TOP = 0.75; // the coupe's hood and trunk
const ROOF = 1.35;
const CABIN_HALF_WIDTH = 0.72;
// Where the coupe's cabin meets the body (windshield foot, rear window foot) and the roof's front and back, along z.
const WINDSHIELD_FOOT = -1.1;
const ROOF_FRONT = -0.45;
const ROOF_BACK = 0.85;
const REAR_FOOT = 1.55;
const WHEEL_RADIUS = 0.33;
const BIG_WHEEL_RADIUS = 0.38; // the pickup's
const WHEEL_WIDTH = 0.28;
const WHEEL_SIDES = 8;
// From the centre to each axle. Every shape has its wheels here, so drift particles (render/drift.ts) fit them all.
const AXLE = 1.45;
export const LIGHT_DEPTH = 0.05; // how far the lights stand out of the nose and tail
// The coupe's lights; the other shapes say their own.
const LIGHTS: Lights = { width: 0.4, x: 0.55, bottom: 0.48, top: 0.7 }; // tall enough to cover a cell from the chase camera
// Taller than the van's roof is not a car.
export const MAX_CAR_HEIGHT = 2.1;

interface Lights {
  width: number;
  x: number; // from the centre line to each light's middle
  bottom: number;
  top: number;
}

interface Paint {
  color: Vec3;
  emission: number;
  material: number;
}

// The outward normal of a convex side profile's face from corner i to the next.
function rimNormal(profile: readonly [number, number][], i: number): Vec3 {
  const middleZ = profile.reduce((sum, [z]) => sum + z, 0) / profile.length;
  const middleY = profile.reduce((sum, [, y]) => sum + y, 0) / profile.length;
  const [z0, y0] = profile[i];
  const [z1, y1] = profile[(i + 1) % profile.length];
  const length = Math.hypot(z1 - z0, y1 - y0);
  const normal: Vec3 = [0, (z1 - z0) / length, -(y1 - y0) / length];
  return normal[1] * ((y0 + y1) / 2 - middleY) + normal[2] * ((z0 + z1) / 2 - middleZ) < 0 ? [0, -normal[1], -normal[2]] : normal;
}

// A side profile, (z, y) corners going round in order and convex, extruded across x from -halfWidth to halfWidth.
// `rim[i]` paints the face from corner i to the next; null leaves it out (it sits on something).
function prism(profile: readonly [number, number][], halfWidth: number, sides: Paint, rim: readonly (Paint | null)[]): number[] {
  const vertices: number[] = [];
  for (const x of [-halfWidth, halfWidth]) {
    const face = polygon(profile.map(([z, y]): Vec3 => [x, y, z]), [Math.sign(x), 0, 0], sides.color, sides.emission);
    vertices.push(...withMaterial(face, sides.material));
  }
  profile.forEach(([z0, y0], i) => {
    const paint = rim[i];
    if (!paint) return;
    const [z1, y1] = profile[(i + 1) % profile.length];
    const corners: [Vec3, Vec3, Vec3, Vec3] = [[-halfWidth, y0, z0], [halfWidth, y0, z0], [halfWidth, y1, z1], [-halfWidth, y1, z1]];
    vertices.push(...withMaterial(quad(corners, rimNormal(profile, i), paint.color, paint.emission), paint.material));
  });
  return vertices;
}

// A convex profile shrunk by `distance` on every face.
function insetProfile(profile: readonly [number, number][], distance: number): [number, number][] {
  const lines = profile.map((p, i) => {
    const q = profile[(i + 1) % profile.length];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const [, ny, nz] = rimNormal(profile, i);
    return { z: p[0] - nz * distance, y: p[1] - ny * distance, dz: (q[0] - p[0]) / length, dy: (q[1] - p[1]) / length };
  });
  return lines.map((line, i) => {
    const before = lines[(i + lines.length - 1) % lines.length];
    const t = ((line.z - before.z) * line.dy - (line.y - before.y) * line.dz) / (before.dz * line.dy - before.dy * line.dz);
    return [before.z + t * before.dz, before.y + t * before.dy];
  });
}

function bodyPaint(color: CarColor): Paint {
  return { color: color.body, emission: BODY_GLOW, material: MATERIAL.carBody };
}

const GLASS: Paint = { color: GLASS_COLOR, emission: 0, material: MATERIAL.glassWall };

// Glass facing away from the moonlight is nearly black, so a cabin of only glass leaves its roof floating over the body.
// The cabin is paint with windows set in: frame and pillars stay lit from every side.
const WINDOW_FRAME = 0.1; // m, paint round the side windows and above and below the windshield and rear window
const PILLAR = 0.16; // m, paint either side of the windshield and the rear window
const PANE = 0.02; // m, how far a window stands in front of the paint

// The window on the face from corner i to the next, `start` and `end` m in from those corners, PILLAR in from the sides.
function rimWindow(profile: readonly [number, number][], i: number, halfWidth: number, start: number, end: number): number[] {
  const [z0, y0] = profile[i];
  const [z1, y1] = profile[(i + 1) % profile.length];
  const length = Math.hypot(z1 - z0, y1 - y0);
  const normal = rimNormal(profile, i);
  const at = (along: number, x: number): Vec3 => [
    x,
    y0 + ((y1 - y0) * along) / length + normal[1] * PANE,
    z0 + ((z1 - z0) * along) / length + normal[2] * PANE,
  ];
  const w = halfWidth - PILLAR;
  return quad([at(start, -w), at(start, w), at(length - end, w), at(length - end, -w)], normal, GLASS_COLOR);
}

// A cabin on the body: windshield foot, roof front, roof back, rear foot as (z, y). `sill` is the paint under the rear
// window.
function glassCabin(corners: readonly [number, number][], halfWidth: number, color: CarColor, sill = WINDOW_FRAME): number[] {
  const paint = bodyPaint(color);
  const sideWindow = insetProfile(corners, WINDOW_FRAME);
  const glass = [
    ...[-1, 1].flatMap((side) =>
      polygon(sideWindow.map(([z, y]): Vec3 => [side * (halfWidth + PANE), y, z]), [side, 0, 0], GLASS_COLOR),
    ),
    ...rimWindow(corners, 0, halfWidth, WINDOW_FRAME, WINDOW_FRAME),
    ...rimWindow(corners, 2, halfWidth, WINDOW_FRAME, sill),
  ];
  return [...prism(corners, halfWidth, paint, [paint, paint, paint, null]), ...withMaterial(glass, MATERIAL.glassWall)];
}

function coupeCabin(color: CarColor): number[] {
  const w = CABIN_HALF_WIDTH;
  const side = (x: number) =>
    quad([[x, BODY_TOP, WINDSHIELD_FOOT], [x, BODY_TOP, REAR_FOOT], [x, ROOF, ROOF_BACK], [x, ROOF, ROOF_FRONT]], [Math.sign(x), 0, 0], GLASS_COLOR);
  // The slanted windows face forwards and up, backwards and up.
  const slant = (foot: number, top: number, sign: number) => {
    const run = Math.abs(top - foot);
    const length = Math.hypot(run, ROOF - BODY_TOP);
    const normal: Vec3 = [0, run / length, (sign * (ROOF - BODY_TOP)) / length];
    return quad([[-w, BODY_TOP, foot], [w, BODY_TOP, foot], [w, ROOF, top], [-w, ROOF, top]], normal, GLASS_COLOR);
  };
  const glass = [...side(-w), ...side(w), ...slant(WINDSHIELD_FOOT, ROOF_FRONT, -1), ...slant(REAR_FOOT, ROOF_BACK, 1)];
  const roof = quad([[-w, ROOF, ROOF_FRONT], [w, ROOF, ROOF_FRONT], [w, ROOF, ROOF_BACK], [-w, ROOF, ROOF_BACK]], [0, 1, 0], color.body, BODY_GLOW);
  return [...withMaterial(glass, MATERIAL.glassWall), ...withMaterial(roof, MATERIAL.carBody)];
}

function wheels(radius = WHEEL_RADIUS): number[] {
  const vertices: number[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-AXLE, AXLE]) {
      const centre: Vec3 = [x * (HALF_WIDTH - WHEEL_WIDTH / 2), radius, z];
      vertices.push(...disc(centre, [x, 0, 0], radius, WHEEL_WIDTH, WHEEL_SIDES, TYRE_COLOR));
    }
  }
  return vertices;
}

// A pair of glowing lights on the nose (z = -1) or tail (z = 1).
function lights(end: number, color: Vec3, { width, x: offset, bottom, top }: Lights): number[] {
  const z = end * HALF_LENGTH;
  const [front, back] = end < 0 ? [z - LIGHT_DEPTH, z] : [z, z + LIGHT_DEPTH];
  return [-1, 1].flatMap((x) => {
    const middle = x * offset;
    return box([middle - width / 2, bottom, front], [middle + width / 2, top, back], color, 1);
  });
}

// Head lights, and tail lights the scene shader dims unless braking.
function lamps(front: Lights, rear: Lights = front): number[] {
  return [...lights(-1, HEADLIGHT_COLOR, front), ...withId(lights(1, TAIL_LIGHT_COLOR, rear), BRAKE_ID)];
}

function skirt(color: CarColor): number[] {
  return withMaterial(box([-HALF_WIDTH, SKIRT_BOTTOM, -HALF_LENGTH], [HALF_WIDTH, SKIRT_TOP, HALF_LENGTH], color.skirt), MATERIAL.carBody);
}

// Today's car: a long hood and trunk with a glass cabin between.
function coupe(color: CarColor): number[] {
  const body = box([-HALF_WIDTH, SKIRT_TOP, -HALF_LENGTH], [HALF_WIDTH, BODY_TOP, HALF_LENGTH], color.body, BODY_GLOW);
  return [
    ...withMaterial([...skirt(color), ...body], MATERIAL.carBody),
    ...coupeCabin(color),
    ...wheels(),
    ...lamps(LIGHTS),
  ];
}

// A short sloping hood and a tall cabin running right to the back, closed by a near-upright hatch.
const HATCH_SILL = 0.28; // m, paint under the hatch's window
function hatchback(color: CarColor): number[] {
  const top = 0.85;
  const paint = bodyPaint(color);
  const body = prism([[-HALF_LENGTH, SKIRT_TOP], [HALF_LENGTH, SKIRT_TOP], [HALF_LENGTH, top], [-1.25, top], [-HALF_LENGTH, 0.68]], HALF_WIDTH, paint, [
    null,
    paint,
    paint,
    paint,
    paint,
  ]);
  return [
    ...skirt(color),
    ...body,
    ...glassCabin([[-1.25, top], [-0.3, 1.55], [1.85, 1.55], [2.2, top]], 0.76, color, HATCH_SILL),
    ...wheels(),
    ...lamps({ width: 0.36, x: 0.58, bottom: 0.45, top: 0.64 }, { width: 0.3, x: 0.62, bottom: 0.55, top: 0.82 }),
  ];
}

// A tall cab up front and an open bed behind it: a dark floor between paint rails and a tailgate.
function pickup(color: CarColor): number[] {
  const top = 1.0;
  const cabBack = 0.4;
  const bedFloor = 0.7;
  const rail = 0.95; // under the cab's top, so the cab's back window shows over the bed
  const tailgate = 0.88;
  const wall = 0.1;
  const paint = bodyPaint(color);
  const front = prism([[-HALF_LENGTH, SKIRT_TOP], [cabBack, SKIRT_TOP], [cabBack, top], [-1.0, top], [-HALF_LENGTH, 0.92]], HALF_WIDTH, paint, [
    null,
    paint,
    paint,
    paint,
    paint,
  ]);
  const bedBase = box([-HALF_WIDTH, SKIRT_TOP, cabBack], [HALF_WIDTH, bedFloor, HALF_LENGTH], color.body, BODY_GLOW);
  const floor = box([-HALF_WIDTH + wall, bedFloor, cabBack], [HALF_WIDTH - wall, bedFloor + 0.02, HALF_LENGTH - wall], BED_COLOR);
  const walls = [
    box([-HALF_WIDTH, bedFloor, cabBack], [-HALF_WIDTH + wall, rail, HALF_LENGTH], color.body, BODY_GLOW),
    box([HALF_WIDTH - wall, bedFloor, cabBack], [HALF_WIDTH, rail, HALF_LENGTH], color.body, BODY_GLOW),
    box([-HALF_WIDTH + wall, bedFloor, HALF_LENGTH - wall], [HALF_WIDTH - wall, tailgate, HALF_LENGTH], color.body, BODY_GLOW),
  ].flat();
  return [
    ...skirt(color),
    ...front,
    ...withMaterial([...bedBase, ...walls], MATERIAL.carBody),
    ...withMaterial(floor, MATERIAL.default),
    ...glassCabin([[-1.0, top], [-0.5, 1.8], [cabBack - 0.05, 1.8], [cabBack, top]], 0.78, color),
    ...wheels(BIG_WHEEL_RADIUS),
    ...lamps({ width: 0.4, x: 0.55, bottom: 0.62, top: 0.86 }, { width: 0.2, x: 0.72, bottom: 0.6, top: 0.86 }),
  ];
}

// One tall box with a short sloping nose: windshield in front, small windows at the cab's sides and in the back doors.
function van(color: CarColor): number[] {
  const roof = 1.95;
  const roofFront = -1.15;
  const windshieldFoot: [number, number] = [-2.0, 1.02];
  const paint = bodyPaint(color);
  // The windows stand this far in front of the body, which is that much smaller than the collision box.
  const pane = 0.02;
  const back = HALF_LENGTH - pane;
  const profile: [number, number][] = [[-HALF_LENGTH, SKIRT_TOP], [back, SKIRT_TOP], [back, roof], [roofFront, roof], windshieldFoot, [-HALF_LENGTH, 0.9]];
  const body = prism(profile, HALF_WIDTH - pane, paint, [null, paint, paint, GLASS, paint, paint]);
  const sideWindow = (x: number) => {
    const corners: Vec3[] = [[x, 1.12, -1.86], [x, 1.12, -0.55], [x, 1.78, -0.55], [x, 1.78, -1.28]];
    return polygon(corners, [Math.sign(x), 0, 0], GLASS_COLOR);
  };
  const backWindows = [-1, 1].flatMap((side) =>
    quad(
      [[side * 0.08, 1.2, HALF_LENGTH], [side * 0.75, 1.2, HALF_LENGTH], [side * 0.75, 1.75, HALF_LENGTH], [side * 0.08, 1.75, HALF_LENGTH]],
      [0, 0, 1],
      GLASS_COLOR,
    ),
  );
  return [
    ...skirt(color),
    ...body,
    ...withMaterial([...sideWindow(-HALF_WIDTH), ...sideWindow(HALF_WIDTH), ...backWindows], MATERIAL.glassWall),
    ...wheels(),
    ...lamps({ width: 0.38, x: 0.6, bottom: 0.6, top: 0.82 }, { width: 0.2, x: 0.8, bottom: 0.55, top: 1.05 }),
  ];
}

// Low and sharp: the body rises in one slope from a thin nose to a high tail, a small glass bubble sits far back,
// and a wing stands over the tail.
function wedge(color: CarColor): number[] {
  const nose = 0.5;
  const tail = 0.85;
  const slopeAt = (z: number) => nose + ((z + HALF_LENGTH) / CAR_LENGTH) * (tail - nose);
  const paint = bodyPaint(color);
  const body = prism([[-HALF_LENGTH, SKIRT_TOP], [HALF_LENGTH, SKIRT_TOP], [HALF_LENGTH, tail], [-HALF_LENGTH, nose]], HALF_WIDTH, paint, [
    null,
    paint,
    paint,
    paint,
  ]);
  const roof = 1.12;
  const cabin = glassCabin([[-0.75, slopeAt(-0.75)], [0.2, roof], [0.75, roof], [1.7, slopeAt(1.7)]], 0.7, color);
  const wingBottom = 1.05;
  const wing = [
    box([-HALF_WIDTH, wingBottom, 1.85], [HALF_WIDTH, wingBottom + 0.1, HALF_LENGTH], color.body, BODY_GLOW),
    ...[-1, 1].map((x) => box([x * 0.6 - 0.06, tail - 0.05, 1.95], [x * 0.6 + 0.06, wingBottom, 2.15], color.body, BODY_GLOW)),
  ].flat();
  return [
    ...skirt(color),
    ...body,
    ...cabin,
    ...withMaterial(wing, MATERIAL.carBody),
    ...wheels(),
    ...lamps({ width: 0.5, x: 0.5, bottom: 0.38, top: 0.48 }, { width: 0.7, x: 0.45, bottom: 0.62, top: 0.8 }),
  ];
}

const BUILDERS: Record<CarShape, (color: CarColor) => number[]> = { coupe, hatchback, pickup, van, wedge };

// Front towards -Z.
export function carVertices(shape: CarShape = 'coupe', color: CarColor = CAR_COLORS[0]): number[] {
  return BUILDERS[shape](color);
}
