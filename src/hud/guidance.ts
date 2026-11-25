import { SETBACK } from '../game/buildings.ts';
import type { Race } from '../game/race.ts';
import type { RoadGraph, Turn } from '../game/roadGraph.ts';
import type { Route } from '../game/route.ts';

// What the guidance beside the timer says. On the route, between the last gate passed and the next one, every
// junction is straight through except perhaps the turn onto the next gate's leg (gates stand on every leg turned
// into): before that turn it gives the turn with the metres along the route to its junction, otherwise the metres
// along the route to the gate. Off the route (not on one of those legs facing along it) it points at the gate from
// where the player looks.
export type Bearing = 'ahead' | 'left' | 'right' | 'back';
export type Guidance =
  | { kind: 'turn'; turn: Exclude<Turn, 'straight'>; distance: number } // along the route to the junction centre
  | { kind: 'gate'; distance: number } // along the route to the gate's line
  | { kind: 'bearing'; bearing: Bearing; distance: number }; // straight line to the gate

// Off the route the gate counts as ahead within this angle either side, behind beyond BACK_ANGLE.
export const AHEAD_ANGLE = Math.PI / 6;
export const BACK_ANGLE = (3 * Math.PI) / 4;
// A leg claims the car only when the car faces along it within 45°, so a car still driving straight towards a turn
// is not taken for one already on the leg it turns into.
export const MIN_FACING = Math.SQRT1_2;
// Beside the road a car is still on it out to the building line, like a gate crossing.
const ROAD_MARGIN = SETBACK;

export interface GuidanceCar {
  x: number;
  z: number;
  heading: number; // 0 faces -Z, positive turns left
}

// Where the car is on leg `index`: metres along it from its start junction and across from the centre line.
function onLeg(graph: RoadGraph, route: Route, index: number, car: GuidanceCar): { along: number; inside: boolean } {
  const leg = route.legs[index];
  const segment = graph.segments[leg.segment];
  const from = graph.nodes[leg.from];
  const dx = car.x - from.x;
  const dz = car.z - from.z;
  const along = dx * leg.direction.x + dz * leg.direction.z;
  const across = Math.abs(dx * leg.direction.z - dz * leg.direction.x);
  return { along, inside: along >= 0 && along <= segment.length && across <= segment.width / 2 + ROAD_MARGIN };
}

export function bearingTo(car: GuidanceCar, x: number, z: number): Bearing {
  const dx = x - car.x;
  const dz = z - car.z;
  const forward = -dx * Math.sin(car.heading) - dz * Math.cos(car.heading);
  const left = -dx * Math.cos(car.heading) + dz * Math.sin(car.heading);
  const angle = Math.atan2(left, forward);
  if (Math.abs(angle) <= AHEAD_ANGLE) return 'ahead';
  if (Math.abs(angle) >= BACK_ANGLE) return 'back';
  return angle > 0 ? 'left' : 'right';
}

export function routeGuidance(graph: RoadGraph, race: Race, car: GuidanceCar): Guidance | null {
  const { route, nextGate } = race;
  if (race.phase === 'finished' || nextGate >= route.gates.length) return null;
  const gate = route.gates[nextGate];
  const first = nextGate > 0 ? route.gates[nextGate - 1].leg : 0;
  const gateAlong = (leg: number) => {
    const { from, direction } = route.legs[leg];
    return (gate.point.x - graph.nodes[from].x) * direction.x + (gate.point.z - graph.nodes[from].z) * direction.z;
  };
  // From the gate's leg backwards, so at a junction the leg already turned into wins.
  for (let index = gate.leg; index >= first; index--) {
    const { along, inside } = onLeg(graph, route, index, car);
    if (!inside) continue;
    const { direction } = route.legs[index];
    const facing = -direction.x * Math.sin(car.heading) - direction.z * Math.cos(car.heading);
    if (facing < MIN_FACING) continue;
    if (index === gate.leg) {
      const toGate = gateAlong(index) - along;
      if (toGate > 0) return { kind: 'gate', distance: toGate };
      break;
    }
    let distance = graph.segments[route.legs[index].segment].length - along;
    for (let next = index + 1; next <= gate.leg; next++) {
      const { turn, segment } = route.legs[next];
      if (turn !== 'straight') return { kind: 'turn', turn, distance };
      distance += next === gate.leg ? gateAlong(next) : graph.segments[segment].length;
    }
    return { kind: 'gate', distance };
  }
  return { kind: 'bearing', bearing: bearingTo(car, gate.point.x, gate.point.z), distance: Math.hypot(gate.point.x - car.x, gate.point.z - car.z) };
}
