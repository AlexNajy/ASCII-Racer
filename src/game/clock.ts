// The world clock: a count of fixed simulation steps (ticks) since the world started. Everything that changes
// over time in the simulation (traffic signals, later the car) reads the tick
export const TICKS_PER_SECOND = 60;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

export interface Clock {
  tick: number;
  leftover: number; // frame time not yet used up by whole ticks, in seconds
}

export function createClock(): Clock {
  return { tick: 0, leftover: 0 };
}

// Runs `step` once for every whole tick that fits in the frame time, and carries the rest over to the next
// frame. A fast screen runs some frames with no tick, a slow one several ticks per frame.
export function advanceClock(clock: Clock, frameSeconds: number, step: (tick: number) => void): void {
  clock.leftover += frameSeconds;
  while (clock.leftover >= TICK_SECONDS) {
    clock.leftover -= TICK_SECONDS;
    step(clock.tick);
    clock.tick++;
  }
}
