import { CELL_WIDTH_MAX, CELL_WIDTH_MIN, RenderMode } from './menu.ts';
import { RESULTS_OPTIONS, type GameStateKind } from '../app/gameState.ts';
import { MENU_ENTRIES } from '../app/mainMenu.ts';
import { NICKNAME_MAX, nicknameCharacter } from '../app/settings.ts';
import { SETTINGS_ROWS } from '../app/settingsMenu.ts';
import type { Camera } from '../render/camera.ts';

// Read once at startup, for repeatable pictures (`npm run shots`). With none of them present nothing changes.
export interface UrlParams {
  seed: number | null;
  renderMode: RenderMode | null;
  camera: Camera | null; // a fly camera pose, which switches to the fly camera
  tick: number | null; // the world is stepped to this tick with no input and then held
  shot: boolean; // mark the canvas when a frame has been drawn
  drive: boolean; // the held tick's stepping holds full throttle instead of no input
  hud: 'test' | null; // fill the text layer with a test card
  cellWidth: number | null; // CSS px, as the dev menu's cell width
  race: boolean; // race=0: the race state drives freely from the middle junction instead of on the city seed's route
  gate: number | null; // the race's next gate once it starts, to show a later gate lit; the gate count finishes it
  car: { x: number; z: number; quarterTurns: number } | null; // the car's place after the race starts, heading in quarter turns left of north
  state: GameStateKind; // the screen the game starts on, the menu without the parameter
  entry: number | null; // the menu entry (with state=results the finish screen's option, state=settings the row) selected at the start, 0 first
  edit: string | null; // with state=settings: the nickname being typed, as if typed so far
}

const URL_STATES: Record<string, GameStateKind> = { menu: 'menu', prerace: 'preRace', race: 'race', results: 'results', settings: 'settings' };

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
  const hud = query.get('hud');
  const cell = query.get('cell');
  const race = query.get('race');
  const gate = query.get('gate');
  const car = query.get('car');
  const state = query.get('state');
  const entry = query.get('entry');
  const edit = query.get('edit');

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

  if (hud !== null && hud !== 'test') throw new Error(`URL parameter hud: "${hud}" is not test`);
  const cellWidth = cell === null ? null : number('cell', cell);
  if (cellWidth !== null && (!Number.isInteger(cellWidth) || cellWidth < CELL_WIDTH_MIN || cellWidth > CELL_WIDTH_MAX)) {
    throw new Error(`URL parameter cell: expected a whole number of CSS pixels, ${CELL_WIDTH_MIN} to ${CELL_WIDTH_MAX}`);
  }

  if (race !== null && race !== '0' && race !== '1') throw new Error(`URL parameter race: "${race}" is not 0 or 1`);
  const gateNumber = gate === null ? null : number('gate', gate);
  if (gateNumber !== null && (!Number.isInteger(gateNumber) || gateNumber < 0)) {
    throw new Error('URL parameter gate: expected a whole number, 0 or more');
  }

  let carPose: UrlParams['car'] = null;
  if (car !== null) {
    const parts = car.split(',');
    if (parts.length !== 3) throw new Error('URL parameter car: expected x,z,quarterTurns');
    const [x, z, quarterTurns] = parts.map((part) => number('car', part));
    if (!Number.isInteger(quarterTurns)) throw new Error('URL parameter car: quarterTurns must be a whole number');
    carPose = { x, z, quarterTurns };
  }

  if (state !== null && !Object.keys(URL_STATES).includes(state)) {
    throw new Error(`URL parameter state: "${state}" is not one of ${Object.keys(URL_STATES).join(', ')}`);
  }

  const entryNumber = entry === null ? null : number('entry', entry);
  const entries = state === 'results' ? RESULTS_OPTIONS.length : state === 'settings' ? SETTINGS_ROWS.length : MENU_ENTRIES.length;
  if (entryNumber !== null && (!Number.isInteger(entryNumber) || entryNumber < 0 || entryNumber >= entries)) {
    throw new Error(`URL parameter entry: expected a whole number, 0 to ${entries - 1}`);
  }

  if (edit !== null && (state !== 'settings' || edit.length > NICKNAME_MAX || ![...edit].every(nicknameCharacter))) {
    throw new Error(`URL parameter edit: needs state=settings and up to ${NICKNAME_MAX} letters, digits or spaces`);
  }

  return {
    seed: seedNumber,
    renderMode,
    camera: pose,
    tick: tickNumber,
    shot: query.has('shot') || tick !== null,
    drive: query.get('drive') === '1',
    hud,
    cellWidth,
    race: race !== '0',
    gate: gateNumber,
    car: carPose,
    state: state === null ? 'menu' : URL_STATES[state],
    entry: entryNumber,
    edit,
  };
}
