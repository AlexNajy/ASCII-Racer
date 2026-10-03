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
}

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

  const half = size / 2;
  return { bounds: { minX: -half, minZ: -half, maxX: half, maxZ: half }, blocks };
}
