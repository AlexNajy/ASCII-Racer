import type { City } from './city.ts';

export type Axis = 'x' | 'z'; // the direction a segment runs: x is east-west, z is north-south
export type Turn = 'straight' | 'left' | 'right' | 'uTurn';

export interface Point {
  x: number;
  z: number;
}

// One junction. `index` is its place in `city.junctions`.
export interface RoadNode {
  index: number;
  row: number;
  column: number;
  x: number;
  z: number;
}

// The road between two neighbouring junctions. `a` is the west or north end, `b` the east or south end.
export interface RoadSegment {
  index: number;
  a: number; // node indices
  b: number;
  axis: Axis;
  length: number; // between junction centres
  width: number;
  avenue: boolean;
  start: Point; // centre line ends, at the junction centres
  end: Point;
  clearStart: Point; // centre line points where the junction squares end
  clearEnd: Point;
  clearLength: number;
}

// Where a node's segments lead, in this order: north (-Z), east, south, west. Missing at the edges.
export const LEG_ORDER = ['north', 'east', 'south', 'west'] as const;
export type Direction = (typeof LEG_ORDER)[number];

export interface RoadLink {
  direction: Direction;
  segment: number;
  node: number; // the junction at the other end
}

export interface RoadGraph {
  nodes: RoadNode[];
  segments: RoadSegment[];
  links: RoadLink[][]; // per node
}

// Segments are numbered row by row: at each node the one going east, then the one going south.
export function roadGraph(city: City): RoadGraph {
  const { junctions, avenues, bounds } = city;
  const perRow = Math.round(Math.sqrt(junctions.length));
  const nodes: RoadNode[] = junctions.map(({ row, column, x, z }, index) => ({ index, row, column, x, z }));

  const columnX = nodes.slice(0, perRow).map((node) => node.x);
  const rowZ = Array.from({ length: perRow }, (_, row) => nodes[row * perRow].z);

  const columnWidths = lineWidths(columnX, bounds.minX, bounds.maxX, city.blocks.filter((b) => b.row === 0).map((b) => [b.rect.minX, b.rect.maxX]));
  const rowWidths = lineWidths(rowZ, bounds.minZ, bounds.maxZ, city.blocks.filter((b) => b.column === 0).map((b) => [b.rect.minZ, b.rect.maxZ]));

  const segments: RoadSegment[] = [];
  const links: RoadLink[][] = nodes.map(() => []);
  const add = (a: RoadNode, b: RoadNode, axis: Axis) => {
    const column = axis === 'z';
    const width = column ? columnWidths[a.column] : rowWidths[a.row];
    const length = column ? b.z - a.z : b.x - a.x;
    const startHalf = (column ? rowWidths[a.row] : columnWidths[a.column]) / 2;
    const endHalf = (column ? rowWidths[b.row] : columnWidths[b.column]) / 2;
    const at = (offset: number): Point => (column ? { x: a.x, z: a.z + offset } : { x: a.x + offset, z: a.z });
    const index = segments.length;
    segments.push({
      index,
      a: a.index,
      b: b.index,
      axis,
      length,
      width,
      avenue: (column ? avenues.columns : avenues.rows).has(column ? a.column : a.row),
      start: at(0),
      end: at(length),
      clearStart: at(startHalf),
      clearEnd: at(length - endHalf),
      clearLength: length - startHalf - endHalf,
    });
    return index;
  };
  // Collected per node, then ordered north, east, south, west.
  const found: (RoadLink | undefined)[][] = nodes.map(() => [undefined, undefined, undefined, undefined]);
  for (const node of nodes) {
    if (node.column < perRow - 1) {
      const east = nodes[node.index + 1];
      const segment = add(node, east, 'x');
      found[node.index][1] = { direction: 'east', segment, node: east.index };
      found[east.index][3] = { direction: 'west', segment, node: node.index };
    }
    if (node.row < perRow - 1) {
      const south = nodes[node.index + perRow];
      const segment = add(node, south, 'z');
      found[node.index][2] = { direction: 'south', segment, node: south.index };
      found[south.index][0] = { direction: 'north', segment, node: node.index };
    }
  }
  found.forEach((legs, i) => links[i].push(...legs.filter((link): link is RoadLink => link !== undefined)));
  return { nodes, segments, links };
}

// Width of each road line: the gap between the blocks either side, or twice the distance to the bounds for the ring.
function lineWidths(centres: number[], min: number, max: number, blocks: number[][]): number[] {
  return centres.map((centre, i) => {
    if (i === 0) return 2 * (centre - min);
    if (i === centres.length - 1) return 2 * (max - centre);
    return blocks[i][0] - blocks[i - 1][1];
  });
}

// Throws if `node` is not an end of the segment, so the helpers below never answer for a segment that doesn't touch it.
export function otherEnd(graph: RoadGraph, segment: number, node: number): number {
  const { a, b } = graph.segments[segment];
  if (node === a) return b;
  if (node === b) return a;
  throw new Error(`junction ${node} is not an end of segment ${segment}`);
}

// Unit step (one of four) of travel along a segment when leaving `node`.
export function directionFrom(graph: RoadGraph, segment: number, node: number): Point {
  const { a, axis } = graph.segments[segment];
  otherEnd(graph, segment, node);
  const sign = node === a ? 1 : -1;
  return axis === 'x' ? { x: sign, z: 0 } : { x: 0, z: sign };
}

// The point `fraction` (0 to 1) of the way along a segment, measured from `node`.
export function pointAlong(graph: RoadGraph, segment: number, node: number, fraction: number): Point {
  const { start, end, a } = graph.segments[segment];
  otherEnd(graph, segment, node);
  const [from, to] = node === a ? [start, end] : [end, start];
  return { x: from.x + (to.x - from.x) * fraction, z: from.z + (to.z - from.z) * fraction };
}

// Arriving at their shared node along `from` and leaving along `to`. Z grows southwards, so a left turn from
// heading north (-Z) goes west (-X). Leaving along the same segment is a U-turn.
export function turnBetween(graph: RoadGraph, from: number, to: number, node: number): Turn {
  const into = directionFrom(graph, from, otherEnd(graph, from, node));
  const out = directionFrom(graph, to, node);
  const dot = into.x * out.x + into.z * out.z;
  if (dot > 0) return 'straight';
  if (dot < 0) return 'uTurn';
  return into.x * out.z - into.z * out.x < 0 ? 'left' : 'right';
}
