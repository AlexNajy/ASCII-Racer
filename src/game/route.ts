import { CAR_LENGTH } from './car.ts';
import { directionFrom, otherEnd, turnBetween, type Point, type RoadGraph, type RoadSegment, type Turn } from './roadGraph.ts';
import { blockSeed, createRandom } from '../math/random.ts';

// Driving distances along the centre lines, metres. Medium is about 60 to 90 s at a good pace (top speed 32 m/s,
// slower through turns); the test driver will tune them.
export const ROUTE_LENGTHS = { short: 1400, medium: 2000, long: 2800 } as const;
export type RouteLengthName = keyof typeof ROUTE_LENGTHS;
export const ROUTE_LENGTH = ROUTE_LENGTHS.medium;
export const ROUTE_LENGTH_TOLERANCE = 100; // m either way

export const START_GRID_LENGTH = 30; // m of straight road behind the start line, clear of the junction: 2 × 4 cars
const START_LINE_MARGIN = 10; // m from the start line to the junction square ahead
const FINISH_MARGIN = 10; // m from the finish line to either junction square
export const START_POSE_BEHIND = CAR_LENGTH; // m from the start line back to the car's centre

export const GATE_SPACING = 300; // m, the most route between two gates (start line included) along straights
const GATE_CLEAR_FRACTION = 0.5; // where on a segment's clear stretch its gate stands

// Weights for the way out of a junction. Left and right share one, so they balance.
const STRAIGHT_WEIGHT = 8;
const TURN_WEIGHT = 1;
const RING_WEIGHT = 0.3; // times the above for a segment of the ring road
export const MAX_RING_RUN = 3; // ring segments in a row

const SEARCH_STEPS = 20000; // candidates tried per attempt before giving up on it
const MAX_ATTEMPTS = 8;
export const ROUTE_SEED_INDEX = 1 << 25; // above every city generator's index; attempts add 0, 1, 2...

const HALF_PI = Math.PI / 2;

export interface RouteOptions {
  length: number; // target, metres
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { length: ROUTE_LENGTH };

// One segment of the route, driven from `from` to `to`.
export interface RouteLeg {
  segment: number;
  from: number;
  to: number;
  direction: Point; // unit step along an axis
  turn: Turn; // at `from`, coming off the previous leg; 'straight' for the first
  ring: boolean;
  avenue: boolean;
}

// A line across the road, crossed along `direction`.
export interface Gate {
  leg: number;
  segment: number;
  point: Point; // on the centre line
  direction: Point;
  width: number; // of the road, kerb to kerb
  distance: number; // m along the route from the start line
}

export interface StartPose {
  x: number;
  z: number;
  quarterTurns: number; // -1, 0, 1 or 2
  heading: number; // quarterTurns × π/2, in car.ts's convention: 0 faces -Z, positive turns left
}

export interface Route {
  seed: number;
  target: number;
  legs: RouteLeg[];
  junctions: number[]; // passed through, in order (one fewer than legs; may repeat where the route crosses itself)
  start: Gate; // the start line, distance 0
  pose: StartPose;
  gates: Gate[]; // checkpoints in order, the finish last
  length: number; // m from the start line to the finish line along the centre lines
  polyline: Point[]; // start line, every junction passed, finish line
  attempts: number; // 1 unless an attempt's search ran out
  backtracks: number; // over all attempts
}

interface Frame {
  segment: number;
  exit: number; // the junction this leg arrives at
  options: number[]; // segments still to try after it, best first
  ringRun: number;
}

function isRing(graph: RoadGraph, segment: RoadSegment): boolean {
  const last = graph.nodes[graph.nodes.length - 1].row;
  const a = graph.nodes[segment.a];
  return segment.axis === 'x' ? a.row === 0 || a.row === last : a.column === 0 || a.column === last;
}

// Offsets from `entry` along the segment where its clear stretch begins and ends.
function clearRange(segment: RoadSegment, entry: number): [number, number] {
  const along = (p: Point) => (segment.axis === 'x' ? p.x : p.z);
  const lo = entry === segment.a ? along(segment.clearStart) - along(segment.start) : along(segment.end) - along(segment.clearEnd);
  return [lo, lo + segment.clearLength];
}

function finishRange(segment: RoadSegment, entry: number): [number, number] {
  const [lo, hi] = clearRange(segment, entry);
  return [lo + FINISH_MARGIN, hi - FINISH_MARGIN];
}

function startRange(segment: RoadSegment, entry: number): [number, number] {
  const [lo, hi] = clearRange(segment, entry);
  return [lo + START_GRID_LENGTH, hi - START_LINE_MARGIN];
}

function pointFrom(graph: RoadGraph, node: number, direction: Point, offset: number): Point {
  const { x, z } = graph.nodes[node];
  return { x: x + direction.x * offset, z: z + direction.z * offset };
}

// Heading 0 faces -Z and positive turns left, so west is a quarter turn and east minus one.
function quarterTurnsOf(direction: Point): number {
  if (direction.z < 0) return 0;
  if (direction.x < 0) return 1;
  if (direction.z > 0) return 2;
  return -1;
}

export class RouteError extends Error {}

// A path from a seed: a walk from a random segment (never on the ring) that never uses a segment twice, picking
// each way out of a junction by weight and backtracking when it gets stuck or overshoots. It may cross its own
// path at a junction. It stops as soon as start and finish can be placed on the clear stretches of the first
// and last segments for the target length, or failing that a length within the tolerance above it. Throws a RouteError if the graph can't hold it.
export function generateRoute(graph: RoadGraph, seed: number, options: RouteOptions = DEFAULT_ROUTE_OPTIONS): Route {
  const target = options.length;
  const total = graph.segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total < target - ROUTE_LENGTH_TOLERANCE) throw new RouteError(`the roads add up to ${total} m, less than the ${target} m route`);
  const ring = graph.segments.map((segment) => isRing(graph, segment));
  const starts = graph.segments.filter((segment) => !ring[segment.index]);
  if (starts.length === 0) throw new RouteError('no segment off the ring road to start on');

  let backtracks = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const random = createRandom(blockSeed(seed, ROUTE_SEED_INDEX + attempt));
    const first = starts[Math.min(starts.length - 1, Math.floor(random() * starts.length))];
    const forwards = random() < 0.5;
    const entry = forwards ? first.a : first.b;
    const [startLo, startHi] = startRange(first, entry);
    const found = search(graph, ring, random, first, entry, target);
    backtracks += found.backtracks;
    if (startLo > startHi || !found.frames) continue;
    return buildRoute(graph, ring, random, seed, target, entry, found.frames, attempt + 1, backtracks);
  }
  throw new RouteError(`no ${target} m route found in ${MAX_ATTEMPTS} attempts`);
}

function search(
  graph: RoadGraph,
  ring: boolean[],
  random: () => number,
  first: RoadSegment,
  entry: number,
  target: number,
): { frames: Frame[] | null; backtracks: number } {
  const used = new Uint8Array(graph.segments.length);
  const [startLo, startHi] = startRange(first, entry);
  const hi = target + ROUTE_LENGTH_TOLERANCE;

  const optionsAt = (segment: number, exit: number, ringRun: number): number[] => {
    const candidates = graph.links[exit]
      .filter((link) => used[link.segment] === 0 && !(ring[link.segment] && ringRun >= MAX_RING_RUN))
      .map((link) => {
        const turn = turnBetween(graph, segment, link.segment, exit);
        return { segment: link.segment, weight: (turn === 'straight' ? STRAIGHT_WEIGHT : TURN_WEIGHT) * (ring[link.segment] ? RING_WEIGHT : 1) };
      });
    const order: number[] = [];
    while (candidates.length > 0) {
      const sum = candidates.reduce((s, c) => s + c.weight, 0);
      let pick = random() * sum;
      let index = 0;
      while (index < candidates.length - 1 && pick >= candidates[index].weight) pick -= candidates[index++].weight;
      order.push(candidates[index].segment);
      candidates.splice(index, 1);
    }
    return order;
  };

  const exit = otherEnd(graph, first.index, entry);
  used[first.index] = 1;
  const frames: Frame[] = [{ segment: first.index, exit, options: optionsAt(first.index, exit, 0), ringRun: 0 }];
  let middle = 0; // full lengths of every leg after the first
  let backtracks = 0;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const top = frames[frames.length - 1];
    const next = top.options.shift();
    if (next === undefined) {
      frames.pop();
      backtracks++;
      if (frames.length === 0) return { frames: null, backtracks };
      used[top.segment] = 0;
      middle -= graph.segments[top.segment].length;
      continue;
    }
    const segment = graph.segments[next];
    const [finishLo, finishHi] = finishRange(segment, top.exit);
    const shortest = first.length - startHi + middle + finishLo;
    const longest = first.length - startLo + middle + finishHi;
    if (shortest > hi) continue;
    const ringRun = ring[next] ? top.ringRun + 1 : 0;
    const nextExit = otherEnd(graph, next, top.exit);
    if (longest >= target) {
      frames.push({ segment: next, exit: nextExit, options: [], ringRun });
      return { frames, backtracks };
    }
    used[next] = 1;
    middle += segment.length;
    frames.push({ segment: next, exit: nextExit, options: optionsAt(next, nextExit, ringRun), ringRun });
  }
  return { frames: null, backtracks };
}

function buildRoute(
  graph: RoadGraph,
  ring: boolean[],
  random: () => number,
  seed: number,
  target: number,
  entry: number,
  frames: Frame[],
  attempts: number,
  backtracks: number,
): Route {
  const legs: RouteLeg[] = [];
  let from = entry;
  frames.forEach(({ segment, exit }, i) => {
    const turn = i === 0 ? 'straight' : turnBetween(graph, frames[i - 1].segment, segment, from);
    const { avenue } = graph.segments[segment];
    legs.push({ segment, from, to: exit, direction: directionFrom(graph, segment, from), turn, ring: ring[segment], avenue });
    from = exit;
  });
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const first = graph.segments[firstLeg.segment];
  const last = graph.segments[lastLeg.segment];
  const middle = legs.slice(1, -1).reduce((sum, leg) => sum + graph.segments[leg.segment].length, 0);

  // total = first.length - start + middle + finish. Hit the target exactly where possible, else the nearest end.
  const [startLo, startHi] = startRange(first, firstLeg.from);
  const [finishLo, finishHi] = finishRange(last, lastLeg.from);
  const base = first.length + middle;
  const exactLo = Math.max(startLo, finishLo + base - target);
  const exactHi = Math.min(startHi, finishHi + base - target);
  const roll = random();
  let start: number;
  let finish: number;
  if (exactLo <= exactHi) {
    start = exactLo + (exactHi - exactLo) * roll;
    finish = target - base + start;
  } else if (base - startHi + finishLo > target) {
    [start, finish] = [startHi, finishLo];
  } else {
    [start, finish] = [startLo, finishHi];
  }

  const startPoint = pointFrom(graph, firstLeg.from, firstLeg.direction, start);
  const finishPoint = pointFrom(graph, lastLeg.from, lastLeg.direction, finish);
  const polyline = [startPoint, ...legs.slice(0, -1).map(({ to }) => ({ x: graph.nodes[to].x, z: graph.nodes[to].z })), finishPoint];
  const length = polyline.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - polyline[i].x) + Math.abs(p.z - polyline[i].z), 0);

  const gate = (leg: number, point: Point, distance: number): Gate => {
    const { segment, direction } = legs[leg];
    return { leg, segment, point, direction, width: graph.segments[segment].width, distance };
  };
  // A gate stands on every leg turned into, and on a straight leg when the next leg's gate spot would be too far.
  const spots: Gate[] = [];
  let legStart = first.length - start; // route distance at the current leg's `from`
  for (let i = 1; i < legs.length - 1; i++) {
    const leg = legs[i];
    const [lo, hi] = clearRange(graph.segments[leg.segment], leg.from);
    const offset = lo + (hi - lo) * GATE_CLEAR_FRACTION;
    spots.push(gate(i, pointFrom(graph, leg.from, leg.direction, offset), legStart + offset));
    legStart += graph.segments[leg.segment].length;
  }
  const finishGate = gate(legs.length - 1, finishPoint, length);
  spots.push(finishGate);
  const gates: Gate[] = [];
  let lastGate = 0;
  spots.slice(0, -1).forEach((spot, i) => {
    if (legs[spot.leg].turn === 'straight' && spots[i + 1].distance - lastGate <= GATE_SPACING) return;
    gates.push(spot);
    lastGate = spot.distance;
  });
  gates.push(finishGate);

  const quarterTurns = quarterTurnsOf(firstLeg.direction);
  const posePoint = pointFrom(graph, firstLeg.from, firstLeg.direction, start - START_POSE_BEHIND);
  return {
    seed,
    target,
    legs,
    junctions: legs.slice(0, -1).map(({ to }) => to),
    start: gate(0, startPoint, 0),
    pose: { ...posePoint, quarterTurns, heading: quarterTurns * HALF_PI },
    gates,
    length,
    polyline,
    attempts,
    backtracks,
  };
}
