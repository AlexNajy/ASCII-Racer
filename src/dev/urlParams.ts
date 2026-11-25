import { RenderMode } from './menu.ts';
import type { Camera } from '../render/camera.ts';

// Read once at startup, for repeatable pictures (`npm run shots`). With none of them present nothing changes.
export interface UrlParams {
  seed: number | null;
  renderMode: RenderMode | null;
  camera: Camera | null; // a fly camera pose, which switches to the fly camera
  tick: number | null; // the world is stepped to this tick with no input and then held
  shot: boolean; // mark the canvas when a frame has been drawn
}

export const MAX_URL_TICK = 216000; // one hour of ticks

function number(name: string, value: string): number {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) throw new Error(`URL parameter ${name}: "${value}" is not a number`);
  return parsed;
}

export function parseUrlParams(search: string): UrlParams {
  const query = new URLSearchParams(search);
  const seed = query.get('seed');
  const mode = query.get('mode');
  const camera = query.get('camera');
  const tick = query.get('tick');

  let renderMode: RenderMode | null = null;
  if (mode !== null) {
    const name = Object.keys(RenderMode).find((key) => key.toLowerCase() === mode.toLowerCase());
    if (!name) throw new Error(`URL parameter mode: "${mode}" is not one of ${Object.keys(RenderMode).join(', ')}`);
    renderMode = RenderMode[name as keyof typeof RenderMode];
  }

  let pose: Camera | null = null;
  if (camera !== null) {
    const parts = camera.split(',');
    if (parts.length !== 5) throw new Error('URL parameter camera: expected x,y,z,yaw,pitch (angles in degrees)');
    const [x, y, z, yaw, pitch] = parts.map((part) => number('camera', part));
    const radians = Math.PI / 180;
    pose = { position: [x, y, z], yaw: yaw * radians, pitch: pitch * radians };
  }

  const tickNumber = tick === null ? null : number('tick', tick);
  if (tickNumber !== null && (!Number.isInteger(tickNumber) || tickNumber < 0 || tickNumber > MAX_URL_TICK)) {
    throw new Error(`URL parameter tick: expected a whole number of ticks, 0 to ${MAX_URL_TICK}`);
  }
  const seedNumber = seed === null ? null : number('seed', seed);
  if (seedNumber !== null && (!Number.isInteger(seedNumber) || seedNumber < 0)) {
    throw new Error('URL parameter seed: expected a whole number, 0 or more');
  }

  return {
    seed: seedNumber,
    renderMode,
    camera: pose,
    tick: tickNumber,
    shot: query.has('shot') || tick !== null,
  };
}
