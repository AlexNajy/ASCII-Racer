import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_SETTINGS, generateCity, type City, type CitySettings } from './city.ts';
import { directionFrom, LEG_ORDER, otherEnd, pointAlong, roadGraph, turnBetween } from './roadGraph.ts';

const CASES: Partial<CitySettings>[] = [
  { seed: 1 },
  { seed: 2 },
  { seed: 77 },
  { seed: 5, blocksPerSide: 5, avenueDensity: 0.9 },
  { seed: 6, blocksPerSide: 3 },
  { seed: 7, blocksPerSide: 12, avenueDensity: 1 },
  { seed: 8, blocksPerSide: 1 },
  { seed: 9, blockSize: 80, roadWidth: 10, avenueWidth: 24 },
];

const cases = CASES.map((overrides) => {
  const settings = { ...DEFAULT_CITY_SETTINGS, ...overrides };
  const city = generateCity(settings);
  return { settings, city, graph: roadGraph(city), name: JSON.stringify(overrides) };
});

function roadWidth(city: City, settings: CitySettings, axis: 'x' | 'z', line: number): number {
  const set = axis === 'z' ? city.avenues.columns : city.avenues.rows;
  return set.has(line) ? settings.avenueWidth : settings.roadWidth;
}

describe.each(cases)('road graph $name', ({ settings, city, graph }) => {
  const n = settings.blocksPerSide;

  it('has a node per junction and a segment per stretch of road', () => {
    expect(graph.nodes).toHaveLength((n + 1) ** 2);
    expect(graph.segments).toHaveLength(2 * n * (n + 1));
    graph.nodes.forEach((node, i) => {
      expect(node.index).toBe(i);
      expect(city.junctions[i]).toMatchObject({ row: node.row, column: node.column, x: node.x, z: node.z });
    });
  });

  it('joins neighbouring junctions with the right length, width and avenue flag', () => {
    graph.segments.forEach((segment, i) => {
      expect(segment.index).toBe(i);
      const a = graph.nodes[segment.a];
      const b = graph.nodes[segment.b];
      if (segment.axis === 'x') {
        expect(b.row).toBe(a.row);
        expect(b.column).toBe(a.column + 1);
        expect(segment.length).toBeCloseTo(b.x - a.x, 9);
        expect(segment.width).toBeCloseTo(roadWidth(city, settings, 'x', a.row), 9);
        expect(segment.avenue).toBe(city.avenues.rows.has(a.row));
      } else {
        expect(b.column).toBe(a.column);
        expect(b.row).toBe(a.row + 1);
        expect(segment.length).toBeCloseTo(b.z - a.z, 9);
        expect(segment.width).toBeCloseTo(roadWidth(city, settings, 'z', a.column), 9);
        expect(segment.avenue).toBe(city.avenues.columns.has(a.column));
      }
      expect(segment.length).toBeGreaterThan(0);
      expect(segment.avenue).toBe(segment.width === settings.avenueWidth);
      expect(segment.start).toEqual({ x: a.x, z: a.z });
      expect(segment.end).toEqual({ x: b.x, z: b.z });
    });
  });

  it('keeps the clear stretch between the junction squares', () => {
    for (const segment of graph.segments) {
      const a = graph.nodes[segment.a];
      const b = graph.nodes[segment.b];
      const x = segment.axis === 'x';
      const startHalf = x ? roadWidth(city, settings, 'z', a.column) / 2 : roadWidth(city, settings, 'x', a.row) / 2;
      const endHalf = x ? roadWidth(city, settings, 'z', b.column) / 2 : roadWidth(city, settings, 'x', b.row) / 2;
      const along = (p: { x: number; z: number }) => (x ? p.x : p.z);
      const across = (p: { x: number; z: number }) => (x ? p.z : p.x);
      expect(across(segment.clearStart)).toBe(across(segment.start));
      expect(across(segment.clearEnd)).toBe(across(segment.start));
      expect(along(segment.clearStart) - along(segment.start)).toBeCloseTo(startHalf, 9);
      expect(along(segment.end) - along(segment.clearEnd)).toBeCloseTo(endHalf, 9);
      expect(segment.clearLength).toBeGreaterThan(0);
      expect(along(segment.clearEnd) - along(segment.clearStart)).toBeCloseTo(segment.clearLength, 9);
      expect(segment.clearLength).toBeLessThan(segment.length);
    }
  });

  it('has 2, 3 or 4 segments per node, symmetric and in fixed order', () => {
    graph.nodes.forEach((node) => {
      const links = graph.links[node.index];
      const edges = Number(node.row === 0 || node.row === n) + Number(node.column === 0 || node.column === n);
      expect(links).toHaveLength(4 - edges);
      expect(links.map((l) => LEG_ORDER.indexOf(l.direction))).toEqual(
        [...links.map((l) => LEG_ORDER.indexOf(l.direction))].sort((p, q) => p - q),
      );
      for (const link of links) {
        const segment = graph.segments[link.segment];
        expect([segment.a, segment.b]).toContain(node.index);
        expect(link.node).toBe(otherEnd(graph, link.segment, node.index));
        const back = graph.links[link.node].find((l) => l.segment === link.segment)!;
        expect(back.node).toBe(node.index);
        const opposite = LEG_ORDER[(LEG_ORDER.indexOf(link.direction) + 2) % 4];
        expect(back.direction).toBe(opposite);
        const other = graph.nodes[link.node];
        const step = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }[link.direction];
        expect([Math.sign(other.x - node.x), Math.sign(other.z - node.z)]).toEqual(step);
      }
    });
  });

  it('is connected', () => {
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      for (const link of graph.links[queue.pop()!]) {
        if (!seen.has(link.node)) {
          seen.add(link.node);
          queue.push(link.node);
        }
      }
    }
    expect(seen.size).toBe(graph.nodes.length);
  });

  it('builds the same data twice', () => {
    expect(roadGraph(city)).toEqual(graph);
  });
});

describe('road graph helpers', () => {
  const { graph } = cases[0];
  const centre = graph.nodes.find((node) => node.row === 3 && node.column === 3)!;
  const leg = (direction: string) => graph.links[centre.index].find((l) => l.direction === direction)!;

  it('finds the other end and the direction of travel from either end', () => {
    const east = leg('east');
    expect(otherEnd(graph, east.segment, centre.index)).toBe(east.node);
    expect(otherEnd(graph, east.segment, east.node)).toBe(centre.index);
    expect(directionFrom(graph, east.segment, centre.index)).toEqual({ x: 1, z: 0 });
    expect(directionFrom(graph, east.segment, east.node)).toEqual({ x: -1, z: 0 });
    const north = leg('north');
    expect(directionFrom(graph, north.segment, centre.index)).toEqual({ x: 0, z: -1 });
    expect(directionFrom(graph, north.segment, north.node)).toEqual({ x: 0, z: 1 });
  });

  it('gives the point at a fraction from either end', () => {
    const south = leg('south');
    const segment = graph.segments[south.segment];
    const from = (node: number, fraction: number) => pointAlong(graph, south.segment, node, fraction);
    expect(from(centre.index, 0)).toEqual({ x: centre.x, z: centre.z });
    expect(from(centre.index, 1)).toEqual(segment.end);
    expect(from(south.node, 0)).toEqual(segment.end);
    expect(from(centre.index, 0.25).z).toBeCloseTo(centre.z + segment.length / 4, 9);
    expect(from(south.node, 0.25).z).toBeCloseTo(segment.end.z - segment.length / 4, 9);
    expect(from(centre.index, 0.5).x).toBe(centre.x);
  });

  it('classifies turns for every way in and out', () => {
    const turn = (from: string, to: string) => turnBetween(graph, leg(from).segment, leg(to).segment, centre.index);
    // Arriving from the `from` leg means travelling away from it.
    expect(turn('south', 'north')).toBe('straight');
    expect(turn('west', 'east')).toBe('straight');
    expect(turn('south', 'west')).toBe('left');
    expect(turn('south', 'east')).toBe('right');
    expect(turn('west', 'north')).toBe('left');
    expect(turn('west', 'south')).toBe('right');
    expect(turn('north', 'east')).toBe('left');
    expect(turn('north', 'west')).toBe('right');
    expect(turn('east', 'south')).toBe('left');
    expect(turn('east', 'north')).toBe('right');
    for (const d of ['north', 'east', 'south', 'west']) expect(turn(d, d)).toBe('uTurn');
  });

  it('throws for a junction that is not an end of the segment', () => {
    const east = leg('east');
    const north = leg('north');
    const far = otherEnd(graph, north.segment, centre.index);
    expect(() => otherEnd(graph, east.segment, far)).toThrow(/not an end/);
    expect(() => directionFrom(graph, east.segment, far)).toThrow(/not an end/);
    expect(() => pointAlong(graph, east.segment, far, 0.5)).toThrow(/not an end/);
    // The two segments don't touch at `far`, and `east` doesn't arrive there.
    expect(() => turnBetween(graph, north.segment, east.segment, far)).toThrow(/not an end/);
    expect(() => turnBetween(graph, east.segment, north.segment, far)).toThrow(/not an end/);
    // Two segments of the same road that are not neighbours.
    const beyond = graph.links[east.node].find((l) => l.direction === 'east')!;
    expect(() => turnBetween(graph, leg('west').segment, beyond.segment, centre.index)).toThrow(/not an end/);
  });
});
