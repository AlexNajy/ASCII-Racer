import { describe, expect, it } from 'vitest';
import { CAR_LENGTH, CAR_WIDTH } from '../../game/car.ts';
import { BRAKE_ID, FLOATS_PER_VERTEX } from '../shapes.ts';
import { CAR_SHAPES, carVertices, LIGHT_DEPTH, MAX_CAR_HEIGHT, TYRE_COLOR } from './car.ts';
import { CAR_COLORS, carColor } from './palettes.ts';

const EPSILON = 1e-9;
const WHEEL_X = 0.76; // the coupe's: half the width less half a tyre
const AXLE = 1.45;
const GROUND_GAP = 0.03; // m, an octagonal wheel's flat bottom stands this little above the ground

function vertices(shape: (typeof CAR_SHAPES)[number]) {
  const data = carVertices(shape, CAR_COLORS[3]);
  return Array.from({ length: data.length / FLOATS_PER_VERTEX }, (_, i) => data.slice(i * FLOATS_PER_VERTEX, (i + 1) * FLOATS_PER_VERTEX));
}

describe('car shapes', () => {
  it('offers at least five shapes and twelve colours, each with its own id', () => {
    expect(CAR_SHAPES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CAR_SHAPES).size).toBe(CAR_SHAPES.length);
    expect(CAR_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(CAR_COLORS.map(({ id }) => id)).size).toBe(CAR_COLORS.length);
    for (const { id } of CAR_COLORS) expect(id).toMatch(/^[a-z]+$/);
  });

  it('keeps the colours at a similar brightness', () => {
    for (const { body } of CAR_COLORS) {
      const brightness = 0.299 * body[0] + 0.587 * body[1] + 0.114 * body[2];
      expect(brightness).toBeGreaterThanOrEqual(0.35);
      expect(brightness).toBeLessThanOrEqual(0.55);
    }
  });

  it('falls back to the first colour for an unknown id', () => {
    expect(carColor('teal').id).toBe('teal');
    expect(carColor('nope')).toBe(CAR_COLORS[0]);
  });

  it.each(CAR_SHAPES)('builds the %s inside the collision box, on the ground', (shape) => {
    const all = vertices(shape);
    expect(all.length).toBeGreaterThan(0);
    let lowest = Infinity;
    for (const [x, y, z] of all) {
      expect(Math.abs(x)).toBeLessThanOrEqual(CAR_WIDTH / 2 + EPSILON);
      // Only the light lenses stand out of the nose and tail.
      expect(Math.abs(z)).toBeLessThanOrEqual(CAR_LENGTH / 2 + LIGHT_DEPTH + EPSILON);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MAX_CAR_HEIGHT);
      lowest = Math.min(lowest, y);
    }
    expect(lowest).toBeLessThan(GROUND_GAP);
  });

  it.each(CAR_SHAPES)('gives the %s brake lights, glowing head lights and the four wheels in the same spots', (shape) => {
    const all = vertices(shape);
    const brake = all.filter((v) => v[10] === BRAKE_ID);
    expect(brake.length).toBeGreaterThan(0);
    for (const v of brake) expect(v[2]).toBeGreaterThan(0); // at the back
    expect(all.some((v) => v[10] !== BRAKE_ID && v[9] === 1 && v[2] < -CAR_LENGTH / 2 + EPSILON)).toBe(true);
    const tyres = all.filter((v) => v[3] === TYRE_COLOR[0] && v[4] === TYRE_COLOR[1] && v[5] === TYRE_COLOR[2]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = tyres.filter((v) => Math.sign(v[0]) === sx && Math.sign(v[2]) === sz);
        expect(wheel.length).toBeGreaterThan(0);
        const middle = (values: number[]) => (Math.min(...values) + Math.max(...values)) / 2;
        expect(middle(wheel.map((v) => v[0]))).toBeCloseTo(sx * WHEEL_X, 6);
        expect(middle(wheel.map((v) => v[2]))).toBeCloseTo(sz * AXLE, 6);
      }
    }
  });

  it('paints the body in the chosen colour', () => {
    for (const shape of CAR_SHAPES) {
      for (const color of [CAR_COLORS[0], CAR_COLORS[6]]) {
        const all = carVertices(shape, color);
        let painted = 0;
        for (let i = 0; i < all.length; i += FLOATS_PER_VERTEX) {
          if (all[i + 3] === color.body[0] && all[i + 4] === color.body[1] && all[i + 5] === color.body[2]) painted++;
        }
        expect(painted).toBeGreaterThan(0);
      }
    }
  });
});
