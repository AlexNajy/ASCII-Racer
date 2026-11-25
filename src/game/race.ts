import { SETBACK } from './buildings.ts';
import type { Car } from './car.ts';
import { TICKS_PER_SECOND } from './clock.ts';
import type { Gate, Route } from './route.ts';

export const COUNTDOWN_TICKS = 3 * TICKS_PER_SECOND; // "3, 2, 1", then go
export const COUNTDOWN_STEP_TICKS = TICKS_PER_SECOND; // each number shows this long
export const GO_SHOWN_TICKS = TICKS_PER_SECOND; // "go" shows this long after the countdown

// Beyond the kerb on each side a gate still counts: the pavement, which ends at the building line
// (blocks are inset SETBACK, the outer wall WALL_SETBACK, both 3 m).
export const GATE_SPAN_MARGIN = SETBACK;

export type RacePhase = 'countdown' | 'running' | 'finished';
export const RACE_PHASES: readonly RacePhase[] = ['countdown', 'running', 'finished'];

// Small and plain so rollback can copy it with a spread; the route is shared and never changed.
export interface Race {
  route: Route;
  phase: RacePhase;
  startTick: number; // world tick the race started on
  nextGate: number; // index into route.gates
  finishTick: number; // world tick once the finish was crossed, -1 before
}

export type RaceEvent = { kind: 'go' } | { kind: 'gate'; gate: number } | { kind: 'finish'; gate: number; ticks: number };

export function createRace(route: Route, tick: number): Race {
  return { route, phase: 'countdown', startTick: tick, nextGate: 0, finishTick: -1 };
}

export function goTick(race: Race): number {
  return race.startTick + COUNTDOWN_TICKS;
}

// Whole ticks of racing at world tick `tick`: 0 in the countdown, frozen once finished.
export function raceTicks(race: Race, tick: number): number {
  if (race.phase === 'countdown') return 0;
  return (race.phase === 'finished' ? race.finishTick : tick) - goTick(race);
}

// What the countdown shows at world tick `tick`: 3, 2, 1, then 0 for go, null before the start or after go.
export function countdownShown(race: Race, tick: number): number | null {
  const elapsed = tick - race.startTick;
  if (elapsed < 0) return null;
  if (elapsed < COUNTDOWN_TICKS) return Math.ceil((COUNTDOWN_TICKS - elapsed) / COUNTDOWN_STEP_TICKS);
  return elapsed < COUNTDOWN_TICKS + GO_SHOWN_TICKS ? 0 : null;
}

// Whether moving the car's centre from `from` to `to` crosses the gate's line in its direction within its span.
// Strictly behind before, on or past after, so a car resting on the line never counts twice.
export function crossesGate(gate: Gate, from: Car, to: Car): boolean {
  const alongX = gate.direction.x !== 0;
  const sign = alongX ? gate.direction.x : gate.direction.z;
  const line = alongX ? gate.point.x : gate.point.z;
  const before = (alongX ? from.x : from.z) - line;
  const after = (alongX ? to.x : to.z) - line;
  if (sign * before >= 0 || sign * after < 0) return false;
  const acrossFrom = alongX ? from.z : from.x;
  const acrossTo = alongX ? to.z : to.x;
  const across = acrossFrom + ((acrossTo - acrossFrom) * before) / (before - after);
  const centre = alongX ? gate.point.z : gate.point.x;
  return Math.abs(across - centre) <= gate.width / 2 + GATE_SPAN_MARGIN;
}

// One tick of a running race, after the car moved from `from` to `to`. `tick` is the world tick after the step.
export function advanceRace(race: Race, from: Car, to: Car, tick: number): RaceEvent | null {
  if (race.phase !== 'running') return null;
  const { gates } = race.route;
  const gate = race.nextGate;
  if (!crossesGate(gates[gate], from, to)) return null;
  race.nextGate++;
  if (race.nextGate < gates.length) return { kind: 'gate', gate };
  race.phase = 'finished';
  race.finishTick = tick;
  return { kind: 'finish', gate, ticks: raceTicks(race, tick) };
}

// m:ss.mmm with the milliseconds rounded down, in integer maths. 1 tick is 1000/60 = 50/3 ms.
export function formatRaceTime(ticks: number): string {
  const ms = Math.floor((ticks * 50) / 3);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
