import './style.css';
import { parseUrlParams } from './dev/urlParams.ts';
import { browserContextFactory, createAudio, installGestureStart, installVisibility, shouldBlip } from './audio/audio.ts';
import { ambienceHeard, createAmbience } from './audio/ambience.ts';
import { createEngine, engineHeard, engineSpeed } from './audio/engine.ts';
import { createThuds } from './audio/impacts.ts';
import { createScreech } from './audio/tyres.ts';
import { createAudioTuning } from './audio/tuning.ts';
import { createDevMenu, Movement, RenderMode, type DevSettings } from './dev/menu.ts';
import { advanceClock, capFrameSeconds, createClock, TICK_SECONDS, TICKS_PER_SECOND } from './game/clock.ts';
import { blendCars, CAR_WIDTH, createCar, DEFAULT_CAR_SETTINGS, type Car, type CarSettings, type Impact } from './game/car.ts';
import { NO_INPUT, readCarInput } from './game/carInput.ts';
import { updateFlyCamera } from './game/flyCamera.ts';
import {
  createChaseCamera,
  DEFAULT_CHASE_CAMERA_SETTINGS,
  updateChaseCamera,
  type ChaseCameraSettings,
} from './game/chaseCamera.ts';
import { inset, SETBACK } from './game/buildings.ts';
import { DEFAULT_CITY_SETTINGS, CURB_HEIGHT, subtract, Zone, type CitySettings, type Rect } from './game/city.ts';
import { pushOutOfColliders } from './game/collision.ts';
import { FENCE_HEIGHT } from './game/fences.ts';
import { lotPavements } from './game/lots.ts';
import { POND_RADIUS } from './game/park.ts';
import { signalPhase } from './game/signals.ts';
import { generateRoute, type Route } from './game/route.ts';
import { goTick, raceTicks, type Race } from './game/race.ts';
import { decodeLogText, encodeLogText, InputRecorder } from './game/inputLog.ts';
import { replayInWorld } from './game/replay.ts';
import { createWorld, regenerateCity as regenerateWorldCity, startRace, stepWorld, type CityData } from './game/world.ts';
import { DAILY_EPOCH, dailyCitySettings, dailyRace, dayNumber, MS_PER_DAY } from './game/daily.ts';
import { carSettingsFor, cityRoute, enterState, randomCitySeed, seedRoute, unlimitedRoute } from './app/flow.ts';
import { dailyEntry, recordOnChange, resultsOfRecord, startDaily } from './app/dailyFlow.ts';
import { backendConfig, createDailyBackend, ResultsBoard, runNickname } from './app/dailyBackend.ts';
import { sampleBoard } from './dev/sampleBoard.ts';
import type { DailyResults } from './app/dailyResults.ts';
import { copyText } from './app/clipboard.ts';
import { shareLabel, shareText, type ShareFeedback } from './app/share.ts';
import { browserBackend } from './app/dailyBackendBrowser.ts';
import {
  dailyTry,
  finishedRecord,
  loadDailyRecord,
  mergeForStore,
  millisecondsToDay,
  newerRecord,
  readableRecord,
  saveDailyRecord,
  settleRecord,
  type DailyRecord,
} from './app/dailyRecord.ts';
import {
  afterTick,
  dailyRacing,
  dailyResults,
  FIRST_OPTION,
  GARAGE,
  giveUp,
  MENU,
  menuAt,
  moveSelection,
  opensDaily,
  preRace,
  loaded,
  loading,
  pressEnter,
  picksShare,
  FIRST_DAILY_ENTRY,
  pressEscape,
  race as raceState,
  raceFinished,
  selectEntry,
  type GameState,
} from './app/gameState.ts';
import { cycleChoice, GARAGE_ROWS, garageClick, type GarageChange } from './app/garageMenu.ts';
import { pointerCell } from './app/pointer.ts';
import { DEFAULT_PLAYER_SETTINGS, loadSettings, saveSettings, serialiseSettings, type PlayerSettings } from './app/settings.ts';
import { modifiedKeyOutcome, settingsClick, settingsKey, settingsKeyFromEvent, type SettingsChange } from './app/settingsMenu.ts';
import {
  isFullscreen,
  takeMouseMovement,
  toggleFullscreen,
  trackFullscreenKey,
  trackKeyboard,
  trackKeyPress,
  trackMouse,
} from './game/input.ts';
import {
  createColorTarget,
  createRenderTarget,
  deleteColorTarget,
  resizeRenderTarget,
  type ColorTarget,
} from './gl/framebuffer.ts';
import { createProgram } from './gl/shader.ts';
import { identity, multiply, normalize, perspective, rotationY, translation, type Mat4, type Vec3 } from './math/mat4.ts';
import { viewMatrix, type Camera } from './render/camera.ts';
import { flightPath, flightPose } from './render/menuFlight.ts';
import { createGlyphAtlas } from './render/glyphs.ts';
import { createHudTexture, uploadHud } from './hud/hudTexture.ts';
import { drawHud, giveUpShown } from './hud/hud.ts';
import { routeGuidance } from './hud/guidance.ts';
import { createMinimap } from './hud/minimap.ts';
import { drawFinishScreen, finishLayout } from './hud/finishScreen.ts';
import { drawGarageScreen, garageLayout, garageRowAt } from './hud/garageScreen.ts';
import { drawLoadingScreen } from './hud/loadingScreen.ts';
import { drawMenuScreen, menuEntryAt, menuLayout } from './hud/menuScreen.ts';
import { dailyResultsLayout, drawDailyResultsScreen, drawPreRaceScreen } from './hud/dailyScreens.ts';
import { drawSettingsScreen, settingsLayout, settingsRowAt } from './hud/settingsScreen.ts';
import { drawTestCard } from './hud/testCard.ts';
import { printableRows, TextGrid } from './hud/textGrid.ts';
import { ANIMATED_MATERIALS, EDGE_MATERIALS, SCATTER_MATERIALS, STROKE_MATERIALS, STROKE_ROW, SCATTER_SETTINGS, scatterParams, GLYPH_RAMPS, MATERIAL, RAMP_LENGTH, type Material } from './render/materials.ts';
import { createSignalTexture, updateSignalTexture } from './render/signalTexture.ts';
import { box, flatDisc, FLOATS_PER_VERTEX, withMaterial, withSideColor, withSideMaterial } from './render/shapes.ts';
import { windowStyleParams } from './render/models/facade.ts';
import { streetLightVertices } from './render/models/street/streetLight.ts';
import { stopSignVertices } from './render/models/street/stopSign.ts';
import { trafficLightVertices } from './render/models/street/trafficLight.ts';
import { carVertices } from './render/models/car.ts';
import { carColor } from './render/models/palettes.ts';
import {
  GARAGE_AMBIENT,
  GARAGE_CAMERA,
  GARAGE_LIGHT_DIRECTION,
  GARAGE_LIGHT_INTENSITY,
  garageFloorVertices,
  garageHeading,
} from './render/garage.ts';
import { routeGateVertices } from './render/models/gate.ts';
import { DEFAULT_SKY_SETTINGS, FLOATS_PER_STAR, starVertices, type SkySettings } from './render/sky.ts';
import { headlight, HEADLIGHT_SOFT_EDGE } from './render/headlights.ts';
import { burst, createParticles, FLOATS_PER_PARTICLE, MAX_PARTICLES, particleVertices, updateParticles, type ParticleKind } from './render/particles.ts';
import { DRIFT_SLIDE_SPEED, rearWheels, slideSpeed } from './render/drift.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert.glsl?raw';
import asciiFragmentSource from './shaders/ascii.frag.glsl?raw';
import crtFragmentSource from './shaders/crt.frag.glsl?raw';
import resolveFragmentSource from './shaders/resolve.frag.glsl?raw';
import skyVertexSource from './shaders/sky.vert.glsl?raw';
import skyFragmentSource from './shaders/sky.frag.glsl?raw';
import particleVertexSource from './shaders/particle.vert.glsl?raw';
import particleFragmentSource from './shaders/particle.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 not supported');

const program = createProgram(gl, vertexSource, fragmentSource);
const modelViewLocation = gl.getUniformLocation(program, 'u_modelView');
const normalMatrixLocation = gl.getUniformLocation(program, 'u_normalMatrix');
const projectionLocation = gl.getUniformLocation(program, 'u_projection');
const fogColorLocation = gl.getUniformLocation(program, 'u_fogColor');
const fogStartLocation = gl.getUniformLocation(program, 'u_fogStart');
const fogEndLocation = gl.getUniformLocation(program, 'u_fogEnd');
const showNormalsLocation = gl.getUniformLocation(program, 'u_showNormals');
const lightDirectionLocation = gl.getUniformLocation(program, 'u_lightDirection');
const lightIntensityLocation = gl.getUniformLocation(program, 'u_lightIntensity');
const ambientLocation = gl.getUniformLocation(program, 'u_ambient');
const modelLocation = gl.getUniformLocation(program, 'u_model');
const headlightPositionLocation = gl.getUniformLocation(program, 'u_headlightPosition');
const headlightDirectionLocation = gl.getUniformLocation(program, 'u_headlightDirection');
const headlightOuterCosLocation = gl.getUniformLocation(program, 'u_headlightOuterCos');
const headlightInnerCosLocation = gl.getUniformLocation(program, 'u_headlightInnerCos');
const headlightRangeLocation = gl.getUniformLocation(program, 'u_headlightRange');
const headlightIntensityLocation = gl.getUniformLocation(program, 'u_headlightIntensity');
const positionLocation = gl.getAttribLocation(program, 'a_position');
const colorLocation = gl.getAttribLocation(program, 'a_color');
const normalLocation = gl.getAttribLocation(program, 'a_normal');
const emissionLocation = gl.getAttribLocation(program, 'a_emission');
const idLocation = gl.getAttribLocation(program, 'a_id');
const materialLocation = gl.getAttribLocation(program, 'a_material');
const facadeUvLocation = gl.getAttribLocation(program, 'a_facadeUv');
const facadeLocation = gl.getAttribLocation(program, 'a_facade');
const windowStylesLocation = gl.getUniformLocation(program, 'u_windowStyles');
const windowLitMaterialLocation = gl.getUniformLocation(program, 'u_windowLitMaterial');
const windowDarkMaterialLocation = gl.getUniformLocation(program, 'u_windowDarkMaterial');
const beaconOnLocation = gl.getUniformLocation(program, 'u_beaconOn');
const brakingLocation = gl.getUniformLocation(program, 'u_braking');
const nextGateLocation = gl.getUniformLocation(program, 'u_nextGate');
const gatePulseLocation = gl.getUniformLocation(program, 'u_gatePulse');
const signalsTextureLocation = gl.getUniformLocation(program, 'u_signals');
const sceneScatterMaterialsLocation = gl.getUniformLocation(program, 'u_scatterMaterials');
const scatterParamsLocation = gl.getUniformLocation(program, 'u_scatterParams');
const supersampleLocation = gl.getUniformLocation(program, 'u_supersample');

interface Mesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  vertexCount: number;
}

function uploadMesh(vertices: number[]): Mesh {
  const vao = gl!.createVertexArray();
  gl!.bindVertexArray(vao);

  const buffer = gl!.createBuffer();
  gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(vertices), gl!.STATIC_DRAW);

  const stride = FLOATS_PER_VERTEX * 4;
  gl!.enableVertexAttribArray(positionLocation);
  gl!.vertexAttribPointer(positionLocation, 3, gl!.FLOAT, false, stride, 0);
  gl!.enableVertexAttribArray(colorLocation);
  gl!.vertexAttribPointer(colorLocation, 3, gl!.FLOAT, false, stride, 3 * 4);
  gl!.enableVertexAttribArray(normalLocation);
  gl!.vertexAttribPointer(normalLocation, 3, gl!.FLOAT, false, stride, 6 * 4);
  gl!.enableVertexAttribArray(emissionLocation);
  gl!.vertexAttribPointer(emissionLocation, 1, gl!.FLOAT, false, stride, 9 * 4);
  gl!.enableVertexAttribArray(idLocation);
  gl!.vertexAttribPointer(idLocation, 1, gl!.FLOAT, false, stride, 10 * 4);
  gl!.enableVertexAttribArray(materialLocation);
  gl!.vertexAttribPointer(materialLocation, 1, gl!.FLOAT, false, stride, 11 * 4);
  gl!.enableVertexAttribArray(facadeUvLocation);
  gl!.vertexAttribPointer(facadeUvLocation, 2, gl!.FLOAT, false, stride, 12 * 4);
  gl!.enableVertexAttribArray(facadeLocation);
  gl!.vertexAttribPointer(facadeLocation, 2, gl!.FLOAT, false, stride, 14 * 4);

  gl!.bindVertexArray(null);
  return { vao, buffer, vertexCount: vertices.length / FLOATS_PER_VERTEX };
}

function deleteMesh(mesh: Mesh) {
  gl!.deleteBuffer(mesh.buffer);
  gl!.deleteVertexArray(mesh.vao);
}

// The player's car, rebuilt whenever the garage's choice changes.
let carMesh: Mesh | null = null;
let carMeshChoice = '';
function updateCarMesh(): Mesh {
  const choice = `${playerSettings.carShape} ${playerSettings.carColor}`;
  if (!carMesh || choice !== carMeshChoice) {
    if (carMesh) deleteMesh(carMesh);
    carMesh = uploadMesh(carVertices(playerSettings.carShape, carColor(playerSettings.carColor)));
    carMeshChoice = choice;
  }
  return carMesh;
}
const garageFloorMesh = uploadMesh(garageFloorVertices());

const skyProgram = createProgram(gl, skyVertexSource, skyFragmentSource);
const skyViewRotationLocation = gl.getUniformLocation(skyProgram, 'u_viewRotation');
const skyProjectionLocation = gl.getUniformLocation(skyProgram, 'u_projection');
const skyMaterialLocation = gl.getUniformLocation(skyProgram, 'u_material');
const skyCellsLocation = gl.getUniformLocation(skyProgram, 'u_cells');
const skyPointSizeLocation = gl.getUniformLocation(skyProgram, 'u_pointSize');
const skySettings: SkySettings = { ...DEFAULT_SKY_SETTINGS };
let starCount = 0;
const starBuffer = gl.createBuffer();
const starVao = gl.createVertexArray();
gl.bindVertexArray(starVao);
gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
const starDirectionLocation = gl.getAttribLocation(skyProgram, 'a_direction');
const starColorLocation = gl.getAttribLocation(skyProgram, 'a_color');
gl.enableVertexAttribArray(starDirectionLocation);
gl.vertexAttribPointer(starDirectionLocation, 3, gl.FLOAT, false, FLOATS_PER_STAR * 4, 0);
gl.enableVertexAttribArray(starColorLocation);
gl.vertexAttribPointer(starColorLocation, 3, gl.FLOAT, false, FLOATS_PER_STAR * 4, 3 * 4);
gl.bindVertexArray(null);

function uploadStars() {
  const stars = starVertices(skySettings);
  starCount = stars.length / FLOATS_PER_STAR;
  gl!.bindBuffer(gl!.ARRAY_BUFFER, starBuffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(stars), gl!.STATIC_DRAW);
}
uploadStars();

const particleProgram = createProgram(gl, particleVertexSource, particleFragmentSource);
const particleViewLocation = gl.getUniformLocation(particleProgram, 'u_view');
const particleProjectionLocation = gl.getUniformLocation(particleProgram, 'u_projection');
const particleFogColorLocation = gl.getUniformLocation(particleProgram, 'u_fogColor');
const particleFogStartLocation = gl.getUniformLocation(particleProgram, 'u_fogStart');
const particleFogEndLocation = gl.getUniformLocation(particleProgram, 'u_fogEnd');
const particleCellsLocation = gl.getUniformLocation(particleProgram, 'u_cells');
const particlePointSizeLocation = gl.getUniformLocation(particleProgram, 'u_pointSize');
const particles = createParticles();
// Sized once for the most particles there can be; each frame only overwrites the part in use.
const particleBuffer = gl.createBuffer();
const particleVao = gl.createVertexArray();
gl.bindVertexArray(particleVao);
gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * FLOATS_PER_PARTICLE * 4, gl.DYNAMIC_DRAW);
const particlePositionLocation = gl.getAttribLocation(particleProgram, 'a_position');
const particleColorLocation = gl.getAttribLocation(particleProgram, 'a_color');
const particleMaterialLocation = gl.getAttribLocation(particleProgram, 'a_material');
gl.enableVertexAttribArray(particlePositionLocation);
gl.vertexAttribPointer(particlePositionLocation, 3, gl.FLOAT, false, FLOATS_PER_PARTICLE * 4, 0);
gl.enableVertexAttribArray(particleColorLocation);
gl.vertexAttribPointer(particleColorLocation, 3, gl.FLOAT, false, FLOATS_PER_PARTICLE * 4, 3 * 4);
gl.enableVertexAttribArray(particleMaterialLocation);
gl.vertexAttribPointer(particleMaterialLocation, 1, gl.FLOAT, false, FLOATS_PER_PARTICLE * 4, 6 * 4);
gl.bindVertexArray(null);
const DEBRIS: ParticleKind = { color: [1, 0.9, 0.7], material: MATERIAL.debris, life: 1.5, spread: 0.8, gravity: 1, drag: 0.2 };
const DRIFT_SPARKS: ParticleKind = { color: [0.9, 0.9, 0.9], material: MATERIAL.driftSpark, life: 0.7, spread: 0.6, gravity: 1, drag: 0.3 };
const DEBRIS_MIN_SPEED = 3; // m/s into a wall, softer bumps throw nothing
const DEBRIS_PER_SPEED = 6; // particles per m/s into the wall
const DEBRIS_SPEED_SHARE = 0.5; // debris flies off at up to this share of the impact speed
const DEBRIS_HEIGHT = 0.7; // m, about the bumper

// Debris flies back off the wall from where the car touched it, more and faster the harder it hit.
function crashDebris({ speed, normalX, normalZ }: Impact) {
  const { car } = world;
  if (speed < DEBRIS_MIN_SPEED) return;
  const contact: Vec3 = [car.x - normalX * (CAR_WIDTH / 2), DEBRIS_HEIGHT, car.z - normalZ * (CAR_WIDTH / 2)];
  const count = Math.round(speed * DEBRIS_PER_SPEED);
  burst(particles, DEBRIS, contact, [normalX, 0, normalZ], count, speed * DEBRIS_SPEED_SHARE);
}

const DRIFT_PARTICLES_PER_SLIDE_SPEED = 0.25; // per wheel per tick, per m/s sideways
const DRIFT_PARTICLE_SPEED_SHARE = 0.6; // particles fly up at up to this share of the slide speed

// Bursts from the bottom of the rear tyres while sliding, like crash debris: more and faster the harder the slide.
function driftParticles() {
  const { car } = world;
  const slide = slideSpeed(car);
  if (slide <= DRIFT_SLIDE_SPEED) return;
  const count = Math.max(1, Math.round(slide * DRIFT_PARTICLES_PER_SLIDE_SPEED));
  for (const [x, z] of rearWheels(car)) {
    burst(particles, DRIFT_SPARKS, [x, 0, z], [0, 1, 0], count, slide * DRIFT_PARTICLE_SPEED_SHARE);
  }
}

function slab(rect: Rect, bottom: number, top: number, color: Vec3): number[] {
  return box([rect.minX, bottom, rect.minZ], [rect.maxX, top, rect.maxZ], color);
}

const ROAD_COLOR: Vec3 = [0.2, 0.2, 0.2];
const CONCRETE_COLOR: Vec3 = [0.42, 0.42, 0.42];
const GRASS_COLOR: Vec3 = [0.2, 0.45, 0.15];

// What each block's ground is made of. With `sidewalk`, the setback in front of the buildings is concrete and the
// ground sits inside it. 'lot': a car park at road level inside a sidewalk with an entrance (game/lots.ts).
const ZONE_SURFACES: Record<Zone, { material: Material; color: Vec3; sidewalk?: boolean } | 'lot'> = {
  [Zone.LowDensity]: { material: 'concrete', color: CONCRETE_COLOR },
  [Zone.MidDensity]: { material: 'concrete', color: CONCRETE_COLOR },
  [Zone.HighRise]: { material: 'concrete', color: CONCRETE_COLOR },
  [Zone.Houses]: { material: 'grass', color: GRASS_COLOR, sidewalk: true },
  [Zone.Park]: { material: 'grass', color: GRASS_COLOR },
  [Zone.Supermarket]: 'lot',
  [Zone.ParkingLot]: 'lot',
  [Zone.Plaza]: { material: 'concrete', color: CONCRETE_COLOR },
};

const WINDOW_STYLE_PARAMS = windowStyleParams();
const BEACON_CYCLE_TICKS = 2 * TICKS_PER_SECOND;
const BEACON_ON_TICKS = TICKS_PER_SECOND / 2;
// The next gate breathes between GATE_PULSE_MIN and full glow, brightest on whole cycles of the tick.
const GATE_PULSE_TICKS = 2 * TICKS_PER_SECOND;
const GATE_PULSE_MIN = 0.7;
const POND_SIDES = 24;
const POND_COLOR: Vec3 = [0.15, 0.3, 0.6];
const FENCE_COLOR: Vec3 = [0.45, 0.35, 0.25];

function buildCityMeshes({ city, layout, driveways, models, fences, streetLights, intersections }: CityData): Mesh[] {
  const { buildings } = layout;
  const { trafficLights, stopSigns } = intersections;
  const road = uploadMesh(withMaterial(slab(city.bounds, -0.1, 0, ROAD_COLOR), MATERIAL.defaultRoad));
  // Raised slightly so the paint doesn't fight the road surface for depth.
  const markings = uploadMesh(
    withMaterial(city.markings.flatMap((marking) => slab(marking, 0, 0.02, [1, 1, 1])), MATERIAL.roadMarkings),
  );
  const curb = (vertices: number[]) =>
    withSideColor(withSideMaterial(withMaterial(vertices, MATERIAL.concrete), MATERIAL.defaultCurbSide), CONCRETE_COLOR);
  const pavements = uploadMesh(
    city.blocks.flatMap((block) => {
      const { rect, zone } = block;
      const surface = ZONE_SURFACES[zone];
      if (surface === 'lot') return curb(lotPavements(block, buildings).flatMap((r) => slab(r, 0, CURB_HEIGHT, CONCRETE_COLOR)));
      const { material, color, sidewalk } = surface;
      if (!sidewalk) {
        const vertices = slab(rect, 0, CURB_HEIGHT, color);
        return withSideColor(withSideMaterial(withMaterial(vertices, MATERIAL[material]), MATERIAL.defaultCurbSide), CONCRETE_COLOR);
      }
      // Raised slightly so the ground doesn't fight the sidewalk under it for depth.
      // Driveways are holes in it, where the sidewalk shows through.
      const ground = subtract(inset(rect, SETBACK), driveways).flatMap((r) => slab(r, CURB_HEIGHT, CURB_HEIGHT + 0.02, color));
      return [...curb(slab(rect, 0, CURB_HEIGHT, CONCRETE_COLOR)), ...withMaterial(ground, MATERIAL[material])];
    }),
  );
  const wall = uploadMesh(
    curb([
      ...city.wallPavement.flatMap((strip) => slab(strip, 0, CURB_HEIGHT, CONCRETE_COLOR)),
      ...city.wall.flatMap(({ rect }) => slab(rect, 0, CURB_HEIGHT, CONCRETE_COLOR)),
    ]),
  );
  // Everything on the lots in one mesh, with corners already in world position, so it draws in a single call.
  const modelMesh = uploadMesh(models.vertices);
  const fenceMesh = uploadMesh(
    withMaterial(
      fences.flatMap((rect) => slab(rect, CURB_HEIGHT, CURB_HEIGHT + FENCE_HEIGHT, FENCE_COLOR)),
      MATERIAL.default,
    ),
  );
  const ponds = uploadMesh(
    withMaterial(
      city.blocks
        .filter(({ zone }) => zone === Zone.Park)
        .flatMap(({ rect }) => {
          const centre: Vec3 = [(rect.minX + rect.maxX) / 2, CURB_HEIGHT + 0.02, (rect.minZ + rect.maxZ) / 2];
          return flatDisc(centre, POND_RADIUS, POND_SIDES, POND_COLOR);
        }),
      MATERIAL.water,
    ),
  );
  const lights = uploadMesh(streetLights.flatMap(streetLightVertices));
  const signals = uploadMesh([
    ...trafficLights.flatMap((light) => trafficLightVertices(light)),
    ...stopSigns.flatMap((sign) => stopSignVertices(sign)),
  ]);
  return [road, markings, pavements, wall, modelMesh, fenceMesh, ponds, lights, signals];
}

const citySettings: CitySettings = { ...DEFAULT_CITY_SETTINGS };
const carSettings: CarSettings = { ...DEFAULT_CAR_SETTINGS };
const chaseSettings: ChaseCameraSettings = { ...DEFAULT_CHASE_CAMERA_SETTINGS };

const urlParams = parseUrlParams(window.location.search);
// Shots pin the clock: next= seconds (SHOT_NEXT_SECONDS without it) before the day after day= (day 0 without it).
const SHOT_NEXT_SECONDS = 5 * 3600 + 12 * 60 + 44;
const pinnedNow = urlParams.shot ? DAILY_EPOCH + ((urlParams.day ?? 0) + 1) * MS_PER_DAY - (urlParams.next ?? SHOT_NEXT_SECONDS) * 1000 : null;
// App flow: the daily's day and the countdown to the next one read the browser clock, never the simulation.
function now(): number {
  return pinnedNow ?? Date.now();
}
// The city is today's daily one, day= another day's, seed= any seed.
citySettings.seed = urlParams.seed ?? dailyRace(urlParams.day ?? dayNumber(now())).seed;
// Even reaching localStorage can throw; loadSettings and saveSettings catch it. Shots run with the defaults and
// never write, so every load gives the same picture.
const storage = () => window.localStorage;
let playerSettings: PlayerSettings = urlParams.shot ? { ...DEFAULT_PLAYER_SETTINGS } : loadSettings(storage);
// The daily's try, in memory and, where it can be, in storage; a load with a parameter that changes races, their
// clock or shows a daily screen (urlParams.dailyStorage) neither reads nor writes it. A try that was started before
// this page loaded never finished.
let dailyRecord: DailyRecord | null = null;
// The stored try may have changed in another tab, or be gone; the one that says more wins.
function knownDaily(): DailyRecord | null {
  const today = dayNumber(now());
  const stored = urlParams.dailyStorage ? loadDailyRecord(storage) : null;
  return newerRecord(readableRecord(dailyRecord, today), readableRecord(stored, today));
}
// Read again just before writing; a record that says less than the known one is refused, and memory follows it.
function storeDaily(record: DailyRecord) {
  const kept = mergeForStore(knownDaily(), record, dayNumber(now()));
  dailyRecord = kept;
  if (urlParams.dailyStorage && kept === record) saveDailyRecord(storage, kept);
}
function latestDaily() {
  const latest = settleRecord(knownDaily());
  if (latest && latest !== dailyRecord) storeDaily(latest);
}
latestDaily();
// The daily's server, only in a build that has one and on a load that may store the try: nothing else signs in or
// sends anything. supabase-js loads the first time the daily is opened.
const backendSettings = backendConfig(import.meta.env, urlParams.dailyStorage);
const backendBrowser = backendSettings && browserBackend(backendSettings);
const dailyBackend = createDailyBackend(backendSettings, () => ({
  ...backendBrowser!,
  record: knownDaily,
  write: (record) => {
    storeDaily(record);
    if (gameState.kind === 'dailyResults') changeState(resultsOfRecord(gameState, dailyRecord));
    if (record.sent?.status === 'stored') resultsBoard?.stored(record.day);
  },
  nickname: () => playerSettings.nickname,
  log: (message) => console.log(message),
}));
// The daily results' leaderboard, fetched while the results are open; a board that changes redraws the whole text
// layer, as its layout may differ.
const resultsBoard =
  backendBrowser &&
  new ResultsBoard({
    fetch: (day) => backendBrowser.results(day),
    timer: backendBrowser.timer,
    changed: () => {
      if (urlParams.hud !== 'test') hud.clear();
    },
  });
// shape= and color= pick the car as the garage would (saved with the next change unless under shot).
if (urlParams.shape) playerSettings = { ...playerSettings, carShape: urlParams.shape };
if (urlParams.color) playerSettings = { ...playerSettings, carColor: urlParams.color };

// No context under shot or tick, so those runs never differ.
const audioTuning = createAudioTuning();
const audio = createAudio(urlParams.shot ? null : browserContextFactory(), audioTuning);
audio.setLevels(playerSettings.volume, playerSettings.muted);
if (!urlParams.shot) installGestureStart(window, audio);
installVisibility(document, audio);
const engine = createEngine(audio, audioTuning);
const screech = createScreech(audio, audioTuning);
const thuds = createThuds(audio, audioTuning);
const ambience = createAmbience(audio, audioTuning);
// Filled in place every frame, so driving the sounds allocates nothing.
const engineInput = { speed: 0, topSpeed: 0, throttle: 0, brake: 0 };
const screechInput = { slide: 0, speed: 0 };
const ambienceInput = { speed: 0, topSpeed: 0, car: false };
const impactLog: number[] = []; // audio=debug only: every tick's impact speed
if (urlParams.audioDebug) {
  (window as unknown as { audioDebug: object }).audioDebug = {
    stats: audio.stats,
    waveform: audio.waveform,
    engine: () => ({ ...engine.targets(), ...engineInput }),
    screech: () => ({ ...screech.targets(), ...screechInput }),
    ambience: () => ({ ...ambience.targets(), ...ambienceInput }),
    thuds: () => ({ playing: thuds.playing(), played: thuds.played(), impacts: impactLog.splice(0) }),
    tuning: audioTuning,
  };
}

const asciiProgram = createProgram(gl, fullscreenVertexSource, asciiFragmentSource);
const sceneTextureLocation = gl.getUniformLocation(asciiProgram, 'u_scene');
const normalTextureLocation = gl.getUniformLocation(asciiProgram, 'u_normals');
const scatterTextureLocation = gl.getUniformLocation(asciiProgram, 'u_scatter');
const scatterMaterialsLocation = gl.getUniformLocation(asciiProgram, 'u_scatterMaterials');
const cellSizeLocation = gl.getUniformLocation(asciiProgram, 'u_cellSize');
const glyphsLocation = gl.getUniformLocation(asciiProgram, 'u_glyphs');
const rampLengthLocation = gl.getUniformLocation(asciiProgram, 'u_rampLength');
const edgeMaterialsLocation = gl.getUniformLocation(asciiProgram, 'u_edgeMaterials');
const animatedMaterialsLocation = gl.getUniformLocation(asciiProgram, 'u_animatedMaterials');
const animationPhaseLocation = gl.getUniformLocation(asciiProgram, 'u_animationPhase');
const animationLevelsLocation = gl.getUniformLocation(asciiProgram, 'u_animationLevels');
const waveScaleLocation = gl.getUniformLocation(asciiProgram, 'u_waveScale');
const tickLocation = gl.getUniformLocation(asciiProgram, 'u_tick');
const splashChanceLocation = gl.getUniformLocation(asciiProgram, 'u_splashChance');
const splashTicksLocation = gl.getUniformLocation(asciiProgram, 'u_splashTicks');
const backgroundLocation = gl.getUniformLocation(asciiProgram, 'u_background');
const renderModeLocation = gl.getUniformLocation(asciiProgram, 'u_renderMode');
const glyphShadeLocation = gl.getUniformLocation(asciiProgram, 'u_glyphShade');
const asciiViewRotationLocation = gl.getUniformLocation(asciiProgram, 'u_viewRotation');
const strokeMaterialsLocation = gl.getUniformLocation(asciiProgram, 'u_strokeMaterials');
const strokeRowLocation = gl.getUniformLocation(asciiProgram, 'u_strokeRow');
const hudLocation = gl.getUniformLocation(asciiProgram, 'u_hud');
const textRowLocation = gl.getUniformLocation(asciiProgram, 'u_textRow');
const atlasColumnsLocation = gl.getUniformLocation(asciiProgram, 'u_atlasColumns');
const fullscreenVao = gl.createVertexArray();
const resolveProgram = createProgram(gl, fullscreenVertexSource, resolveFragmentSource);
const resolveSceneLocation = gl.getUniformLocation(resolveProgram, 'u_scene');
const resolveNormalsLocation = gl.getUniformLocation(resolveProgram, 'u_normals');
const resolveScatterLocation = gl.getUniformLocation(resolveProgram, 'u_scatter');
const resolveSupersampleLocation = gl.getUniformLocation(resolveProgram, 'u_supersample');
const resolveCoverageDimmingLocation = gl.getUniformLocation(resolveProgram, 'u_coverageDimming');
const crtProgram = createProgram(gl, fullscreenVertexSource, crtFragmentSource);
const crtImageLocation = gl.getUniformLocation(crtProgram, 'u_image');
// For the CRT glyphs view: the glyph picture is drawn here first, then blurred to the screen. It only exists
// while that view is on, so it costs no memory otherwise.
let glyphImage: ColorTarget | null = null;

// Creates, resizes or deletes the CRT glyph image to match whether the view is on.
function updateGlyphImage(on: boolean): ColorTarget | null {
  const fits = glyphImage !== null && glyphImage.width === canvas.width && glyphImage.height === canvas.height;
  if (glyphImage && (!on || !fits)) {
    deleteColorTarget(gl!, glyphImage);
    glyphImage = null;
  }
  if (on && !glyphImage) glyphImage = createColorTarget(gl!, canvas.width, canvas.height);
  return glyphImage;
}

const settings: DevSettings = {
  fovDegrees: 60,
  cellWidth: urlParams.cellWidth ?? playerSettings.cellWidth,
  viewDistance: 1000,
  fogStart: 150,
  renderMode: urlParams.renderMode ?? RenderMode.Glyphs,
  movement: urlParams.camera ? Movement.FlyCamera : Movement.Car,
  noclip: false,
  ambient: 0.5,
  lightIntensity: 0.4,
  glyphShade: 1,
  headlightAngle: 70,
  headlightRange: 50,
  headlightIntensity: 1,
  animationLevels: 1.5,
  animationSeconds: 10,
  waveScale: 2,
  splashChance: 0.4,
  splashSeconds: 1.2,
  supersample: 3,
  coverageDimming: 0.5,
};

const dpr = window.devicePixelRatio || 1;
const CELL_ASPECT = 1.75;
// The scene is drawn into `scene` with `supersample` × `supersample` samples per cell, then resolved into `cells`,
// one pixel per cell, which the ASCII pass reads.
const scene = createRenderTarget(gl);
const cells = createRenderTarget(gl);

let cellWidth = 0;
let cellHeight = 0;
let glyphAtlas: WebGLTexture | null = null;
// The printable characters follow the material rows in the atlas, cut to the same width.
const ATLAS_COLUMNS = [...GLYPH_RAMPS[0]].length;
const ATLAS_ROWS = [...GLYPH_RAMPS, ...printableRows(ATLAS_COLUMNS)];
const TEXT_ROW = GLYPH_RAMPS.length;
const hud = new TextGrid();
const hudTexture = createHudTexture(gl);

function buildCells() {
  cellWidth = Math.round(settings.cellWidth * dpr);
  cellHeight = Math.round(settings.cellWidth * CELL_ASPECT * dpr);
  gl!.deleteTexture(glyphAtlas);
  glyphAtlas = createGlyphAtlas(gl!, ATLAS_ROWS, cellWidth, cellHeight);
}

function resize() {
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  const columns = Math.ceil(canvas.width / cellWidth);
  const rows = Math.ceil(canvas.height / cellHeight);
  resizeRenderTarget(gl!, cells, columns, rows);
  resizeRenderTarget(gl!, scene, columns * settings.supersample, rows * settings.supersample);
  // Only whole cells, so nothing written is cut off at the right or top edge.
  hud.resize(Math.floor(canvas.width / cellWidth), Math.floor(canvas.height / cellHeight));
  if (urlParams.hud === 'test') drawTestCard(hud);
}

buildCells();
resize();
window.addEventListener('resize', resize);

const background: Vec3 = [0, 0, 0];

// Resolves the scene's samples into cells, then draws the glyphs (and the text layer) to the screen.
function asciiPasses(view: Mat4, tick: number, crtImage: ColorTarget | null) {
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, cells.framebuffer);
  gl!.viewport(0, 0, cells.width, cells.height);
  gl!.disable(gl!.DEPTH_TEST);
  gl!.useProgram(resolveProgram);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.colorTexture);
  gl!.uniform1i(resolveSceneLocation, 0);
  gl!.activeTexture(gl!.TEXTURE2);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.normalTexture);
  gl!.uniform1i(resolveNormalsLocation, 2);
  gl!.activeTexture(gl!.TEXTURE4);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.scatterTexture);
  gl!.uniform1i(resolveScatterLocation, 4);
  gl!.uniform1i(resolveSupersampleLocation, settings.supersample);
  gl!.uniform1f(resolveCoverageDimmingLocation, settings.coverageDimming);
  gl!.bindVertexArray(fullscreenVao);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);

  gl!.bindFramebuffer(gl!.FRAMEBUFFER, crtImage ? crtImage.framebuffer : null);
  gl!.viewport(0, 0, canvas.width, canvas.height);
  gl!.disable(gl!.DEPTH_TEST);

  gl!.useProgram(asciiProgram);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, cells.colorTexture);
  gl!.uniform1i(sceneTextureLocation, 0);
  gl!.uniform2i(cellSizeLocation, cellWidth, cellHeight);
  gl!.activeTexture(gl!.TEXTURE1);
  gl!.bindTexture(gl!.TEXTURE_2D, glyphAtlas);
  gl!.uniform1i(glyphsLocation, 1);
  gl!.activeTexture(gl!.TEXTURE2);
  gl!.bindTexture(gl!.TEXTURE_2D, cells.normalTexture);
  gl!.uniform1i(normalTextureLocation, 2);
  gl!.activeTexture(gl!.TEXTURE4);
  gl!.bindTexture(gl!.TEXTURE_2D, cells.scatterTexture);
  gl!.uniform1i(scatterTextureLocation, 4);
  gl!.uniform1i(scatterMaterialsLocation, SCATTER_MATERIALS);
  gl!.uniform1i(rampLengthLocation, RAMP_LENGTH);
  gl!.uniform1i(edgeMaterialsLocation, EDGE_MATERIALS);
  gl!.uniform1i(animatedMaterialsLocation, ANIMATED_MATERIALS);
  gl!.uniform1i(strokeMaterialsLocation, STROKE_MATERIALS);
  gl!.uniform1i(strokeRowLocation, STROKE_ROW);
  gl!.activeTexture(gl!.TEXTURE5);
  uploadHud(gl!, hudTexture, hud);
  gl!.uniform1i(hudLocation, 5);
  gl!.uniform1i(textRowLocation, TEXT_ROW);
  gl!.uniform1i(atlasColumnsLocation, ATLAS_COLUMNS);
  const animationTicks = Math.round(settings.animationSeconds * TICKS_PER_SECOND);
  gl!.uniform1f(animationPhaseLocation, (tick % animationTicks) / animationTicks);
  gl!.uniform1f(animationLevelsLocation, settings.animationLevels);
  gl!.uniform1f(waveScaleLocation, settings.waveScale);
  gl!.uniform1i(tickLocation, tick);
  gl!.uniform1f(splashChanceLocation, settings.splashChance);
  gl!.uniform1i(splashTicksLocation, Math.max(1, Math.round(settings.splashSeconds * TICKS_PER_SECOND)));
  gl!.uniform3fv(backgroundLocation, background);
  gl!.uniform1f(glyphShadeLocation, settings.glyphShade);
  gl!.uniformMatrix3fv(asciiViewRotationLocation, false, [view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]);
  gl!.uniform1i(renderModeLocation, crtImage ? RenderMode.Glyphs : settings.renderMode);
  gl!.bindVertexArray(fullscreenVao);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  if (!crtImage) return;

  gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  gl!.useProgram(crtProgram);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, crtImage.texture);
  gl!.uniform1i(crtImageLocation, 0);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
}

// The loading line on an empty scene, before the city exists.
function drawLoadingFrame() {
  if (urlParams.hud !== 'test') drawLoadingScreen(hud);
  const crtImage = updateGlyphImage(settings.renderMode === RenderMode.CrtGlyphs);
  const glyphs = settings.renderMode !== RenderMode.FullResolution && settings.renderMode !== RenderMode.Normals;
  const target = glyphs ? scene : { framebuffer: null, width: canvas.width, height: canvas.height };
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
  gl!.viewport(0, 0, target.width, target.height);
  gl!.clearColor(0, 0, 0, 0);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
  if (glyphs) asciiPasses(identity(), 0, crtImage);
}

// A frame is only shown once the task that drew it has ended, so the city is built in a task of its own after it.
await new Promise<void>((resolve) =>
  requestAnimationFrame(() => {
    drawLoadingFrame();
    setTimeout(resolve);
  }),
);

const world = createWorld(citySettings, carSettings);
// What the built city was made from, to tell whether the daily's city is the one loaded.
let builtCity = JSON.stringify(citySettings);
// The game starts on the menu, on the daily while today's try is open. state=race (and results) starts an unlimited
// race on the city seed's route at tick 0, as shots do; race=0 drives freely instead. The daily states use day='s.
let gameState: GameState = dailyTry(dailyRecord, dayNumber(now())).used ? menuAt('unlimited') : MENU;
if (urlParams.state === 'race' || urlParams.state === 'results') {
  const route = urlParams.race ? cityRoute(world) : null;
  gameState = raceState('unlimited', route);
  if (route) startRace(world, route);
} else if (urlParams.state === 'preRace' || urlParams.state === 'dailyRace' || urlParams.state === 'dailyResults') {
  const day = urlParams.day!;
  const { route } = dailyRace(day);
  if (urlParams.state === 'preRace') {
    gameState = preRace(day, route);
    enterState(world, gameState, MENU);
  } else if (urlParams.state === 'dailyResults' && urlParams.dnf) {
    gameState = selectEntry(dailyResults(day, null), urlParams.entry ?? FIRST_DAILY_ENTRY);
  } else {
    gameState = { ...dailyRacing(day, route), givingUp: urlParams.giveUp };
    startRace(world, route);
  }
  world.carSettings = carSettingsFor(gameState, carSettings);
} else if (urlParams.state === 'settings') {
  const editing = urlParams.edit === null ? null : { text: urlParams.edit, tooShort: false };
  gameState = { kind: 'settings', selected: urlParams.entry ?? 0, editing };
} else if (urlParams.state === 'garage') {
  gameState = selectEntry(GARAGE, urlParams.entry ?? 0);
} else if (urlParams.state === 'loading') {
  gameState = loading('unlimited');
} else if (urlParams.entry !== null) {
  gameState = selectEntry(gameState, urlParams.entry);
}
// gate=N with N the number of gates finishes the race once the held tick is reached, at that time.
const finishAtStart = urlParams.gate !== null && world.race !== null && urlParams.gate === world.race.route.gates.length;
if (urlParams.gate !== null && world.race && !finishAtStart) {
  if (urlParams.gate > world.race.route.gates.length) throw new Error(`URL parameter gate: the route has ${world.race.route.gates.length} gates`);
  world.race.nextGate = urlParams.gate;
}
function placeUrlCar(target: typeof world) {
  if (!urlParams.car) return;
  const { x, z, quarterTurns } = urlParams.car;
  target.car = createCar(x, z, (quarterTurns * Math.PI) / 2);
  target.previousCar = { ...target.car };
}
placeUrlCar(world);
// gate= and car= changed this race at its start; a replay of it does the same.
const urlChangedRace = urlParams.gate !== null || urlParams.car ? world.race : null;
// A held tick: the world is stepped there once and the clock never runs, so every frame is the same picture.
const heldTick = urlParams.tick;
const heldInput = urlParams.drive && gameState.kind === 'race' ? { ...NO_INPUT, throttle: 1 } : NO_INPUT;
for (let i = 0; i < (heldTick ?? 0); i++) stepWorld(world, heldInput);
if (finishAtStart && world.race) {
  world.race.nextGate = world.race.route.gates.length;
  world.race.phase = 'finished';
  world.race.finishTick = Math.max(world.tick, goTick(world.race));
}
if (urlParams.state === 'results' || (urlParams.state === 'dailyResults' && !urlParams.dnf)) {
  if (world.race?.phase !== 'finished') throw new Error('URL parameter state: results needs a finished race (gate=<gate count>)');
  const ticks = raceTicks(world.race, world.tick);
  gameState =
    gameState.kind === 'race' && gameState.mode === 'daily'
      ? selectEntry(dailyResults(gameState.day, ticks), urlParams.entry ?? FIRST_DAILY_ENTRY)
      : selectEntry({ kind: 'results', mode: 'unlimited', route: world.race.route, ticks, selected: FIRST_OPTION }, urlParams.entry ?? FIRST_OPTION);
}
let cityMeshes = buildCityMeshes(world);
// The race's gates, rebuilt whenever its route changes; none in free driving.
let gateMesh: Mesh | null = null;
let gateRoute: Route | null = null;
function updateGateMesh() {
  const route = world.race?.route ?? (gameState.kind === 'preRace' ? gameState.route : null);
  if (route === gateRoute) return;
  if (gateMesh) deleteMesh(gateMesh);
  gateMesh = route ? uploadMesh(routeGateVertices(route.gates)) : null;
  gateRoute = route;
}
let signals = createSignalTexture(gl, world.city.junctions.length);
let minimap = createMinimap(world.city);
let flight = flightPath(world.roadGraph);

// Builds the city of `settings`: the world's data, meshes, signals, minimap and flight. Blocks the main thread for a
// moment. The car and the race are left as they were; the caller changes the game state next. The daily's city is
// built from its own settings, so the dev menu's city settings never reach it.
function loadCity(settings: CitySettings) {
  cityMeshes.forEach(deleteMesh);
  world.citySettings = settings;
  builtCity = JSON.stringify(settings);
  regenerateWorldCity(world);
  cityMeshes = buildCityMeshes(world);
  gl!.deleteTexture(signals.texture);
  signals = createSignalTexture(gl!, world.city.junctions.length);
  // The new map may be smaller than the old one; the HUD draws itself again next frame.
  if (urlParams.hud !== 'test') hud.clear();
  minimap = createMinimap(world.city);
  flight = flightPath(world.roadGraph);
}

// The dev menu's regenerate: the old route and the car's place mean nothing in the new city.
function regenerateCity() {
  loadCity(citySettings);
  setGameState(MENU);
}

// Unlimited's next race: a random city that holds a route, built; null when none was found. The seed goes into the
// settings the dev menu edits, so its info line shows the city.
function newUnlimitedRoute(): Route | null {
  const route = unlimitedRoute(randomCitySeed, (seed) => seedRoute(citySettings, seed));
  if (!route) return null;
  citySettings.seed = route.seed;
  loadCity(citySettings);
  return route;
}

function dailyCityBuilt(seed: number): boolean {
  return builtCity === JSON.stringify(dailyCitySettings(seed));
}

// The loading state builds its city in a task after the frame showing the loading line; state=loading only holds it.
const holdLoading = urlParams.state === 'loading';
let loadPending = false;
function finishLoading() {
  loadPending = false;
  if (gameState.kind !== 'loading') return;
  try {
    if (gameState.mode === 'daily') {
      loadCity(dailyCitySettings(gameState.route.seed));
      setGameState(loaded(gameState, gameState.route));
    } else {
      setGameState(loaded(gameState, newUnlimitedRoute()));
    }
  } catch (error) {
    // A failed build must not be retried every frame.
    setGameState(loaded(gameState, null));
    throw error;
  } finally {
    // The countdown starts after the build, not during it.
    previousTimeMs = performance.now();
  }
}

// The loading line goes; the test card stays.
hud.clear();
if (urlParams.hud === 'test') drawTestCard(hud);

const devMenu = createDevMenu(
  settings,
  citySettings,
  carSettings,
  chaseSettings,
  skySettings,
  SCATTER_SETTINGS,
  (setting) => {
    if (setting === 'cellWidth') buildCells();
    if (setting === 'cellWidth' || setting === 'supersample') resize();
    if (setting === 'cellWidth') storePlayerSettings(shownPlayerSettings());
  },
  regenerateCity,
  uploadStars,
  (open) => {
    if (open) document.exitPointerLock();
    else if (!hasList(gameState)) canvas.requestPointerLock().catch(() => {});
  },
  {
    tuning: audioTuning,
    onChange: () => {
      audio.retune();
      engine.retune();
      screech.retune();
      thuds.retune();
      ambience.retune();
    },
    stats: audio.stats,
  },
);

trackKeyboard();
trackFullscreenKey(document.body);
let headlightsOn = true;
trackKeyPress('KeyH', () => (headlightsOn = !headlightsOn));

const camera: Camera = {
  position: [0, 1.5, 4],
  yaw: 0,
  pitch: -0.2,
};
if (urlParams.camera) {
  camera.position = urlParams.camera.position;
  camera.yaw = urlParams.camera.yaw;
  camera.pitch = urlParams.camera.pitch;
}
// After the car jumps to a start, so the chase camera doesn't swing round from where it was.
function faceCarHeading() {
  if (settings.movement !== Movement.Car) return;
  camera.yaw = world.car.heading;
  chase.share = 1;
}
let framesDrawn = 0;
const CAMERA_RADIUS = 0.5;

// A fixed light high up, from +x and +z, until the night lights replace it.
const LIGHT_DIRECTION = normalize([0.5, 1, 0.3]);

function draw(mesh: Mesh, mode: GLenum, view: Mat4, model?: Mat4) {
  gl!.uniformMatrix4fv(modelViewLocation, false, model ? multiply(view, model) : view);
  // Only valid while models have no scaling.
  const m = model ?? identity();
  gl!.uniformMatrix4fv(modelLocation, false, m);
  gl!.uniformMatrix3fv(normalMatrixLocation, false, [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  gl!.bindVertexArray(mesh.vao);
  gl!.drawArrays(mode, 0, mesh.vertexCount);
}

const clock = createClock();
const chase = createChaseCamera();
faceCarHeading();

function setGameState(entered: GameState) {
  // The daily's try is written before its countdown's first tick; its results show what is stored for the day.
  const written = recordOnChange(gameState, entered);
  if (written) storeDaily(written);
  const next = resultsOfRecord(entered, dailyRecord);
  if (dailyBackend) {
    if (written?.status === 'started') dailyBackend.startAttempt(written.day);
    const daily = next.kind === 'preRace' || next.kind === 'dailyResults' || ((next.kind === 'loading' || next.kind === 'race') && next.mode === 'daily');
    if ((next.kind === 'preRace' || next.kind === 'dailyResults') && next.kind !== gameState.kind) dailyBackend.open();
    else if (!daily) dailyBackend.close();
  }
  world.carSettings = carSettingsFor(next, carSettings);
  enterState(world, next, gameState);
  // Every state but the results puts the car somewhere new.
  if (next.kind !== 'results' && next.kind !== 'dailyResults') faceCarHeading();
  gameState = next;
  if (hasList(next) && document.pointerLockElement) document.exitPointerLock();
  if (urlParams.hud !== 'test') hud.clear();
}
// The menu, the finish screen, the garage and the settings are lists chosen from with the keys and the mouse, which
// is never captured there.
function hasList(state: GameState): boolean {
  return state.kind === 'menu' || state.kind === 'results' || state.kind === 'settings' || state.kind === 'garage' || state.kind === 'dailyResults';
}
// The menu's flight, behind the menu, the settings and the daily results when no race is left to watch.
function menuFlight(): boolean {
  return gameState.kind === 'menu' || gameState.kind === 'settings' || (gameState.kind === 'dailyResults' && !world.race);
}
// Only on screen in the car movement; the fly camera hides the text layer.
function listShown(): boolean {
  return hasList(gameState) && settings.movement === Movement.Car;
}
function changeState(next: GameState) {
  if (next === gameState) return;
  // A new selection only redraws the two entry rows; the daily's give-up question only its line.
  if (next.kind === gameState.kind && (hasList(next) || next.kind === 'race')) gameState = next;
  else setGameState(next);
}
// Enter, which on the daily entry (and on the daily results once the next day has begun) reads the clock and the
// stored try.
function enter(state: GameState): GameState {
  if (state.kind === 'dailyResults' && picksShare(state)) {
    shareResults(state);
    return state;
  }
  const today = dayNumber(now());
  if (state.kind === 'preRace') {
    latestDaily();
    return startDaily(state, dailyRecord, today, dailyCityBuilt);
  }
  if (!opensDaily(state, today)) return pressEnter(state, giveUpOnScreen);
  latestDaily();
  return dailyEntry(today, dailyRecord, dailyCityBuilt);
}
// board= on a shot: a made-up day of that many runs, the player's among them when finished.
let shotBoard: { ticks: number | null; board: DailyResults } | null = null;
function boardOf(state: Extract<GameState, { kind: 'dailyResults' }>): DailyResults | null {
  if (urlParams.board === null) return resultsBoard?.results(state.day) ?? null;
  if (shotBoard?.ticks !== state.ticks) shotBoard = { ticks: state.ticks, board: sampleBoard(state.day, urlParams.board, state.ticks, runNickname(playerSettings.nickname)) };
  return shotBoard.board;
}
// The share entry: the text goes to the clipboard from inside the key or click handler; the entry says how it went.
let shareFeedback: ShareFeedback | null = null;
function shareResults(state: Extract<GameState, { kind: 'dailyResults' }>) {
  if (state.ticks === null) return;
  const text = shareText({ day: state.day, ticks: state.ticks, results: boardOf(state) });
  copyText(text).then((copied) => {
    shareFeedback = { outcome: copied ? 'copied' : 'failed', at: performance.now() };
  });
}
function dailyResultsShown(state: Extract<GameState, { kind: 'dailyResults' }>) {
  const leaderboard = dailyBackend ? dailyBackend.status(dailyRecord, state.day) : 'unavailable';
  const untilNext = millisecondsToDay(state.day + 1, now());
  return { day: state.day, ticks: state.ticks, untilNext, leaderboard, board: boardOf(state), nickname: runNickname(playerSettings.nickname), shareLabel: shareLabel(shareFeedback, performance.now()) };
}
function moveMenuSelection(step: number) {
  if (listShown() && !devMenu.isOpen()) changeState(moveSelection(gameState, step));
}
trackKeyPress('ArrowUp', () => moveMenuSelection(-1));
trackKeyPress('KeyW', () => moveMenuSelection(-1));
trackKeyPress('ArrowDown', () => moveMenuSelection(1));
trackKeyPress('KeyS', () => moveMenuSelection(1));
function cellUnder(event: MouseEvent) {
  return pointerCell(event.offsetX, event.offsetY, {
    pixelRatio: dpr,
    cellWidth,
    cellHeight,
    canvasHeight: canvas.height,
    columns: hud.columns,
    rows: hud.rows,
  });
}
function menuEntryUnder(event: MouseEvent): number | null {
  const layout =
    gameState.kind === 'results'
      ? finishLayout(hud.columns, hud.rows, gameState.ticks)
      : gameState.kind === 'dailyResults'
        ? dailyResultsLayout(hud.columns, hud.rows, dailyResultsShown(gameState))
        : menuLayout(hud.columns, hud.rows);
  const cell = cellUnder(event);
  return layout && cell ? menuEntryAt(layout, cell.column, cell.row) : null;
}
function settingUnder(event: MouseEvent) {
  const layout = settingsLayout(hud.columns, hud.rows);
  const cell = cellUnder(event);
  return layout && cell ? settingsRowAt(layout, cell.column, cell.row) : null;
}
function garageRowUnder(event: MouseEvent) {
  const layout = garageLayout(hud.columns, hud.rows);
  const cell = cellUnder(event);
  return layout && cell ? garageRowAt(layout, cell.column, cell.row) : null;
}
canvas.addEventListener('mousemove', (event) => {
  if (!listShown()) return;
  const entry =
    gameState.kind === 'settings'
      ? (settingUnder(event)?.index ?? null)
      : gameState.kind === 'garage'
        ? (garageRowUnder(event)?.index ?? null)
        : menuEntryUnder(event);
  if (entry !== null) changeState(selectEntry(gameState, entry));
});
// The one click path: in the menu, the finish screen and the settings a click picks an entry and never captures the
// pointer; elsewhere it captures it.
trackMouse(canvas, (event) => {
  if (!listShown()) return !hasList(gameState);
  if (gameState.kind === 'settings') {
    const setting = settingUnder(event);
    if (setting) applySettingsChange(settingsClick(gameState, shownPlayerSettings(), setting.index, setting.offset));
    return false;
  }
  if (gameState.kind === 'garage') {
    const row = garageRowUnder(event);
    if (row) applyGarageChange(garageClick(gameState.selected, shownPlayerSettings(), row.index, row.offset));
    return false;
  }
  const entry = menuEntryUnder(event);
  if (entry !== null) {
    const selected = selectEntry(gameState, entry);
    changeState(selected);
    changeState(enter(selected));
  }
  return false;
});
trackKeyPress('Enter', () => {
  if (!devMenu.isOpen()) changeState(enter(gameState));
});
// The give-up question is only asked where it can be seen: the text layer shows only in the glyph modes.
function canAskGiveUp(): boolean {
  const textShown = settings.renderMode === RenderMode.Glyphs || settings.renderMode === RenderMode.CrtGlyphs;
  return settings.movement === Movement.Car && textShown && urlParams.hud !== 'test' && giveUpShown(hud.columns, hud.rows);
}
// Set by the last frame drawn: Enter gives up only once the question has been on screen.
let giveUpOnScreen = false;
trackKeyPress('Escape', () => {
  if (!devMenu.isOpen()) changeState(pressEscape(gameState, canAskGiveUp()));
});
// The garage's Left and Right change the selected row's choice.
function cycleGarage(step: number) {
  if (gameState.kind !== 'garage' || !listShown() || devMenu.isOpen()) return;
  const { selected } = gameState;
  applyGarageChange({ selected, settings: cycleChoice(shownPlayerSettings(), GARAGE_ROWS[selected], step) });
}
trackKeyPress('ArrowLeft', () => cycleGarage(-1));
trackKeyPress('KeyA', () => cycleGarage(-1));
trackKeyPress('ArrowRight', () => cycleGarage(1));
trackKeyPress('KeyD', () => cycleGarage(1));

// The player's settings with the cell width the renderer uses: the dev menu's, which the URL parameter cell= may
// have set instead of the stored one.
function shownPlayerSettings(): PlayerSettings {
  return { ...playerSettings, cellWidth: settings.cellWidth };
}
// Saved as they change, except a cell width from cell=, which stays the URL's.
function storePlayerSettings(next: PlayerSettings) {
  const stored = urlParams.cellWidth === null ? next : { ...next, cellWidth: playerSettings.cellWidth };
  if (serialiseSettings(stored) === serialiseSettings(playerSettings)) return;
  playerSettings = stored;
  audio.setLevels(stored.volume, stored.muted);
  if (!urlParams.shot) saveSettings(storage, playerSettings);
}
// Saved at once; the car mesh follows next frame.
function applyGarageChange({ selected, settings: next }: GarageChange) {
  if (gameState.kind !== 'garage') return;
  storePlayerSettings(next);
  changeState(selectEntry(gameState, selected));
}
function applySettingsChange({ screen, settings: next, toggleFullscreen: fullscreen, leave }: SettingsChange) {
  if (gameState.kind !== 'settings') return;
  if (fullscreen) toggleFullscreen(document.body);
  if (next.cellWidth !== settings.cellWidth) {
    settings.cellWidth = next.cellWidth;
    buildCells();
    resize();
    devMenu.refresh('cellWidth');
  }
  const previous = shownPlayerSettings();
  storePlayerSettings(next);
  if (shouldBlip(previous, next, audioTuning)) audio.blip();
  changeState(leave ? pressEscape(gameState) : { ...gameState, ...screen });
}
// Ahead of every other key handler: on the settings screen its keys act only here, and while the nickname is typed
// no other key does anything (Cmd and Ctrl combinations still reach the browser).
window.addEventListener(
  'keydown',
  (event) => {
    if (gameState.kind !== 'settings' || !listShown() || devMenu.isOpen()) return;
    const editing = gameState.editing !== null;
    const outcome = modifiedKeyOutcome(editing, event);
    if (outcome === 'browser') return;
    const key = outcome === 'read' ? settingsKeyFromEvent(event.code, event.key, editing) : null;
    if (!editing && !key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!key || (event.repeat && (key === 'enter' || key === 'escape'))) return;
    applySettingsChange(settingsKey(gameState, shownPlayerSettings(), key));
  },
  { capture: true },
);
let carInput = NO_INPUT;
// The inputs of the race being driven, one per tick it reads them.
const recorder = new InputRecorder();
let recordedRace: Race | null = null;

// In dev builds and with replay=1: the finished race's log, packed and unpacked, replayed headless as a server would.
function checkReplay(race: Race, car: Car) {
  const decoded = decodeLogText(encodeLogText(recorder.log()));
  if (!decoded.ok) {
    console.log(`replay: the log was refused (${decoded.fault})`);
    return;
  }
  const started = performance.now();
  const replayWorld = createWorld({ ...world.citySettings }, { ...world.carSettings }, false);
  startRace(replayWorld, generateRoute(replayWorld.roadGraph, race.route.seed, { length: race.route.target }));
  if (race === urlChangedRace) {
    if (urlParams.gate !== null) replayWorld.race!.nextGate = urlParams.gate;
    placeUrlCar(replayWorld);
  }
  const result = replayInWorld(replayWorld, decoded.log);
  const replayed = result.finished ? String(result.ticks) : `none (${result.reason})`;
  const ms = Math.round(performance.now() - started);
  const sameCar = JSON.stringify(replayWorld.car) === JSON.stringify(car);
  console.log(
    `replay: finish tick live ${raceTicks(race, world.tick)} vs replay ${replayed}, car ${sameCar ? 'same' : 'different'}, ${decoded.log.length} ticks, ${encodeLogText(decoded.log).length} characters, ${ms} ms`,
  );
}

// Larger than needed up close, so the depth buffer keeps precision for curbs and markings far away.
const NEAR_PLANE = 0.5;
// Never moved back: the first frame after a long task can carry a time from before it.
let previousTimeMs = performance.now();

function frame(timeMs: number) {
  requestAnimationFrame(frame);
  // The previous frame was drawn completely, with the glyph atlas built before the loop started.
  if (urlParams.shot && framesDrawn > 0) canvas.dataset.ready = 'true';
  framesDrawn++;
  const dt = heldTick === null ? capFrameSeconds(Math.max(0, timeMs - previousTimeMs) / 1000) : 0;
  previousTimeMs = Math.max(previousTimeMs, timeMs);
  const frameImpact: { hardest: Impact | null } = { hardest: null };
  if (heldTick === null) advanceClock(clock, dt, () => {
    carInput = settings.movement === Movement.Car && gameState.kind === 'race' ? readCarInput() : NO_INPUT;
    const reading = world.race?.phase === 'running' ? world.race : null;
    const { impact, race: raceEvent } = stepWorld(world, carInput);
    if (reading) {
      if (reading !== recordedRace) recorder.reset();
      recordedRace = reading;
      recorder.record(carInput);
    }
    // The daily's finish is written at the finishing tick, with its log; past the timer's cap it did not finish.
    if (gameState.kind === 'race' && gameState.mode === 'daily' && gameState.finished === null) {
      if (reading && recorder.overflowed) setGameState(giveUp(gameState));
      else if (raceEvent?.kind === 'finish') {
        storeDaily(finishedRecord(gameState.day, raceEvent.ticks, encodeLogText(recorder.log())));
        gameState = raceFinished(gameState, raceEvent.ticks);
        dailyBackend?.finished();
      }
    }
    if (raceEvent?.kind === 'finish' && (import.meta.env.DEV || urlParams.replay)) {
      const finished = world.race!;
      const car = { ...world.car };
      setTimeout(() => checkReplay(finished, car));
    }
    if (impact) {
      crashDebris(impact);
      if (!frameImpact.hardest || impact.speed > frameImpact.hardest.speed) frameImpact.hardest = impact;
      if (urlParams.audioDebug && impactLog.length < 1000) impactLog.push(impact.speed);
    }
    driftParticles();
    const next = afterTick(gameState, world.race, world.tick);
    if (next !== gameState) setGameState(next);
  });
  const { hardest } = frameImpact;
  if (hardest) thuds.hit(hardest.speed, hardest.normalX, hardest.normalZ, engineHeard(gameState, world.race !== null));
  updateParticles(particles, dt);
  // Drawn between the last two ticks by the time left over, so motion is smooth on any refresh rate.
  const { car } = world;
  const drawnCar = blendCars(world.previousCar, car, clock.leftover / TICK_SECONDS);
  let fovBoost = 0;
  if (settings.movement === Movement.FlyCamera) {
    updateFlyCamera(camera, dt);
    if (!settings.noclip) pushOutOfColliders(camera.position, CAMERA_RADIUS, world.colliders);
  } else if (gameState.kind === 'garage') {
    takeMouseMovement();
    camera.position = [...GARAGE_CAMERA.position];
    camera.yaw = GARAGE_CAMERA.yaw;
    camera.pitch = GARAGE_CAMERA.pitch;
  } else if (menuFlight()) {
    takeMouseMovement();
    const pose = flightPose(flight, world.tick + clock.leftover / TICK_SECONDS);
    camera.position = pose.position;
    camera.yaw = pose.yaw;
    camera.pitch = pose.pitch;
  } else {
    fovBoost = updateChaseCamera(camera, chase, drawnCar, world.carSettings, chaseSettings, world.colliders, dt);
  }
  // The countdown holds the car and reads no input, so the engine idles through it.
  const pedalsRead = gameState.kind === 'race' && world.race?.phase !== 'countdown';
  engineInput.speed = engineSpeed(drawnCar);
  engineInput.topSpeed = world.carSettings.topSpeed;
  engineInput.throttle = pedalsRead ? carInput.throttle : 0;
  engineInput.brake = pedalsRead ? carInput.brake : 0;
  const carHeard = engineHeard(gameState, world.race !== null);
  engine.update(engineInput, carHeard);
  screechInput.slide = slideSpeed(drawnCar);
  screechInput.speed = Math.abs(engineInput.speed);
  screech.update(screechInput, carHeard);
  ambienceInput.speed = engineInput.speed;
  ambienceInput.topSpeed = engineInput.topSpeed;
  ambienceInput.car = carHeard;
  ambience.update(ambienceInput, ambienceHeard(gameState));

  giveUpOnScreen = false;
  if (gameState.kind === 'dailyResults') resultsBoard?.show(gameState.day);
  else resultsBoard?.hide();
  if (urlParams.hud !== 'test') {
    if (settings.movement !== Movement.Car) {
      hud.clear();
    } else if (gameState.kind === 'loading') {
      drawLoadingScreen(hud);
    } else if (gameState.kind === 'menu') {
      drawMenuScreen(hud, gameState.selected);
    } else if (gameState.kind === 'preRace') {
      drawPreRaceScreen(hud, { day: gameState.day, route: gameState.route, minimap, tick: world.tick });
    } else if (gameState.kind === 'results') {
      drawFinishScreen(hud, gameState.ticks, gameState.selected);
    } else if (gameState.kind === 'dailyResults') {
      drawDailyResultsScreen(hud, dailyResultsShown(gameState), gameState.selected);
    } else if (gameState.kind === 'garage') {
      drawGarageScreen(hud, { selected: gameState.selected, settings: playerSettings });
    } else if (gameState.kind === 'settings') {
      drawSettingsScreen(hud, { screen: gameState, settings: shownPlayerSettings(), fullscreen: isFullscreen() });
    } else {
      const questionDrawn = drawHud(hud, {
        speed: Math.hypot(drawnCar.velocityX, drawnCar.velocityZ),
        topSpeed: world.carSettings.topSpeed,
        minimap: { minimap, car: drawnCar },
        race: world.race
          ? {
              race: world.race,
              tick: world.tick,
              guidance: routeGuidance(world.roadGraph, world.race, { ...drawnCar, heading: camera.yaw }),
              giveUp: gameState.kind === 'race' && gameState.mode === 'daily' ? gameState.givingUp : undefined,
            }
          : undefined,
      });
      giveUpOnScreen = questionDrawn && canAskGiveUp();
    }
  }
  if (gameState.kind === 'loading' && !holdLoading && !loadPending) {
    loadPending = true;
    setTimeout(finishLoading);
  }
  const [cameraX, cameraY, cameraZ] = camera.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  devMenu.setInfo(
    `camera ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)}` +
      `  yaw ${degrees(camera.yaw)}°  pitch ${degrees(camera.pitch)}°  seed ${world.citySettings.seed}  tick ${world.tick}` +
      `\ncar ${car.x.toFixed(1)}, ${car.z.toFixed(1)}  heading ${degrees(car.heading)}°` +
      `  ${(Math.hypot(car.velocityX, car.velocityZ) * 3.6).toFixed(0)} km/h${car.drifting ? '  DRIFT' : ''}  traction ${car.traction.toFixed(2)}` +
      `\ninput throttle ${carInput.throttle}  brake ${carInput.brake}  steer ${carInput.steer}  drift ${carInput.drift}`,
  );

  const crtImage = updateGlyphImage(settings.renderMode === RenderMode.CrtGlyphs);
  // Full resolution and normals skip the ASCII pass and draw the scene straight to the screen.
  const showNormals = settings.renderMode === RenderMode.Normals;
  const fullResolution = settings.renderMode === RenderMode.FullResolution || showNormals;
  const target = fullResolution ? { framebuffer: null, width: canvas.width, height: canvas.height } : scene;
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
  gl!.viewport(0, 0, target.width, target.height);
  gl!.enable(gl!.DEPTH_TEST);
  gl!.clearColor(background[0], background[1], background[2], 0);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  gl!.useProgram(program);
  gl!.uniform3fv(fogColorLocation, background);
  gl!.uniform1f(fogStartLocation, settings.fogStart);
  gl!.uniform1f(fogEndLocation, settings.viewDistance);
  gl!.uniform1i(showNormalsLocation, showNormals ? 1 : 0);
  // The menu's flight passes over the car parked on the middle junction; it and its headlights stay out of the way.
  // The garage draws its own car instead, on its own stage, under its own light.
  const inGarage = gameState.kind === 'garage';
  gl!.uniform3fv(lightDirectionLocation, inGarage ? GARAGE_LIGHT_DIRECTION : LIGHT_DIRECTION);
  gl!.uniform1f(ambientLocation, inGarage ? GARAGE_AMBIENT : settings.ambient);
  gl!.uniform1f(lightIntensityLocation, inGarage ? GARAGE_LIGHT_INTENSITY : settings.lightIntensity);
  const carShown = !menuFlight() && !inGarage && gameState.kind !== 'loading';
  const light = headlight(drawnCar);
  const halfAngle = (settings.headlightAngle * Math.PI) / 360;
  gl!.uniform3fv(headlightPositionLocation, light.position);
  gl!.uniform3fv(headlightDirectionLocation, light.direction);
  gl!.uniform1f(headlightOuterCosLocation, Math.cos(halfAngle));
  gl!.uniform1f(headlightInnerCosLocation, Math.cos(halfAngle * (1 - HEADLIGHT_SOFT_EDGE)));
  gl!.uniform1f(headlightRangeLocation, settings.headlightRange);
  gl!.uniform1f(headlightIntensityLocation, headlightsOn && carShown ? settings.headlightIntensity : 0);
  gl!.uniform1i(sceneScatterMaterialsLocation, SCATTER_MATERIALS);
  gl!.uniform3fv(scatterParamsLocation, scatterParams());
  gl!.uniform4fv(windowStylesLocation, WINDOW_STYLE_PARAMS);
  gl!.uniform1f(windowLitMaterialLocation, MATERIAL.windowLit);
  gl!.uniform1f(windowDarkMaterialLocation, MATERIAL.windowDark);
  // Full resolution draws straight to the screen, where each pixel stands in for a cell.
  const samples = fullResolution ? 1 : settings.supersample;
  const pointCells = [target.width / samples, target.height / samples];
  gl!.uniform1f(supersampleLocation, samples);
  gl!.uniform1i(beaconOnLocation, world.tick % BEACON_CYCLE_TICKS < BEACON_ON_TICKS ? 1 : 0);
  gl!.uniform1i(brakingLocation, carInput.brake > 0 ? 1 : 0);
  gl!.uniform1i(nextGateLocation, world.race?.nextGate ?? 0);
  const pulse = 0.5 + 0.5 * Math.cos((2 * Math.PI * (world.tick % GATE_PULSE_TICKS)) / GATE_PULSE_TICKS);
  gl!.uniform1f(gatePulseLocation, GATE_PULSE_MIN + (1 - GATE_PULSE_MIN) * pulse);
  const aspect = canvas.width / canvas.height;
  const projection = perspective(((settings.fovDegrees + fovBoost) * Math.PI) / 180, aspect, NEAR_PLANE, settings.viewDistance);
  gl!.uniformMatrix4fv(projectionLocation, false, projection);
  gl!.activeTexture(gl!.TEXTURE3);
  updateSignalTexture(gl!, signals, world.signalOffsets.map((offset) => signalPhase(world.tick, offset)));
  gl!.uniform1i(signalsTextureLocation, 3);
  const view = viewMatrix(camera);

  // While a city loads the scene stays empty under the loading line.
  const sceneShown = gameState.kind !== 'loading';
  // Stars first and without depth, so anything in the city covers them.
  gl!.useProgram(skyProgram);
  gl!.uniformMatrix4fv(skyViewRotationLocation, false, viewMatrix({ ...camera, position: [0, 0, 0] }));
  gl!.uniformMatrix4fv(skyProjectionLocation, false, projection);
  gl!.uniform1f(skyMaterialLocation, MATERIAL.star);
  gl!.uniform2fv(skyCellsLocation, pointCells);
  gl!.uniform1f(skyPointSizeLocation, samples);
  gl!.disable(gl!.DEPTH_TEST);
  gl!.bindVertexArray(starVao);
  if (sceneShown) gl!.drawArrays(gl!.POINTS, 0, starCount);
  gl!.enable(gl!.DEPTH_TEST);
  gl!.useProgram(program);

  updateGateMesh();
  const playerCar = updateCarMesh();
  if (inGarage) {
    draw(garageFloorMesh, gl!.TRIANGLES, view);
    draw(playerCar, gl!.TRIANGLES, view, rotationY(garageHeading(world.tick + clock.leftover / TICK_SECONDS)));
  } else if (sceneShown) {
    for (const mesh of cityMeshes) draw(mesh, gl!.TRIANGLES, view);
    if (gateMesh) draw(gateMesh, gl!.TRIANGLES, view);
  }
  if (carShown) draw(playerCar, gl!.TRIANGLES, view, multiply(translation(drawnCar.x, 0, drawnCar.z), rotationY(drawnCar.heading)));

  const particleCount = particleVertices(particles);
  if (particleCount > 0 && sceneShown) {
    gl!.useProgram(particleProgram);
    gl!.uniformMatrix4fv(particleViewLocation, false, view);
    gl!.uniformMatrix4fv(particleProjectionLocation, false, projection);
    gl!.uniform3fv(particleFogColorLocation, background);
    gl!.uniform1f(particleFogStartLocation, settings.fogStart);
    gl!.uniform1f(particleFogEndLocation, settings.viewDistance);
    gl!.uniform2fv(particleCellsLocation, pointCells);
    gl!.uniform1f(particlePointSizeLocation, samples);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, particleBuffer);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, particles.vertices, 0, particleCount * FLOATS_PER_PARTICLE);
    gl!.bindVertexArray(particleVao);
    gl!.drawArrays(gl!.POINTS, 0, particleCount);
  }
  if (fullResolution) return;

  asciiPasses(view, world.tick, crtImage);
}
requestAnimationFrame(frame);
