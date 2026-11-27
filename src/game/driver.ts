import { wrapAngle, type Car } from './car.ts';
import { NO_INPUT, type CarInput } from './carInput.ts';
import { raceTicks, type RaceEvent } from './race.ts';
import type { Point } from './roadGraph.ts';
import type { Route } from './route.ts';
import { stepWorld, type World } from './world.ts';
import { atan2, cos, hypot, sin } from '../math/deterministic.ts';

// A cautious test driver: follows the route's polyline down the centre lines, aims at a point ahead, brakes to a
// cornering speed before each turn and backs out when stuck. Plain numbers only, so its races are deterministic.

const LOOKAHEAD = 5; // m ahead of the car's place on the route it steers at, standing
const LOOKAHEAD_TIME = 1.0; // s, more lookahead per m/s
const STEER_GAIN = 3; // full lock at 1/3 rad (19°) off the aim
const CORNER_SPEED = 10; // m/s through a 90° turn: grip turns 0.6 rad/s, so a 15 m radius
const AVENUE_CORNER_SPEED = 12; // m/s when both roads at the turn are avenues
const BRAKE_PLANNING = 9; // m/s², braking assumed when planning (full brake gives at least 10)
const BRAKE_EARLY = 6; // m before the junction centre where the cornering speed must be reached
const OFF_AIM_ANGLE = 0.8; // rad off the aim beyond which the car slows to cornering speed
const TURNING_SPEED = 5; // m/s while facing more than a quarter turn away from the aim: the tightest circle
const ADVANCE_WINDOW = 20; // m before a piece's end from where the car may move on to the next
const STALL_SPEED = 1; // m/s
const STALL_TICKS = 45; // this long below the stall speed: back out (or, backing, stop)
const WRONG_WAY_ANGLE = 2; // rad off the aim that, standing, makes the car back round first
const REVERSE_TICKS = 50; // backing out, times the recoveries in a row
const MAX_REVERSE_STEPS = 3;
const TURN_REVERSE_TICKS = 240; // the most backing round to face the aim (a quarter turn takes about 200)
const REVERSE_SPEED = 4; // m/s, the most when backing
const FORWARD_TICKS = 60; // after backing, this long forwards before backing round again
const OFF_ROUTE = 5; // m from the route's line beyond which the car heads straight back to it
const MISSED_BACK = 20; // m before a missed gate the car goes back to
const RECOVERED_DISTANCE = 20; // m of new progress that ends a run of recoveries

export interface DriverState {
  piece: number; // the polyline piece the car is on
  best: number; // furthest progress along the route, m
  slowTicks: number;
  reverseTicks: number; // > 0 while backing out
  turning: boolean; // backing to face the aim, rather than out of something
  forwardTicks: number; // > 0 just after backing
  recoveries: number; // in a row since the last real progress
  missed: boolean; // went past the next gate without it counting
  backOuts: number; // all recoveries so far
}

export function createDriver(): DriverState {
  return { piece: 0, best: 0, slowTicks: 0, reverseTicks: 0, turning: false, forwardTicks: 0, recoveries: 0, missed: false, backOuts: 0 };
}

interface Path {
  points: Point[];
  starts: number[]; // route distance at each point
  turns: number[]; // indices of points where the route turns
  cornerSpeeds: number[]; // per point
}

const paths = new WeakMap<Route, Path>();

function pathOf(route: Route): Path {
  let path = paths.get(route);
  if (path) return path;
  const points = route.polyline;
  const starts = [0];
  for (let i = 1; i < points.length; i++) starts.push(starts[i - 1] + Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].z - points[i - 1].z));
  const turns: number[] = [];
  const cornerSpeeds = points.map(() => CORNER_SPEED);
  route.legs.forEach((leg, i) => {
    if (leg.turn === 'straight') return;
    turns.push(i);
    const avenues = leg.avenue && route.legs[i - 1].avenue;
    cornerSpeeds[i] = avenues ? AVENUE_CORNER_SPEED : CORNER_SPEED;
  });
  path = { points, starts, turns, cornerSpeeds };
  paths.set(route, path);
  return path;
}

// The point on piece `i` nearest to (x, z), as distance along the piece (clamped) and squared distance away.
function nearest(path: Path, i: number, x: number, z: number): [number, number] {
  const a = path.points[i];
  const b = path.points[i + 1];
  const length = path.starts[i + 1] - path.starts[i];
  const dx = (b.x - a.x) / length;
  const dz = (b.z - a.z) / length;
  const t = Math.max(0, Math.min(length, (x - a.x) * dx + (z - a.z) * dz));
  const px = a.x + dx * t - x;
  const pz = a.z + dz * t - z;
  return [t, px * px + pz * pz];
}

// The point `distance` m along the route, continuing straight past the finish.
function pointAt(path: Path, distance: number): Point {
  const { points, starts } = path;
  let i = 0;
  while (i < points.length - 2 && starts[i + 1] <= distance) i++;
  const a = points[i];
  const b = points[i + 1];
  const length = starts[i + 1] - starts[i];
  const t = (distance - starts[i]) / length;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

// Negative when reversing. Heading 0 faces -Z and positive turns left, so forward is (-sin, -cos).
function forwardSpeed(car: Car): number {
  return -car.velocityX * sin(car.heading) - car.velocityZ * cos(car.heading);
}

// This tick's input for the world's car. Updates `state`; call once per tick, before stepWorld.
export function driverInput(world: World, state: DriverState): CarInput {
  const { race, car } = world;
  if (!race || race.phase === 'countdown') return NO_INPUT;
  if (race.phase === 'finished') return { ...NO_INPUT, brake: forwardSpeed(car) > 0 ? 1 : 0 };
  const path = pathOf(race.route);

  // Move on to the next piece once the car is near the current one's end and nearer the next, never past the
  // next gate's leg (piece i of the polyline is leg i), so a car knocked off course can't skip a gate.
  const gate = race.route.gates[race.nextGate];
  const lastPiece = Math.min(path.points.length - 2, gate.leg);
  while (state.piece < lastPiece) {
    const [along, away] = nearest(path, state.piece, car.x, car.z);
    const length = path.starts[state.piece + 1] - path.starts[state.piece];
    if (along < length - ADVANCE_WINDOW || nearest(path, state.piece + 1, car.x, car.z)[1] > away) break;
    state.piece++;
  }
  const progress = path.starts[state.piece] + nearest(path, state.piece, car.x, car.z)[0];

  const speed = forwardSpeed(car);
  // Past the next gate's line without it counting (outside its span): go back behind it and through again.
  if (progress >= gate.distance) state.missed = true;
  else if (progress < gate.distance - MISSED_BACK / 2) state.missed = false;
  // Far off the route (knocked onto a pavement, overshot a turn): head for the nearest point of this piece or the
  // last one first, since a point further on may lie behind a corner building.
  let back = progress;
  let away = nearest(path, state.piece, car.x, car.z)[1];
  if (state.piece > 0) {
    const [along, previousAway] = nearest(path, state.piece - 1, car.x, car.z);
    if (previousAway < away) [back, away] = [path.starts[state.piece - 1] + along, previousAway];
  }
  const aimAt = away > OFF_ROUTE * OFF_ROUTE ? back + LOOKAHEAD : progress + LOOKAHEAD + LOOKAHEAD_TIME * Math.max(0, speed);
  const aim = pointAt(path, state.missed ? gate.distance - MISSED_BACK : aimAt);
  const offAim = wrapAngle(atan2(-(aim.x - car.x), -(aim.z - car.z)) - car.heading);
  const steer = Math.max(-1, Math.min(1, offAim * STEER_GAIN));
  state.slowTicks = Math.abs(speed) < STALL_SPEED ? state.slowTicks + 1 : 0;

  if (progress > state.best + RECOVERED_DISTANCE) {
    state.best = progress;
    state.recoveries = 0;
  }
  if (state.reverseTicks > 0) {
    state.reverseTicks--;
    // Backed into something, or swung round far enough: drive on.
    if (state.slowTicks >= STALL_TICKS || (state.turning && Math.abs(offAim) < OFF_AIM_ANGLE)) state.reverseTicks = 0;
    if (state.reverseTicks === 0) {
      state.forwardTicks = FORWARD_TICKS;
      state.slowTicks = 0;
    }
    // Reversing flips the steering, so steer the other way to swing the nose towards the aim.
    return { throttle: 0, brake: speed > -REVERSE_SPEED ? 1 : 0, steer: -steer, drift: 0 };
  }
  if (state.forwardTicks > 0) state.forwardTicks--;
  // Stalled: back out, longer each time in a row without getting on. Standing and facing away from the aim:
  // back round first, unless it just backed into something.
  const wrongWay = state.forwardTicks === 0 && Math.abs(offAim) > WRONG_WAY_ANGLE && speed < STALL_SPEED;
  if (state.slowTicks >= STALL_TICKS || wrongWay) {
    state.slowTicks = 0;
    state.recoveries++;
    state.backOuts++;
    state.turning = wrongWay;
    state.reverseTicks = wrongWay ? TURN_REVERSE_TICKS : REVERSE_TICKS * Math.min(state.recoveries, MAX_REVERSE_STEPS);
    return { throttle: 0, brake: 1, steer: -steer, drift: 0 };
  }

  // The fastest speed from which the next turn's cornering speed can still be reached by braking.
  let limit = Infinity;
  for (const turn of path.turns) {
    const ahead = path.starts[turn] - progress;
    if (ahead < -BRAKE_EARLY) continue;
    const corner = path.cornerSpeeds[turn];
    limit = Math.min(limit, Math.sqrt(corner * corner + 2 * BRAKE_PLANNING * Math.max(0, ahead - BRAKE_EARLY)));
    if (ahead > 0) break;
  }
  if (Math.abs(offAim) > OFF_AIM_ANGLE) limit = Math.min(limit, Math.abs(offAim) > Math.PI / 2 ? TURNING_SPEED : CORNER_SPEED);
  if (speed < limit) return { throttle: 1, brake: 0, steer, drift: 0 };
  return { throttle: 0, brake: speed > limit + 0.5 ? 1 : 0, steer, drift: 0 };
}

export interface DrivenRace {
  finished: boolean;
  raceTicks: number; // from go to the finish, or to the tick limit
  gates: number; // passed, the finish included
  events: RaceEvent[];
  impacts: number;
  backOuts: number;
  distance: number; // m driven from go
  inputs: CarInput[]; // one per tick from the world's tick at the call, countdown included
}

// Steering with keys: full lock or none each tick, the difference carried over, so it adds up to the driver's.
const KEY_STEER_THRESHOLD = 0.5;

// Drives the world's race until the finish or until `maxTicks` ticks have passed. With `keys` the steering is tapped
// as on a keyboard, so every input is one the keyboard can make.
export function driveRace(world: World, maxTicks: number, keys = false): DrivenRace {
  const { race } = world;
  if (!race) throw new Error('no race to drive');
  const state = createDriver();
  const inputs: CarInput[] = [];
  const events: RaceEvent[] = [];
  let impacts = 0;
  let distance = 0;
  let steerLeft = 0;
  while (race.phase !== 'finished' && inputs.length < maxTicks) {
    let input = driverInput(world, state);
    if (keys) {
      steerLeft += input.steer;
      const steer = steerLeft >= KEY_STEER_THRESHOLD ? 1 : steerLeft <= -KEY_STEER_THRESHOLD ? -1 : 0;
      steerLeft -= steer;
      input = { ...input, steer };
    }
    inputs.push(input);
    const { x, z } = world.car;
    const result = stepWorld(world, input);
    distance += hypot(world.car.x - x, world.car.z - z);
    if (result.impact) impacts++;
    if (result.race) events.push(result.race);
  }
  return {
    finished: race.phase === 'finished',
    raceTicks: raceTicks(race, world.tick),
    gates: race.nextGate,
    events,
    impacts,
    backOuts: state.backOuts,
    distance,
    inputs,
  };
}
