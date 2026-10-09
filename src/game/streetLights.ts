import { Zone, type Block, type City, type CitySettings } from './city.ts';

export interface StreetLight {
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
}

// Pole size, shared by the model and the collisions.
export const STREET_LIGHT_POLE_WIDTH = 0.4;
export const STREET_LIGHT_POLE_HEIGHT = 7;

const LIT_ZONES: readonly Zone[] = [Zone.LowDensity, Zone.MidDensity, Zone.HighRise];
const CURB_DISTANCE = 1;
const CORNER_CLEARANCE = 8; // kept free for traffic lights and stop signs

interface LitSide {
  across: number;
  facing: number;
}

// One road segment between two intersections, from `start` to `end`. `before` and `after` are the curb lines
// of the lit pavements on either side (undefined if unlit). Lights alternate sides, or stand opposite each
// other in pairs (avenues). An unlit side's turns stay empty, so the lit side never gets extra lights.
function lightRoad(
  before: number | undefined,
  after: number | undefined,
  start: number,
  end: number,
  paired: boolean,
  runsAlong: 'x' | 'z',
  spacing: number,
  lights: StreetLight[],
): void {
  const sides: (LitSide | undefined)[] = [
    before === undefined ? undefined : { across: before - CURB_DISTANCE, facing: 1 },
    after === undefined ? undefined : { across: after + CURB_DISTANCE, facing: -1 },
  ];

  const from = start + CORNER_CLEARANCE;
  const span = end - start - 2 * CORNER_CLEARANCE;
  // Each light sits in the middle of an equal slot, so none end up pushed against the corners.
  const count = Math.max(1, Math.round(span / spacing));
  for (let i = 0; i < count; i++) {
    const along = from + (span * (i + 0.5)) / count;
    for (const side of paired ? sides : [sides[i % 2]]) {
      if (side === undefined) continue;
      const { across, facing } = side;
      lights.push(
        runsAlong === 'x'
          ? { x: along, z: across, facingX: 0, facingZ: facing }
          : { x: across, z: along, facingX: facing, facingZ: 0 },
      );
    }
  }
}

export function generateStreetLights(city: City, settings: CitySettings): StreetLight[] {
  const { blocksPerSide, streetLightSpacing } = settings;
  const blockAt = (column: number, row: number): Block | undefined =>
    column >= 0 && column < blocksPerSide && row >= 0 && row < blocksPerSide
      ? city.blocks[row * blocksPerSide + column]
      : undefined;
  const isLit = (block: Block | undefined): block is Block => block !== undefined && LIT_ZONES.includes(block.zone);
  const { bounds } = city;
  const lights: StreetLight[] = [];
  for (let road = 0; road <= blocksPerSide; road++) {
    for (let segment = 0; segment < blocksPerSide; segment++) {
      // The outer road's far side is the wall pavement, which is always lit.
      const north = blockAt(segment, road - 1);
      const south = blockAt(segment, road);
      const northEdge = road === 0 ? bounds.minZ : isLit(north) ? north.rect.maxZ : undefined;
      const southEdge = road === blocksPerSide ? bounds.maxZ : isLit(south) ? south.rect.minZ : undefined;
      const { rect: alongX } = (north ?? south)!;
      lightRoad(northEdge, southEdge, alongX.minX, alongX.maxX, city.avenues.rows.has(road), 'x', streetLightSpacing, lights);

      const west = blockAt(road - 1, segment);
      const east = blockAt(road, segment);
      const westEdge = road === 0 ? bounds.minX : isLit(west) ? west.rect.maxX : undefined;
      const eastEdge = road === blocksPerSide ? bounds.maxX : isLit(east) ? east.rect.minX : undefined;
      const { rect: alongZ } = (west ?? east)!;
      lightRoad(westEdge, eastEdge, alongZ.minZ, alongZ.maxZ, city.avenues.columns.has(road), 'z', streetLightSpacing, lights);
    }
  }
  return lights;
}
