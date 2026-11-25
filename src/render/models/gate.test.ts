import { describe, expect, it } from 'vitest';
import { SETBACK } from '../../game/buildings.ts';
import { DEFAULT_CITY_SETTINGS } from '../../game/city.ts';
import { generateRoute } from '../../game/route.ts';
import { generateCityData } from '../../game/world.ts';
import { FLOATS_PER_VERTEX } from '../shapes.ts';
import { gateId, gateVertices, routeGateVertices } from './gate.ts';

const graph = generateCityData({ ...DEFAULT_CITY_SETTINGS }, false).roadGraph;
const routes = [1, 2, 3, 4].map((seed) => generateRoute(graph, seed));
const ROOM_ABOVE_CAR = 5; // m of clear height over the road
const MAX_VERTICES = 2000;

function vertices(data: number[]) {
  const list = [];
  for (let i = 0; i < data.length; i += FLOATS_PER_VERTEX) {
    list.push({ x: data[i], y: data[i + 1], z: data[i + 2], id: data[i + 10] });
  }
  return list;
}

describe('gate model', () => {
  it('tags every vertex with its gate id, the finish last', () => {
    for (const route of routes) {
      const all = vertices(routeGateVertices(route.gates));
      const perGate = route.gates.map((gate, index) => gateVertices(gate, index, index === route.gates.length - 1).length / FLOATS_PER_VERTEX);
      expect(all.length).toBe(perGate.reduce((sum, count) => sum + count, 0));
      let start = 0;
      perGate.forEach((count, index) => {
        expect(all.slice(start, start + count).every(({ id }) => id === gateId(index))).toBe(true);
        start += count;
      });
    }
  });

  it('uses ids clear of the beacon, brake light and signal ids', () => {
    for (let index = 0; index < 100; index++) expect(gateId(index)).toBeLessThan(-3);
    expect(new Set(Array.from({ length: 100 }, (_, index) => gateId(index))).size).toBe(100);
  });

  it('builds whole triangles of a sane size, with a different finish', () => {
    const gate = routes[0].gates[0];
    const checkpoint = gateVertices(gate, 0, false);
    const finish = gateVertices(gate, 0, true);
    for (const data of [checkpoint, finish]) {
      const count = data.length / FLOATS_PER_VERTEX;
      expect(count % 3).toBe(0);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(MAX_VERTICES);
      expect(data.every(Number.isFinite)).toBe(true);
    }
    expect(finish).not.toEqual(checkpoint);
  });

  it('stands within the counted span on its line, with room to drive under', () => {
    for (const route of routes) {
      route.gates.forEach((gate, index) => {
        const alongX = gate.direction.x !== 0;
        for (const { x, y, z } of vertices(gateVertices(gate, index, index === route.gates.length - 1))) {
          const across = Math.abs(alongX ? z - gate.point.z : x - gate.point.x);
          const along = Math.abs(alongX ? x - gate.point.x : z - gate.point.z);
          expect(across).toBeLessThanOrEqual(gate.width / 2 + SETBACK);
          expect(along).toBeLessThan(1);
          if (across < gate.width / 2) expect(y).toBeGreaterThanOrEqual(ROOM_ABOVE_CAR);
        }
      });
    }
  });
});
