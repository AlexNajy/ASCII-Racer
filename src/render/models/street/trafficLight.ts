import { CURB_HEIGHT } from '../../../game/city.ts';
import {
  TRAFFIC_LIGHT_POLE_HEIGHT,
  TRAFFIC_LIGHT_POLE_WIDTH,
  WALK_POLE_HEIGHT,
  type TrafficLight,
} from '../../../game/intersections.ts';
import type { Vec3 } from '../../../math/mat4.ts';
import { beam, box, disc, facingBox, pixelArt, withId } from '../../shapes.ts';

// Signal IDs, read by the scene vertex shader: junction * 10 + road * 5 + lamp. Road 0 is the column road
// (north-south), 1 the row road. Lamps 0-2 are red, yellow, green for that road's traffic; 3 and 4 the walking
// person and the hand for people walking alongside it. The shader keeps the same numbers.
const RED = 0;
const WALKER_LAMP = 3;
const HAND_LAMP = 4;

function signalId(junction: number, alongZ: boolean, lamp: number): number {
  return junction * 10 + (alongZ ? 0 : 1) * 5 + lamp;
}

const ARM_THICKNESS = 0.3;
const BEND_REACH = 1.5; // the diagonal part of the arm, before it turns flat
const BEND_RISE = 0.8;
const HEAD_WIDTH = 0.6;
const HEAD_HEIGHT = 1.7;
const HEAD_DEPTH = 0.45;
const HEAD_ABOVE_ARM = 0.25; // share of the head's height above the arm
const LAMP_RADIUS = 0.22;
const LAMP_SPACING = 0.55;
const LAMP_DEPTH = 0.06; // how far a lamp sticks out of the shell
const LAMP_SIDES = 12;
const POLE_COLOR: Vec3 = [0.6, 0.62, 0.64];
const SHELL_COLOR: Vec3 = [0.85, 0.65, 0.1];
// Top to bottom: red, yellow, green. Built lit; the shader dims the ones that are off.
const LAMP_COLORS: Vec3[] = [
  [1, 0.1, 0.05],
  [1, 0.75, 0.1],
  [0.1, 1, 0.4],
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

export function trafficLightVertices(light: TrafficLight): number[] {
  const { junction, x, z, armX, armZ, facingX, facingZ, heads, walkSignals } = light;
  const pole = TRAFFIC_LIGHT_POLE_WIDTH / 2;
  const walkY = CURB_HEIGHT + WALK_HEIGHT;
  const top = CURB_HEIGHT + (heads.length > 0 ? TRAFFIC_LIGHT_POLE_HEIGHT : WALK_POLE_HEIGHT);
  const vertices = box([x - pole, CURB_HEIGHT, z - pole], [x + pole, top, z + pole], POLE_COLOR);
  // Lamps facing ±z face traffic on the column road. Walk lights facing ±z stand at the ends of a crosswalk
  // over the row road, so the people using them walk alongside the column road.
  for (const { facingX: walkX, facingZ: walkZ } of walkSignals) {
    const direction: Vec3 = [walkX, 0, walkZ];
    const out = (distance: number): Vec3 => [x + walkX * distance, walkY, z + walkZ * distance];
    const front = pole + WALK_DEPTH;
    vertices.push(
      ...facingBox(out(pole + WALK_DEPTH / 2), direction, WALK_SIZE, WALK_SIZE, WALK_DEPTH, WALK_BOX_COLOR),
      ...facingBox(out(front + WALK_PANEL_DEPTH / 2), direction, WALK_PANEL, WALK_PANEL, WALK_PANEL_DEPTH, WALK_PANEL_COLOR),
    );
    // Both symbols in the same spot; the shader hides the one that is off.
    const symbol = (rows: string[], color: Vec3, lamp: number) =>
      withId(
        pixelArt(rows, out(front + WALK_PANEL_DEPTH), direction, WALK_PIXEL, WALK_PANEL_DEPTH, color, 1),
        signalId(junction, walkZ !== 0, lamp),
      );
    vertices.push(...symbol(WALKER, WALKER_COLOR, WALKER_LAMP), ...symbol(HAND, HAND_COLOR, HAND_LAMP));
  }
  if (heads.length === 0) return vertices;

  const armY = top + BEND_RISE;
  const bend: Vec3 = [x + armX * BEND_REACH, armY, z + armZ * BEND_REACH];
  // The flat part starts half a thickness early to fill the gap at the bend,
  // and stops flush with the far side of the furthest head.
  const flatStart = BEND_REACH - ARM_THICKNESS / 2;
  const armEnd = Math.max(...heads) + HEAD_WIDTH / 2;
  vertices.push(
    ...beam([x, top - ARM_THICKNESS / 2, z], bend, ARM_THICKNESS, POLE_COLOR),
    ...beam([x + armX * flatStart, armY, z + armZ * flatStart], [x + armX * armEnd, armY, z + armZ * armEnd], ARM_THICKNESS, POLE_COLOR),
  );

  const facing: Vec3 = [facingX, 0, facingZ];
  const centreY = armY + ARM_THICKNESS / 2 + HEAD_HEIGHT * HEAD_ABOVE_ARM - HEAD_HEIGHT / 2;
  const headOffset = ARM_THICKNESS / 2 + HEAD_DEPTH / 2;
  for (const distance of heads) {
    const centreX = x + armX * distance + facingX * headOffset;
    const centreZ = z + armZ * distance + facingZ * headOffset;
    vertices.push(...facingBox([centreX, centreY, centreZ], facing, HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, SHELL_COLOR));
    const frontX = centreX + (facingX * HEAD_DEPTH) / 2;
    const frontZ = centreZ + (facingZ * HEAD_DEPTH) / 2;
    LAMP_COLORS.forEach((color, i) => {
      const lampY = centreY + (1 - i) * LAMP_SPACING;
      const lamp = disc([frontX, lampY, frontZ], facing, LAMP_RADIUS, 2 * LAMP_DEPTH, LAMP_SIDES, color, 1);
      vertices.push(...withId(lamp, signalId(junction, facingZ !== 0, RED + i)));
    });
  }

  return vertices;
}
