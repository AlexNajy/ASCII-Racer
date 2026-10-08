import { CURB_HEIGHT } from '../game/city.ts';
import type { Vec3 } from '../math/mat4.ts';
import { beam, box, disc, facingBox, pixelArt } from './shapes.ts';

export type Signal = 'red' | 'yellow' | 'green';

export interface TrafficLight {
  x: number;
  z: number;
  armX: number; // the direction the arm reaches out over the road
  armZ: number;
  facingX: number; // the side the lamps point to, towards the traffic they control
  facingZ: number;
  heads: number[]; // distance of each signal head from the pole, along the arm; the arm ends at the furthest
  walkSignals: WalkSignal[];
  signal: Signal; // temporary: which lamp glows, until signals change over time
}

// A crosswalk light on the pole, facing the people waiting on the other side of the crosswalk.
export interface WalkSignal {
  facing: Vec3;
  walk: boolean; // temporary: walking person (true) or hand (false), until signals change over time
}

const POLE_WIDTH = 0.4;
const POLE_HEIGHT = 6;
const ARM_THICKNESS = 0.3;
const BEND_REACH = 1.5; // the diagonal part of the arm, before it turns flat
const BEND_RISE = 0.8;
const HEAD_WIDTH = 0.6;
const HEAD_HEIGHT = 1.7;
const HEAD_DEPTH = 0.45;
const LAMP_RADIUS = 0.22;
const LAMP_SPACING = 0.55;
const LAMP_DEPTH = 0.06; // how far a lamp sticks out of the shell
const LAMP_SIDES = 12;
const UNLIT = 0.2; // brightness of the lamps that are off
const POLE_COLOR: Vec3 = [0.35, 0.35, 0.35];
const SHELL_COLOR: Vec3 = [0.85, 0.65, 0.1];
// Top to bottom.
const LAMPS: [Signal, Vec3][] = [
  ['red', [1, 0.1, 0.05]],
  ['yellow', [1, 0.75, 0.1]],
  ['green', [0.1, 1, 0.4]],
];

// Crosswalk light, Vancouver style: one box clamped to the pole, with the walking person and the hand
// shown in the same spot on one dark panel.
const WALK_HEIGHT = 2.8; // centre above the pavement
const WALK_SIZE = 0.5;
const WALK_DEPTH = 0.3;
const WALK_PANEL = 0.44;
const WALK_PANEL_DEPTH = 0.02;
const WALK_PIXEL = 0.045;
const WALK_BOX_COLOR: Vec3 = [0.2, 0.2, 0.2];
const WALK_PANEL_COLOR: Vec3 = [0.05, 0.05, 0.05];
const HAND_COLOR: Vec3 = [1, 0.3, 0.1];
const WALKER_COLOR: Vec3 = [0.95, 0.95, 0.9];
const WALKER = ['...##..', '...##..', '..###..', '.#.###.', '#..##.#', '...##..', '..#.#..', '.#...#.', '#.....#'];
const HAND = ['..#.#.#', '..#.#.#', '#.#.#.#', '#.#####', '#######', '.######', '..#####', '..####.', '..####.'];

function dim(color: Vec3): Vec3 {
  return [color[0] * UNLIT, color[1] * UNLIT, color[2] * UNLIT];
}

export function trafficLightVertices(light: TrafficLight): number[] {
  const { x, z, armX, armZ, facingX, facingZ, heads, walkSignals, signal } = light;
  const pole = POLE_WIDTH / 2;
  const top = CURB_HEIGHT + POLE_HEIGHT;
  const armY = top + BEND_RISE;
  const bend: Vec3 = [x + armX * BEND_REACH, armY, z + armZ * BEND_REACH];
  // The flat part starts half a thickness early to fill the gap at the bend,
  // and stops flush with the far side of the furthest head.
  const flatStart = BEND_REACH - ARM_THICKNESS / 2;
  const armEnd = Math.max(...heads) + HEAD_WIDTH / 2;
  const vertices = [
    ...box([x - pole, CURB_HEIGHT, z - pole], [x + pole, top, z + pole], POLE_COLOR),
    ...beam([x, top - ARM_THICKNESS / 2, z], bend, ARM_THICKNESS, POLE_COLOR),
    ...beam([x + armX * flatStart, armY, z + armZ * flatStart], [x + armX * armEnd, armY, z + armZ * armEnd], ARM_THICKNESS, POLE_COLOR),
  ];

  // Heads hang from the underside of the arm.
  const facing: Vec3 = [facingX, 0, facingZ];
  const centreY = armY - ARM_THICKNESS / 2 - HEAD_HEIGHT / 2;
  for (const distance of heads) {
    const centreX = x + armX * distance;
    const centreZ = z + armZ * distance;
    vertices.push(...facingBox([centreX, centreY, centreZ], facing, HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, SHELL_COLOR));
    const frontX = centreX + (facingX * HEAD_DEPTH) / 2;
    const frontZ = centreZ + (facingZ * HEAD_DEPTH) / 2;
    LAMPS.forEach(([lamp, color], i) => {
      const lit = lamp === signal;
      const lampY = centreY + (1 - i) * LAMP_SPACING;
      vertices.push(
        ...disc([frontX, lampY, frontZ], facing, LAMP_RADIUS, 2 * LAMP_DEPTH, LAMP_SIDES, lit ? color : dim(color), lit ? 1 : 0),
      );
    });
  }

  // Crosswalk lights sit against the side of the pole they face.
  const walkY = CURB_HEIGHT + WALK_HEIGHT;
  for (const { facing: direction, walk } of walkSignals) {
    const out = (distance: number): Vec3 => [x + direction[0] * distance, walkY, z + direction[2] * distance];
    const front = pole + WALK_DEPTH;
    vertices.push(
      ...facingBox(out(pole + WALK_DEPTH / 2), direction, WALK_SIZE, WALK_SIZE, WALK_DEPTH, WALK_BOX_COLOR),
      ...facingBox(out(front + WALK_PANEL_DEPTH / 2), direction, WALK_PANEL, WALK_PANEL, WALK_PANEL_DEPTH, WALK_PANEL_COLOR),
      ...pixelArt(
        walk ? WALKER : HAND,
        out(front + WALK_PANEL_DEPTH),
        direction,
        WALK_PIXEL,
        WALK_PANEL_DEPTH,
        walk ? WALKER_COLOR : HAND_COLOR,
        1,
      ),
    );
  }
  return vertices;
}
