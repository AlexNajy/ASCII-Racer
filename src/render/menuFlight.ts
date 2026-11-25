import { TICKS_PER_SECOND } from '../game/clock.ts';
import type { Point, RoadGraph } from '../game/roadGraph.ts';
import type { Camera } from './camera.ts';

// The slow flight behind the main menu: round a rectangle of roads about the middle junction, along the centre lines
// above the street lights, the corners rounded off. A pure function of the tick, so a held tick is the same picture.
export const FLIGHT_HEIGHT = 12; // m
export const FLIGHT_SPEED = 8; // m/s
export const FLIGHT_PITCH = (-3 * Math.PI) / 180; // slightly down
export const FLIGHT_REACH = 2; // junctions from the middle one to each side of the rectangle
export const FLIGHT_CORNER_RADIUS = 15; // m

// Straight runs and quarter turns, one after the other, closing on itself.
type Piece =
  | { kind: 'line'; from: Point; direction: Point; length: number }
  | { kind: 'arc'; centre: Point; incoming: Point; outgoing: Point; radius: number; length: number };

export interface FlightPath {
  pieces: Piece[];
  length: number;
}

// Clockwise seen from above (north up): east along the north side, then south, west and north.
export function flightPath(graph: RoadGraph): FlightPath {
  const perRow = Math.round(Math.sqrt(graph.nodes.length));
  const middle = Math.floor(perRow / 2);
  const low = Math.max(0, middle - FLIGHT_REACH);
  const high = Math.min(perRow - 1, middle + FLIGHT_REACH);
  const at = (row: number, column: number): Point => graph.nodes[row * perRow + column];
  const corners = [at(low, low), at(low, high), at(high, high), at(high, low)];
  const sides = corners.map((corner, i) => {
    const next = corners[(i + 1) % 4];
    const length = Math.abs(next.x - corner.x) + Math.abs(next.z - corner.z);
    return { from: corner, length, direction: { x: (next.x - corner.x) / length, z: (next.z - corner.z) / length } };
  });
  const radius = Math.min(FLIGHT_CORNER_RADIUS, ...sides.map((side) => side.length / 2));
  const pieces: Piece[] = [];
  sides.forEach((side, i) => {
    const { from, direction } = side;
    pieces.push({
      kind: 'line',
      from: { x: from.x + direction.x * radius, z: from.z + direction.z * radius },
      direction,
      length: side.length - 2 * radius,
    });
    const outgoing = sides[(i + 1) % 4].direction;
    const corner = sides[(i + 1) % 4].from;
    const centre = { x: corner.x + (outgoing.x - direction.x) * radius, z: corner.z + (outgoing.z - direction.z) * radius };
    pieces.push({ kind: 'arc', centre, incoming: direction, outgoing, radius, length: (Math.PI / 2) * radius });
  });
  return { pieces, length: pieces.reduce((sum, piece) => sum + piece.length, 0) };
}

// Yaw 0 looks down -Z and grows turning left (render/camera.ts).
function yawOf(direction: Point): number {
  return Math.atan2(-direction.x, -direction.z);
}

// The camera at a tick, fractional ticks too so frames between ticks move smoothly.
export function flightPose(path: FlightPath, tick: number): Camera {
  const travelled = (tick / TICKS_PER_SECOND) * FLIGHT_SPEED;
  let along = travelled - Math.floor(travelled / path.length) * path.length;
  const last = path.pieces[path.pieces.length - 1];
  for (const piece of path.pieces) {
    // Rounding may leave a hair past the last piece's end; the last piece takes it.
    if (along > piece.length && piece !== last) {
      along -= piece.length;
      continue;
    }
    if (piece.kind === 'line') {
      const { from, direction } = piece;
      return { position: [from.x + direction.x * along, FLIGHT_HEIGHT, from.z + direction.z * along], yaw: yawOf(direction), pitch: FLIGHT_PITCH };
    }
    const { centre, incoming, outgoing, radius } = piece;
    const angle = along / radius;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = centre.x + (incoming.x * s - outgoing.x * c) * radius;
    const z = centre.z + (incoming.z * s - outgoing.z * c) * radius;
    return { position: [x, FLIGHT_HEIGHT, z], yaw: yawOf({ x: incoming.x * c + outgoing.x * s, z: incoming.z * c + outgoing.z * s }), pitch: FLIGHT_PITCH };
  }
  throw new Error('flight path has no pieces');
}
