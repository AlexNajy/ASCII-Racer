import { CAR_SHAPES } from '../render/models/car.ts';
import { CAR_COLORS } from '../render/models/palettes.ts';
import type { PlayerSettings } from './settings.ts';

// The garage's rows and what keys and clicks do on it. Pure: main.ts saves the settings and rebuilds the car.

export const GARAGE_ROWS = ['shape', 'color'] as const;
export type GarageRow = (typeof GARAGE_ROWS)[number];

export const GARAGE_LABELS: Record<GarageRow, string> = { shape: 'shape', color: 'colour' };

const CHOICES: Record<GarageRow, readonly string[]> = { shape: CAR_SHAPES, color: CAR_COLORS.map(({ id }) => id) };

// The widest name, so the arrows stay put while cycling.
export const CHOICE_WIDTH = Math.max(...Object.values(CHOICES).flat().map((name) => name.length));
// Where the arrows are in a row's value, for clicks.
export const CHOICE_LESS = 0;
export const CHOICE_MORE = 3 + CHOICE_WIDTH;

export function wrapGarageRow(index: number): number {
  const count = GARAGE_ROWS.length;
  return ((index % count) + count) % count;
}

function current(row: GarageRow, settings: PlayerSettings): string {
  return row === 'shape' ? settings.carShape : settings.carColor;
}

// The row's choice moved by `step` (left is -1), wrapping round; an unknown one counts as the first.
export function cycleChoice(settings: PlayerSettings, row: GarageRow, step: number): PlayerSettings {
  const choices = CHOICES[row];
  const count = choices.length;
  const index = Math.max(0, choices.indexOf(current(row, settings)));
  const next = choices[(((index + step) % count) + count) % count];
  return row === 'shape' ? { ...settings, carShape: CAR_SHAPES.find((shape) => shape === next)! } : { ...settings, carColor: next };
}

// A row's value as the screen shows it.
export function garageValue(row: GarageRow, settings: PlayerSettings): string {
  return `< ${current(row, settings).padEnd(CHOICE_WIDTH, ' ')} >`;
}

export interface GarageChange {
  selected: number;
  settings: PlayerSettings;
}

// A click on a row, `offset` columns into its value (negative on the label): selects it, and on an arrow steps it.
export function garageClick(selected: number, settings: PlayerSettings, index: number, offset: number): GarageChange {
  if (!Number.isInteger(index) || index < 0 || index >= GARAGE_ROWS.length) return { selected, settings };
  const step = offset === CHOICE_LESS ? -1 : offset === CHOICE_MORE ? 1 : 0;
  return { selected: index, settings: step === 0 ? settings : cycleChoice(settings, GARAGE_ROWS[index], step) };
}
