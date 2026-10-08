import { Zone, type Block, type City, type CitySettings } from './city.ts';

export interface StreetLight {
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
}

const LIT_ZONES: readonly Zone[] = [Zone.LowDensity, Zone.MidDensity, Zone.HighRise];
const CURB_DISTANCE = 1;
const CORNER_CLEARANCE = 8; // kept free for traffic lights and stop signs

interface LitSide {
  across: number;
  facing: number;
}

// One road segment between two intersections. Lights alternate sides if both blocks are lit.
function lightRoad(
  before: Block | undefined,
  after: Block | undefined,
  runsAlong: 'x' | 'z',
  spacing: number,
  lights: StreetLight[],
): void {
  const isLit = (block: Block | undefined): block is Block => block !== undefined && LIT_ZONES.includes(block.zone);
  const sides: LitSide[] = [];
  if (isLit(before)) {
    const edge = runsAlong === 'x' ? before.rect.maxZ : before.rect.maxX;
    sides.push({ across: edge - CURB_DISTANCE, facing: 1 });
  }
  if (isLit(after)) {
    const edge = runsAlong === 'x' ? after.rect.minZ : after.rect.minX;
    sides.push({ across: edge + CURB_DISTANCE, facing: -1 });
  }
  if (sides.length === 0) return;

  const { rect } = (before ?? after)!;
  const [start, end] = runsAlong === 'x' ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
  const from = start + CORNER_CLEARANCE;
  const span = end - start - 2 * CORNER_CLEARANCE;
  const count = Math.floor(span / spacing) + 1;
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? from + span / 2 : from + (i * span) / (count - 1);
    const { across, facing } = sides[i % sides.length];
    lights.push(
      runsAlong === 'x'
        ? { x: along, z: across, facingX: 0, facingZ: facing }
        : { x: across, z: along, facingX: facing, facingZ: 0 },
    );
  }
}

export function generateStreetLights(city: City, settings: CitySettings): StreetLight[] {
  const { blocksPerSide, streetLightSpacing } = settings;
  const blockAt = (column: number, row: number): Block | undefined =>
    column >= 0 && column < blocksPerSide && row >= 0 && row < blocksPerSide
      ? city.blocks[row * blocksPerSide + column]
      : undefined;
  const lights: StreetLight[] = [];
  for (let road = 0; road <= blocksPerSide; road++) {
    for (let segment = 0; segment < blocksPerSide; segment++) {
      lightRoad(blockAt(segment, road - 1), blockAt(segment, road), 'x', streetLightSpacing, lights);
      lightRoad(blockAt(road - 1, segment), blockAt(road, segment), 'z', streetLightSpacing, lights);
    }
  }
  return lights;
}
