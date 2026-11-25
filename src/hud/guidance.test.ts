import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity, type CitySettings } from '../game/city.ts';
import { createRace, type Race } from '../game/race.ts';
import { roadGraph, type Point, type RoadGraph } from '../game/roadGraph.ts';
import { generateRoute, type Route } from '../game/route.ts';
import { blockSeed, createRandom } from '../math/random.ts';
import { bearingTo, routeGuidance, type Guidance, type GuidanceCar } from './guidance.ts';

const HALF_PI = Math.PI / 2;
const BEFORE_GATE = 10; // m behind a gate where a test puts the car
const FAR = 1000; // m, well outside any test city, so on no leg

// The walk: every metre of every leg of WALK_CITIES × WALK_ROUTE_SEEDS routes, on the centre line and WALK_OFFSET
// to each side, heading along the leg and jittered by up to WALK_JITTER.
const WALK_CITIES = 60;
const WALK_ROUTE_SEEDS = [1, 7, 13, 29];
const WALK_STEP = 1; // m
const WALK_OFFSET = 3; // m
const WALK_JITTER = 0.05; // rad
const GATE_CLEARANCE = 0.5; // m either side of a gate's line where the next gate is ambiguous, not walked
const WALK_SEED_INDEX = 77;

const CITIES: Partial<CitySettings>[] = [{}, { seed: 5 }, { seed: 9, avenueDensity: 1 }, { blocksPerSide: 10, seed: 3 }];
const ROUTE_SEEDS = [1, 2, 3, 4, 5, 6];

function cases(): { graph: RoadGraph; route: Route }[] {
  return CITIES.flatMap((settings) => {
    const graph = roadGraph(generateCity({ ...DEFAULT_CITY_SETTINGS, ...settings }));
    return ROUTE_SEEDS.map((seed) => ({ graph, route: generateRoute(graph, seed) }));
  });
}
const CASES = cases();

function headingOf(direction: Point): number {
  if (direction.z < 0) return 0;
  if (direction.x < 0) return HALF_PI;
  if (direction.z > 0) return 2 * HALF_PI;
  return -HALF_PI;
}

function running(route: Route, nextGate: number): Race {
  return { ...createRace(route, 0), phase: 'running', nextGate };
}

function onLeg(graph: RoadGraph, route: Route, leg: number, along: number): GuidanceCar {
  const { from, direction } = route.legs[leg];
  const node = graph.nodes[from];
  return { x: node.x + direction.x * along, z: node.z + direction.z * along, heading: headingOf(direction) };
}

// Metres along the route from the start line to each polyline point (start line, junctions, finish line).
function polylineDistances(route: Route): number[] {
  const distances = [0];
  for (let i = 1; i < route.polyline.length; i++) {
    const a = route.polyline[i - 1];
    const b = route.polyline[i];
    distances.push(distances[i - 1] + Math.abs(b.x - a.x) + Math.abs(b.z - a.z));
  }
  return distances;
}

// What a navigator says at `distance` along the route on `leg`, worked out from the polyline: the first turn
// between the car and the next gate's leg, else the gate.
function expected(route: Route, distances: number[], leg: number, distance: number): { next: number; guidance: Guidance } {
  const next = route.gates.findIndex((gate) => gate.distance > distance);
  const gate = route.gates[next];
  for (let later = leg + 1; later <= gate.leg; later++) {
    const { turn } = route.legs[later];
    if (turn !== 'straight') return { next, guidance: { kind: 'turn', turn, distance: distances[later] - distance } };
  }
  return { next, guidance: { kind: 'gate', distance: gate.distance - distance } };
}

function expectGuidance(actual: Guidance | null, wanted: Guidance, where: string): void {
  const same =
    actual !== null &&
    actual.kind === wanted.kind &&
    (actual.kind !== 'turn' || wanted.kind !== 'turn' || actual.turn === wanted.turn) &&
    Math.abs(actual.distance - wanted.distance) < 1e-6;
  if (!same) expect(actual, where).toEqual(wanted);
}

describe('routeGuidance', () => {
  it('says what the route does next at every metre of every leg, beside the centre line and with a wobble', () => {
    let routes = 0;
    let samples = 0;
    for (let city = 0; city < WALK_CITIES; city++) {
      const graph = roadGraph(generateCity({ ...DEFAULT_CITY_SETTINGS, seed: city + 1 }));
      for (const seed of WALK_ROUTE_SEEDS) {
        const route = generateRoute(graph, seed);
        const distances = polylineDistances(route);
        const random = createRandom(blockSeed(seed, WALK_SEED_INDEX + city));
        routes++;
        route.legs.forEach((leg, index) => {
          const start = route.polyline[index];
          const across = { x: -leg.direction.z, z: leg.direction.x };
          const heading = headingOf(leg.direction);
          for (let along = 0; distances[index] + along < distances[index + 1]; along += WALK_STEP) {
            const distance = distances[index] + along;
            if (route.gates.some((gate) => Math.abs(gate.distance - distance) < GATE_CLEARANCE)) continue;
            const { next, guidance } = expected(route, distances, index, distance);
            const race = running(route, next);
            for (const offset of [-WALK_OFFSET, 0, WALK_OFFSET]) {
              const x = start.x + leg.direction.x * along + across.x * offset;
              const z = start.z + leg.direction.z * along + across.z * offset;
              for (const wobble of [0, (2 * random() - 1) * WALK_JITTER]) {
                const where = `city ${city + 1} route ${seed} leg ${index} at ${along} m, offset ${offset}, wobble ${wobble}`;
                expectGuidance(routeGuidance(graph, race, { x, z, heading: heading + wobble }), guidance, where);
                samples++;
              }
            }
          }
        });
      }
    }
    expect(routes).toBeGreaterThanOrEqual(200);
    expect(samples).toBeGreaterThan(1_000_000);
  });

  it('keeps the turn until the junction instead of jumping to the next leg or a bearing (seed 1, route 1)', () => {
    const { graph, route } = CASES[0];
    // The car on `leg`, racing for the gate on the leg after it.
    const at = (leg: number, x: number, z: number, heading: number) => {
      const next = route.gates.findIndex((gate) => gate.leg === leg + 1);
      expect(route.legs[leg + 1].turn).toBe('right');
      return routeGuidance(graph, running(route, next), { x, z, heading });
    };
    // Leg 5, heading north 8 m before the junction at (-296, -148), where the route turns right.
    expect(route.polyline[6]).toEqual({ x: -296, z: -148 });
    expect(at(5, -296, -140, 0)).toEqual({ kind: 'turn', turn: 'right', distance: 8 });
    // Leg 1, heading south 5 m before the junction at (-76, -72), where the route turns right.
    expect(route.polyline[2]).toEqual({ x: -76, z: -72 });
    expect(at(1, -76, -77, Math.PI)).toEqual({ kind: 'turn', turn: 'right', distance: 5 });
  });

  it('says gate ahead with the distance once the car is on the gate leg', () => {
    for (const { graph, route } of CASES) {
      route.gates.forEach((gate, index) => {
        const from = graph.nodes[route.legs[gate.leg].from];
        const gateAlong = Math.abs(gate.point.x - from.x) + Math.abs(gate.point.z - from.z);
        const car = onLeg(graph, route, gate.leg, gateAlong - BEFORE_GATE);
        const guidance = routeGuidance(graph, running(route, index), car);
        expect(guidance?.kind).toBe('gate');
        expect(guidance?.distance).toBeCloseTo(BEFORE_GATE, 9);
      });
    }
  });

  it('points at the gate from off the route, in all four quadrants', () => {
    const { graph, route } = CASES[0];
    const race = running(route, 0);
    const { x, z } = route.gates[0].point;
    const facingNorth = (dx: number, dz: number) => routeGuidance(graph, race, { x: x + dx, z: z + dz, heading: 0 });
    expect(facingNorth(0, FAR)).toEqual({ kind: 'bearing', bearing: 'ahead', distance: FAR });
    expect(facingNorth(FAR, 0)).toMatchObject({ kind: 'bearing', bearing: 'left' });
    expect(facingNorth(-FAR, 0)).toMatchObject({ kind: 'bearing', bearing: 'right' });
    expect(facingNorth(0, -FAR)).toMatchObject({ kind: 'bearing', bearing: 'back' });
  });

  it('falls back to the bearing when the car faces back along its leg', () => {
    for (const { graph, route } of CASES) {
      const next = route.gates.findIndex((gate) => gate.leg >= 1);
      const length = graph.segments[route.legs[1].segment].length;
      const car = onLeg(graph, route, 1, length / 2);
      const guidance = routeGuidance(graph, running(route, next), { ...car, heading: car.heading + Math.PI });
      expect(guidance?.kind).toBe('bearing');
    }
  });

  it('guides from the start pose during the countdown and says nothing once finished', () => {
    const { graph, route } = CASES[0];
    const countdown = createRace(route, 0);
    const turns = route.legs.slice(1, route.gates[0].leg + 1).some((leg) => leg.turn !== 'straight');
    expect(routeGuidance(graph, countdown, route.pose)?.kind).toBe(turns ? 'turn' : 'gate');
    const finished: Race = { ...countdown, phase: 'finished', nextGate: route.gates.length, finishTick: 500 };
    expect(routeGuidance(graph, finished, route.pose)).toBeNull();
  });
});

describe('bearingTo', () => {
  it('turns with the heading: positive heading turns left', () => {
    const car = { x: 0, z: 0, heading: HALF_PI }; // facing west (-X)
    expect(bearingTo(car, -10, 0)).toBe('ahead');
    expect(bearingTo(car, 0, 10)).toBe('left'); // south is left of west
    expect(bearingTo(car, 0, -10)).toBe('right');
    expect(bearingTo(car, 10, 0)).toBe('back');
    expect(bearingTo(car, -10, 4)).toBe('ahead');
    expect(bearingTo(car, -10, 8)).toBe('left');
  });
});
