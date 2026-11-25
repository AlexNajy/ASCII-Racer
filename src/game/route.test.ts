import { beforeAll, describe, expect, it } from 'vitest';
import { CAR_WIDTH } from './car.ts';
import { DEFAULT_CITY_SETTINGS, generateCity, type CitySettings, type Rect } from './city.ts';
import type { Collider } from './collision.ts';
import { Hasher } from './referenceRun.ts';
import { otherEnd, roadGraph, turnBetween, type Point, type RoadGraph, type RoadSegment } from './roadGraph.ts';
import {
  GATE_SPACING,
  generateRoute,
  MAX_RING_RUN,
  ROUTE_LENGTH,
  ROUTE_LENGTH_TOLERANCE,
  ROUTE_LENGTHS,
  RouteError,
  START_GRID_LENGTH,
  START_POSE_BEHIND,
  type Gate,
  type Route,
} from './route.ts';
import { generateCityData } from './world.ts';
import { cos, sin } from '../math/deterministic.ts';

// 250 cities with 4 routes each: the route seed is the city seed first (as the daily uses it), then others.
const CITY_COUNT = 250;
const ROUTES_PER_CITY = 4;
const ROUTE_SEED_STEP = 1000;
const EPSILON = 1e-6; // m
const OVERLAP_TOLERANCE = 0.01; // m, as in cityRules.test.ts
const GATE_DEPTH = 0.5; // m of road along the gate checked for colliders
const MIN_TURN_SHARE = 0.1;
const MAX_TURN_SHARE = 0.8;
const SIDE_BALANCE = 0.05; // left share of all turns within this of a half

interface Case {
  graph: RoadGraph;
  colliders: Collider[];
}

function cityCase(settings: CitySettings): Case {
  const data = generateCityData(settings, false);
  return { graph: data.roadGraph, colliders: data.colliders };
}

const along = (segment: RoadSegment, p: Point) => (segment.axis === 'x' ? p.x : p.z);
const across = (segment: RoadSegment, p: Point) => (segment.axis === 'x' ? p.z : p.x);

// Whether `p` is on the segment's centre line inside its clear stretch, with `before` and `after` metres to spare.
function onClearStretch(segment: RoadSegment, p: Point, before = 0, after = 0, direction = 1): boolean {
  if (Math.abs(across(segment, p) - across(segment, segment.start)) > EPSILON) return false;
  const lo = along(segment, segment.clearStart);
  const hi = along(segment, segment.clearEnd);
  const at = along(segment, p);
  const [back, ahead] = direction > 0 ? [before, after] : [after, before];
  return at - back >= lo - EPSILON && at + ahead <= hi + EPSILON;
}

function overlaps(a: Rect, b: Rect): boolean {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > OVERLAP_TOLERANCE && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > OVERLAP_TOLERANCE;
}

function corridor(from: Point, to: Point, half: number): Rect {
  return { minX: Math.min(from.x, to.x) - half, maxX: Math.max(from.x, to.x) + half, minZ: Math.min(from.z, to.z) - half, maxZ: Math.max(from.z, to.z) + half };
}

function gateSpan(gate: Gate): Rect {
  const depth = GATE_DEPTH / 2;
  const half = gate.width / 2;
  const { x, z } = gate.point;
  return gate.direction.x !== 0
    ? { minX: x - depth, maxX: x + depth, minZ: z - half, maxZ: z + half }
    : { minX: x - half, maxX: x + half, minZ: z - depth, maxZ: z + depth };
}

const sign = (d: Point) => (d.x !== 0 ? d.x : d.z);

// Everything wrong with a route, as readable lines.
function problems({ graph, colliders }: Case, route: Route): string[] {
  const out: string[] = [];
  const { legs, gates, polyline } = route;
  const segmentOf = (leg: number) => graph.segments[legs[leg].segment];

  if (legs.length < 2) out.push(`only ${legs.length} leg`);
  const seen = new Set<number>();
  let ringRun = 0;
  legs.forEach((leg, i) => {
    if (seen.has(leg.segment)) out.push(`segment ${leg.segment} used twice`);
    seen.add(leg.segment);
    if (otherEnd(graph, leg.segment, leg.from) !== leg.to) out.push(`leg ${i} doesn't run between its junctions`);
    if (i > 0 && leg.from !== legs[i - 1].to) out.push(`leg ${i} doesn't start where leg ${i - 1} ends`);
    const n = graph.nodes;
    const step = { x: Math.sign(n[leg.to].x - n[leg.from].x), z: Math.sign(n[leg.to].z - n[leg.from].z) };
    if (leg.direction.x !== step.x || leg.direction.z !== step.z) out.push(`leg ${i} direction is not its travel direction`);
    if (i > 0) {
      const turn = turnBetween(graph, legs[i - 1].segment, leg.segment, leg.from);
      if (turn === 'uTurn') out.push(`U-turn into leg ${i}`);
      if (turn !== leg.turn) out.push(`leg ${i} says ${leg.turn}, is ${turn}`);
    }
    ringRun = leg.ring ? ringRun + 1 : 0;
    if (ringRun > MAX_RING_RUN) out.push(`more than ${MAX_RING_RUN} ring segments in a row at leg ${i}`);
    if (leg.avenue !== graph.segments[leg.segment].avenue) out.push(`leg ${i} avenue flag wrong`);
  });
  if (legs[0].ring) out.push('starts on the ring');
  if (route.junctions.length !== legs.length - 1 || route.junctions.some((j, i) => j !== legs[i].to)) out.push('junctions are not the legs’ ends');

  if (Math.abs(route.length - route.target) > ROUTE_LENGTH_TOLERANCE) out.push(`length ${route.length} outside ${route.target} ± ${ROUTE_LENGTH_TOLERANCE}`);

  // Polyline: from the start line through every junction to the finish, axis-aligned, as long as the route.
  if (polyline.length !== legs.length + 1) out.push('polyline has the wrong number of points');
  let polylineLength = 0;
  polyline.slice(1).forEach((p, i) => {
    const q = polyline[i];
    if (p.x !== q.x && p.z !== q.z) out.push(`polyline piece ${i} is not axis-aligned`);
    polylineLength += Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
  });
  route.junctions.forEach((j, i) => {
    if (polyline[i + 1].x !== graph.nodes[j].x || polyline[i + 1].z !== graph.nodes[j].z) out.push(`polyline point ${i + 1} is not junction ${j}`);
  });
  if (Math.abs(polylineLength - route.length) > EPSILON) out.push(`polyline is ${polylineLength} m, route ${route.length} m`);
  const distanceTo = (leg: number, p: Point) => {
    let d = 0;
    for (let i = 0; i < leg; i++) d += Math.abs(polyline[i + 1].x - polyline[i].x) + Math.abs(polyline[i + 1].z - polyline[i].z);
    return d + Math.abs(p.x - polyline[leg].x) + Math.abs(p.z - polyline[leg].z);
  };

  // Start: the line and the grid behind it on the first segment's clear stretch, the car behind the line.
  const { start, pose } = route;
  const first = segmentOf(0);
  const forward = sign(legs[0].direction);
  if (start.leg !== 0 || start.segment !== first.index || start.distance !== 0) out.push('start is not on the first leg');
  if (start.point.x !== polyline[0].x || start.point.z !== polyline[0].z) out.push('polyline does not begin at the start line');
  if (!onClearStretch(first, start.point, START_GRID_LENGTH, 0, forward)) out.push('start grid not on the clear stretch');
  if (start.direction !== legs[0].direction) out.push('start direction');
  const behind = { x: start.point.x - legs[0].direction.x * START_POSE_BEHIND, z: start.point.z - legs[0].direction.z * START_POSE_BEHIND };
  if (Math.abs(pose.x - behind.x) > EPSILON || Math.abs(pose.z - behind.z) > EPSILON) out.push('car is not behind the start line');
  if (pose.heading !== pose.quarterTurns * (Math.PI / 2)) out.push('heading is not a whole number of quarter turns');
  if (-sin(pose.heading) + 0 !== legs[0].direction.x || -cos(pose.heading) + 0 !== legs[0].direction.z) out.push('heading does not face the travel direction');

  // Gates: in order, one leg each at most, on clear stretches, facing the travel direction, the finish last.
  let previous = 0;
  let previousLeg = 0;
  gates.forEach((gate, i) => {
    const leg = legs[gate.leg];
    if (!leg || gate.segment !== leg.segment) {
      out.push(`gate ${i} is not on its leg`);
      return;
    }
    if (i > 0 && gate.leg <= previousLeg) out.push(`gate ${i} is out of order`);
    if (gate.leg === 0) out.push(`gate ${i} is on the start segment`);
    if (!onClearStretch(graph.segments[gate.segment], gate.point)) out.push(`gate ${i} is not on a clear stretch`);
    if (gate.direction !== leg.direction) out.push(`gate ${i} faces the wrong way`);
    if (gate.width !== graph.segments[gate.segment].width) out.push(`gate ${i} width`);
    const distance = distanceTo(gate.leg, gate.point);
    if (Math.abs(distance - gate.distance) > EPSILON) out.push(`gate ${i} distance ${gate.distance}, along the route ${distance}`);
    if (gate.distance - previous > GATE_SPACING + EPSILON) out.push(`${gate.distance - previous} m without a gate before gate ${i}`);
    previous = gate.distance;
    previousLeg = gate.leg;
  });
  const finish = gates[gates.length - 1];
  if (finish.leg !== legs.length - 1) out.push('the finish is not on the last leg');
  if (finish.point.x !== polyline[polyline.length - 1].x || finish.point.z !== polyline[polyline.length - 1].z) out.push('polyline does not end at the finish');
  if (Math.abs(finish.distance - route.length) > EPSILON) out.push('finish distance is not the length');
  legs.forEach((leg, i) => {
    if (leg.turn !== 'straight' && !gates.some((gate) => gate.leg === i)) out.push(`no gate after the ${leg.turn} turn into leg ${i}`);
  });

  const turns = legs.filter((leg) => leg.turn !== 'straight').length;
  const share = turns / route.junctions.length;
  if (share < MIN_TURN_SHARE || share > MAX_TURN_SHARE) out.push(`turn share ${share.toFixed(2)}`);

  // Nothing solid in a car-wide corridor along the route or in a gate's span.
  polyline.slice(1).forEach((p, i) => {
    const rect = corridor(polyline[i], p, CAR_WIDTH / 2);
    for (const c of colliders) if (overlaps(c.rect, rect)) out.push(`collider in the corridor of piece ${i}`);
  });
  gates.forEach((gate, i) => {
    const rect = gateSpan(gate);
    for (const c of colliders) if (overlaps(c.rect, rect)) out.push(`collider in the span of gate ${i}`);
  });
  return out;
}

function settings(overrides: Partial<CitySettings>): CitySettings {
  return { ...DEFAULT_CITY_SETTINGS, ...overrides };
}

describe('routes over 1000 seeds', { timeout: 30000 }, () => {
  const routes: { seed: number; route: Route }[] = [];
  const failures: string[] = [];
  beforeAll(() => {
    for (let seed = 1; seed <= CITY_COUNT; seed++) {
      const city = cityCase(settings({ seed }));
      for (let r = 0; r < ROUTES_PER_CITY; r++) {
        const routeSeed = seed + r * ROUTE_SEED_STEP;
        const route = generateRoute(city.graph, routeSeed);
        routes.push({ seed, route });
        for (const problem of problems(city, route)) failures.push(`city ${seed} route ${routeSeed}: ${problem}`);
      }
    }
  }, 30000);

  it('makes every route valid: connected, no segment twice, no U-turn, in length, gates and start in place, nothing in the way', () => {
    expect(routes).toHaveLength(CITY_COUNT * ROUTES_PER_CITY);
    expect(failures).toEqual([]);
  });

  it('aims at the target length', () => {
    for (const { route } of routes) expect(route.target).toBe(ROUTE_LENGTH);
    const mean = routes.reduce((sum, { route }) => sum + route.length, 0) / routes.length;
    expect(Math.abs(mean - ROUTE_LENGTH)).toBeLessThan(ROUTE_LENGTH_TOLERANCE / 4);
  });

  it('turns left about as often as right', () => {
    let left = 0;
    let right = 0;
    for (const { route } of routes) {
      for (const leg of route.legs) {
        if (leg.turn === 'left') left++;
        if (leg.turn === 'right') right++;
      }
    }
    expect(Math.abs(left / (left + right) - 0.5)).toBeLessThan(SIDE_BALANCE);
  });
});

describe('route determinism', () => {
  const city = cityCase(settings({ seed: 1 }));

  it('gives the same route for the same graph and seed', () => {
    for (const seed of [1, 2, 99]) {
      expect(generateRoute(roadGraph(generateCity(settings({ seed: 1 }))), seed)).toEqual(generateRoute(city.graph, seed));
    }
  });

  it('gives different routes for different seeds', () => {
    const keys = new Set<string>();
    const SEEDS = 100;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const route = generateRoute(city.graph, seed);
      keys.add(JSON.stringify([route.legs.map((l) => l.segment), route.start.point]));
    }
    expect(keys.size).toBeGreaterThanOrEqual(SEEDS - 2);
  });

  // Update on purpose only: the daily route of a day must never change by accident.
  const REFERENCE_ROUTES: [number, number, number][] = [
    // city seed, route seed, hash
    [1, 1, 563025338],
    [42, 42, 3449126921],
    [7, 12345, 926552218],
  ];

  it.each(REFERENCE_ROUTES)('matches the stored digest for city %i route %i', (citySeed, routeSeed, stored) => {
    const route = generateRoute(roadGraph(generateCity(settings({ seed: citySeed }))), routeSeed);
    const hasher = new Hasher();
    for (const leg of route.legs) hasher.numbers([leg.segment, leg.from, leg.to]);
    hasher.numbers([route.start.point.x, route.start.point.z, route.pose.x, route.pose.z, route.pose.heading, route.length]);
    for (const gate of route.gates) hasher.numbers([gate.leg, gate.point.x, gate.point.z, gate.direction.x, gate.direction.z, gate.width]);
    const hash = hasher.value;
    expect(
      hash,
      [
        `Route digest for city ${citySeed}, route seed ${routeSeed} changed (${hash}, stored ${stored}).`,
        'Route generation or the road graph now gives different routes. That is only fine if it was meant:',
        'the daily route of a day changes, so runs recorded before it no longer replay on the same route.',
        'If it was meant, replace the numbers in REFERENCE_ROUTES in src/game/route.test.ts',
        '(and bump the simulation version once it exists). If not, find what changed the routes.',
      ].join('\n'),
    ).toBe(stored);
  });
});

describe('routes in other city sizes and lengths', { timeout: 30000 }, () => {
  const SIZE_SEEDS = 20;
  const ROUTES_PER_SIZE_CITY = 2;
  for (const blocksPerSide of [6, 10]) {
    let cities: { seed: number; city: Case }[] = [];
    beforeAll(() => {
      cities = Array.from({ length: SIZE_SEEDS }, (_, i) => ({ seed: i + 1, city: cityCase(settings({ seed: i + 1, blocksPerSide })) }));
    }, 30000);
    for (const [name, length] of Object.entries(ROUTE_LENGTHS)) {
      it(`makes valid ${name} routes in ${blocksPerSide}×${blocksPerSide} cities`, () => {
        const failed: string[] = [];
        for (const { seed, city } of cities) {
          for (let r = 0; r < ROUTES_PER_SIZE_CITY; r++) {
            const route = generateRoute(city.graph, seed + r * ROUTE_SEED_STEP, { length });
            expect(route.target).toBe(length);
            for (const problem of problems(city, route)) failed.push(`city ${seed} route ${r}: ${problem}`);
          }
        }
        expect(failed).toEqual([]);
      });
    }
  }

  it('throws a RouteError when the city is too small for the route', () => {
    const tiny = roadGraph(generateCity(settings({ seed: 1, blocksPerSide: 3 })));
    expect(() => generateRoute(tiny, 1, { length: ROUTE_LENGTHS.long })).toThrow(RouteError);
    // Enough road in total, but no single trail through it is that long: the search gives up.
    const small = roadGraph(generateCity(settings({ seed: 1, blocksPerSide: 4 })));
    expect(small.segments.reduce((sum, s) => sum + s.length, 0)).toBeGreaterThan(ROUTE_LENGTHS.long);
    expect(() => generateRoute(small, 1, { length: ROUTE_LENGTHS.long })).toThrow(RouteError);
  });
});
