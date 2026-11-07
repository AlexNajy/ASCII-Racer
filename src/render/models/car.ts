import { CAR_LENGTH, CAR_WIDTH } from '../../game/car.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { MATERIAL } from '../materials.ts';
import { BRAKE_ID, box, disc, quad, withId, withMaterial } from '../shapes.ts';

const BODY_COLOR: Vec3 = [0.85, 0.15, 0.1];
const SKIRT_COLOR: Vec3 = [0.2, 0.05, 0.04];
const GLASS_COLOR: Vec3 = [0.25, 0.3, 0.4];
const TYRE_COLOR: Vec3 = [0.12, 0.12, 0.12];
const HEADLIGHT_COLOR: Vec3 = [1, 0.95, 0.8];
const TAIL_LIGHT_COLOR: Vec3 = [1, 0.3, 0.25]; // pure red is too dark as a glyph
// The car is what the player watches, so its paint glows a little and it reads even with its back to the moonlight.
const BODY_GLOW = 0.3;

// Metres, in the car's own space: x across, y up, front towards -Z. The collision box is CAR_WIDTH × CAR_LENGTH.
const HALF_WIDTH = CAR_WIDTH / 2;
const HALF_LENGTH = CAR_LENGTH / 2;
const SKIRT_TOP = 0.35;
const BODY_TOP = 0.75; // the hood and trunk
const ROOF = 1.35;
const CABIN_HALF_WIDTH = 0.72;
// Where the cabin meets the body (windshield foot, rear window foot) and the roof's front and back, along z.
const WINDSHIELD_FOOT = -1.1;
const ROOF_FRONT = -0.45;
const ROOF_BACK = 0.85;
const REAR_FOOT = 1.55;
const WHEEL_RADIUS = 0.33;
const WHEEL_WIDTH = 0.28;
const WHEEL_SIDES = 8;
const AXLE = 1.45; // from the centre to each axle
const LIGHT_WIDTH = 0.4;
const LIGHT_X = 0.55; // from the centre line to each light's middle
const LIGHT_DEPTH = 0.05; // how far the lights stand out of the nose and tail
const LIGHT_BOTTOM = 0.48;
const LIGHT_TOP = 0.7; // tall enough to cover a cell from the chase camera

function cabin(): number[] {
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
  const roof = quad([[-w, ROOF, ROOF_FRONT], [w, ROOF, ROOF_FRONT], [w, ROOF, ROOF_BACK], [-w, ROOF, ROOF_BACK]], [0, 1, 0], BODY_COLOR, BODY_GLOW);
  return [...withMaterial(glass, MATERIAL.glassWall), ...withMaterial(roof, MATERIAL.carBody)];
}

function wheels(): number[] {
  const vertices: number[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-AXLE, AXLE]) {
      const centre: Vec3 = [x * (HALF_WIDTH - WHEEL_WIDTH / 2), WHEEL_RADIUS, z];
      vertices.push(...disc(centre, [x, 0, 0], WHEEL_RADIUS, WHEEL_WIDTH, WHEEL_SIDES, TYRE_COLOR));
    }
  }
  return vertices;
}

// A pair of glowing lights on the nose (z = -1) or tail (z = 1).
function lights(end: number, color: Vec3): number[] {
  const z = end * HALF_LENGTH;
  const [front, back] = end < 0 ? [z - LIGHT_DEPTH, z] : [z, z + LIGHT_DEPTH];
  return [-1, 1].flatMap((x) => {
    const middle = x * LIGHT_X;
    return box([middle - LIGHT_WIDTH / 2, LIGHT_BOTTOM, front], [middle + LIGHT_WIDTH / 2, LIGHT_TOP, back], color, 1);
  });
}

// Front towards -Z.
export function carVertices(): number[] {
  const skirt = box([-HALF_WIDTH, 0.2, -HALF_LENGTH], [HALF_WIDTH, SKIRT_TOP, HALF_LENGTH], SKIRT_COLOR);
  const body = box([-HALF_WIDTH, SKIRT_TOP, -HALF_LENGTH], [HALF_WIDTH, BODY_TOP, HALF_LENGTH], BODY_COLOR, BODY_GLOW);
  return [
    ...withMaterial([...skirt, ...body], MATERIAL.carBody),
    ...cabin(),
    ...wheels(),
    ...lights(-1, HEADLIGHT_COLOR),
    // Dimmed by the scene shader unless braking.
    ...withId(lights(1, TAIL_LIGHT_COLOR), BRAKE_ID),
  ];
}
