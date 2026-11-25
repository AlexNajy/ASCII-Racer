import { CURB_HEIGHT } from '../../game/city.ts';
import type { Gate } from '../../game/route.ts';
import type { Vec3 } from '../../math/mat4.ts';
import { MATERIAL } from '../materials.ts';
import { facingBox, pixelArt, withId, withMaterial } from '../shapes.ts';

// Gate IDs, read by the scene vertex shader: GATE_ID_BASE - index for the arch, BEAM_ID_OFFSET further down for
// the beam above it. The shader shows the next gate lit with its beam, dims the ones still to come (no beam)
// and hides the ones passed.
export const GATE_ID_BASE = -10;
export const BEAM_ID_OFFSET = 1000; // more than any route's gates

export function gateId(index: number): number {
  return GATE_ID_BASE - index;
}

export function beamId(index: number): number {
  return GATE_ID_BASE - BEAM_ID_OFFSET - index;
}

// Posts stand at the kerb side of the pavement, about on the street-light pole line, clear of awnings,
// cornices and canopies sticking out from the building line.
export const POST_FROM_CURB = 0.8; // m from the kerb to the post's centre
export const POST_WIDTH = 1; // across the road
const POST_DEPTH = 1;
// Above the street lights' heads (8.1 m), so the header never runs into one standing beside the gate.
const HEADER_BOTTOM = 8.5;
// Tall enough to stay over a cell high 250 m away (a row is about 3.4 m there).
const HEADER_HEIGHT = 5;
const HEADER_DEPTH = 0.8;
const PANEL_BORDER = 0.25; // dark frame around the lit panel
const PANEL_DEPTH = 0.04;
const PANEL_OFFSET = 0.02; // in front of the header, like other flat details
const CHEQUER_ROWS = 2;
// A bar of light rising from the next gate's header, so it shows down the road over the rows of windows.
export const BEAM_TOP = 50;
const BEAM_WIDTH = 6; // about 2.7 columns 300 m away
const BEAM_DEPTH = 1;

export const CHECKPOINT_COLOR: Vec3 = [0.75, 1, 0.25];
export const FINISH_COLOR: Vec3 = [1, 1, 1];
export const FINISH_BEAM_COLOR: Vec3 = [1, 0.6, 1];
const STRUCTURE_COLOR: Vec3 = [0.12, 0.12, 0.14];

// One gate across the road. Only the panel on the side the route comes from is lit, so it shows the way.
export function gateVertices(gate: Gate, index: number, finish: boolean): number[] {
  const { point, direction, width } = gate;
  const facing: Vec3 = [-direction.x, 0, -direction.z];
  const color = finish ? FINISH_COLOR : CHECKPOINT_COLOR;
  const postOffset = width / 2 + POST_FROM_CURB;
  const span = 2 * postOffset + POST_WIDTH;
  const at = (side: number, y: number, forward = 0): Vec3 => [
    point.x + direction.z * side + facing[0] * forward,
    y,
    point.z + direction.x * side + facing[2] * forward,
  ];

  const lit: number[] = [];
  for (const side of [-postOffset, postOffset]) {
    lit.push(...facingBox(at(side, (CURB_HEIGHT + HEADER_BOTTOM) / 2), facing, POST_WIDTH, HEADER_BOTTOM - CURB_HEIGHT, POST_DEPTH, color, 1));
  }
  const headerTop = HEADER_BOTTOM + HEADER_HEIGHT;
  const headerCentre = HEADER_BOTTOM + HEADER_HEIGHT / 2;
  const structure = facingBox(at(0, headerCentre), facing, span, HEADER_HEIGHT, HEADER_DEPTH, STRUCTURE_COLOR);
  const panelWidth = span - 2 * PANEL_BORDER;
  const panelHeight = HEADER_HEIGHT - 2 * PANEL_BORDER;
  const front = HEADER_DEPTH / 2 + PANEL_OFFSET;
  if (finish) {
    const square = panelHeight / CHEQUER_ROWS;
    const columns = Math.floor(panelWidth / square);
    const rows = Array.from({ length: CHEQUER_ROWS }, (_, row) =>
      Array.from({ length: columns }, (_, column) => ((row + column) % 2 === 0 ? '#' : '.')).join(''),
    );
    lit.push(...pixelArt(rows, at(0, headerCentre, HEADER_DEPTH / 2), facing, square, PANEL_OFFSET, color, 1));
  } else {
    lit.push(...facingBox(at(0, headerCentre, front + PANEL_DEPTH / 2), facing, panelWidth, panelHeight, PANEL_DEPTH, color, 1));
  }
  const beamColor = finish ? FINISH_BEAM_COLOR : CHECKPOINT_COLOR;
  const beam = facingBox(at(0, (headerTop + BEAM_TOP) / 2), facing, BEAM_WIDTH, BEAM_TOP - headerTop, BEAM_DEPTH, beamColor, 1);
  return [
    ...withId([...withMaterial(lit, MATERIAL.gate), ...withMaterial(structure, MATERIAL.default)], gateId(index)),
    ...withId(withMaterial(beam, MATERIAL.gateBeam), beamId(index)),
  ];
}

// Every gate of a route in one mesh, the finish last.
export function routeGateVertices(gates: readonly Gate[]): number[] {
  return gates.flatMap((gate, index) => gateVertices(gate, index, index === gates.length - 1));
}
