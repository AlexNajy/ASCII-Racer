import { describe, expect, it } from 'vitest';
import { CAR_SHAPES } from '../render/models/car.ts';
import { CAR_COLORS } from '../render/models/palettes.ts';
import { CHOICE_LESS, CHOICE_MORE, cycleChoice, garageClick, garageValue, wrapGarageRow } from './garageMenu.ts';
import { DEFAULT_PLAYER_SETTINGS } from './settings.ts';

const DEFAULTS = { ...DEFAULT_PLAYER_SETTINGS };
const lastColor = CAR_COLORS[CAR_COLORS.length - 1].id;

describe('garage menu', () => {
  it('cycles shapes and colours both ways, wrapping round', () => {
    expect(cycleChoice(DEFAULTS, 'shape', 1).carShape).toBe(CAR_SHAPES[1]);
    expect(cycleChoice(DEFAULTS, 'shape', -1).carShape).toBe(CAR_SHAPES[CAR_SHAPES.length - 1]);
    expect(cycleChoice({ ...DEFAULTS, carShape: CAR_SHAPES[CAR_SHAPES.length - 1] }, 'shape', 1).carShape).toBe(CAR_SHAPES[0]);
    expect(cycleChoice(DEFAULTS, 'color', -1).carColor).toBe(lastColor);
    expect(cycleChoice({ ...DEFAULTS, carColor: lastColor }, 'color', 1).carColor).toBe(CAR_COLORS[0].id);
    const shaped = cycleChoice(DEFAULTS, 'shape', 1);
    expect(shaped.carColor).toBe(DEFAULTS.carColor);
    expect({ ...shaped, carShape: DEFAULTS.carShape }).toEqual(DEFAULTS);
  });

  it('shows the choice between arrows of a fixed width', () => {
    const values = CAR_SHAPES.map((carShape) => garageValue('shape', { ...DEFAULTS, carShape }));
    for (const value of values) {
      expect(value[CHOICE_LESS]).toBe('<');
      expect(value[CHOICE_MORE]).toBe('>');
      expect(value.length).toBe(values[0].length);
    }
    expect(garageValue('color', DEFAULTS)).toMatch(/^< ember +>$/);
  });

  it('selects a clicked row and steps it on its arrows', () => {
    expect(garageClick(0, DEFAULTS, 1, 4)).toEqual({ selected: 1, settings: DEFAULTS });
    expect(garageClick(0, DEFAULTS, 1, -3)).toEqual({ selected: 1, settings: DEFAULTS });
    expect(garageClick(0, DEFAULTS, 1, CHOICE_MORE).settings.carColor).toBe(CAR_COLORS[1].id);
    expect(garageClick(1, DEFAULTS, 0, CHOICE_LESS)).toEqual({ selected: 0, settings: { ...DEFAULTS, carShape: CAR_SHAPES[CAR_SHAPES.length - 1] } });
    expect(garageClick(1, DEFAULTS, 2, CHOICE_MORE)).toEqual({ selected: 1, settings: DEFAULTS });
    expect(garageClick(1, DEFAULTS, -1, CHOICE_MORE)).toEqual({ selected: 1, settings: DEFAULTS });
  });

  it('wraps the row index', () => {
    expect([-1, 0, 1, 2].map(wrapGarageRow)).toEqual([1, 0, 1, 0]);
  });
});
