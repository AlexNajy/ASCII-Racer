// A rectangle on the ground plane, seen from above. Units are metres.
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface CitySettings {
  blockSize: number;
  roadWidth: number;
  blocksPerSide: number;
}

export const DEFAULT_CITY_SETTINGS: CitySettings = {
  blockSize: 60,
  roadWidth: 12,
  blocksPerSide: 8,
};

export interface City {
  bounds: Rect;
  blocks: Rect[];
  markings: Rect[];
}

// Wider than real road paint (~0.12 m) so the lines still cover a character cell from a distance.
const MARKING_WIDTH = 0.4;
const DASH_LENGTH = 3;
const DASH_GAP = 3;

// Blocks on a square grid, centred on the origin. Everything inside the bounds that isn't a block is road.
export function generateCity(settings: CitySettings): City {
  const { blockSize, roadWidth, blocksPerSide } = settings;
  const spacing = blockSize + roadWidth;
  // A road runs around the outside too, so there is one more road than there are blocks.
  const size = blocksPerSide * spacing + roadWidth;
  const start = -size / 2 + roadWidth;

  const blocks: Rect[] = [];
  for (let row = 0; row < blocksPerSide; row++) {
    for (let column = 0; column < blocksPerSide; column++) {
      const minX = start + column * spacing;
      const minZ = start + row * spacing;
      blocks.push({ minX, minZ, maxX: minX + blockSize, maxZ: minZ + blockSize });
    }
  }

  // Centre lines run along each road segment between two intersections, so dashes don't cross junctions.
  const markings: Rect[] = [];
  const dashCount = Math.floor((blockSize + DASH_GAP) / (DASH_LENGTH + DASH_GAP));
  const dashesLength = dashCount * DASH_LENGTH + (dashCount - 1) * DASH_GAP;
  const dashStart = (blockSize - dashesLength) / 2;
  for (let road = 0; road <= blocksPerSide; road++) {
    const centre = start - roadWidth / 2 + road * spacing;
    const across = { min: centre - MARKING_WIDTH / 2, max: centre + MARKING_WIDTH / 2 };
    for (let segment = 0; segment < blocksPerSide; segment++) {
      for (let dash = 0; dash < dashCount; dash++) {
        const along = start + segment * spacing + dashStart + dash * (DASH_LENGTH + DASH_GAP);
        markings.push({ minX: along, minZ: across.min, maxX: along + DASH_LENGTH, maxZ: across.max });
        markings.push({ minX: across.min, minZ: along, maxX: across.max, maxZ: along + DASH_LENGTH });
      }
    }
  }

  const half = size / 2;
  return { bounds: { minX: -half, minZ: -half, maxX: half, maxZ: half }, blocks, markings };
}
