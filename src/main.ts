import './style.css';
import { parseUrlParams } from './dev/urlParams.ts';
import { createDevMenu, Movement, RenderMode, type DevSettings } from './dev/menu.ts';
import { advanceClock, capFrameSeconds, createClock, TICK_SECONDS, TICKS_PER_SECOND } from './game/clock.ts';
import { blendCars, CAR_WIDTH, DEFAULT_CAR_SETTINGS, type CarSettings, type Impact } from './game/car.ts';
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
import { generateRoute, RouteError, type Route } from './game/route.ts';
import { clearRace, createWorld, regenerateCity as regenerateWorldCity, startRace, stepWorld, type CityData } from './game/world.ts';
import { trackFullscreenKey, trackKeyboard, trackKeyPress, trackMouse } from './game/input.ts';
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
import { createGlyphAtlas } from './render/glyphs.ts';
import { createHudTexture, uploadHud } from './hud/hudTexture.ts';
import { drawHud } from './hud/hud.ts';
import { createMinimap } from './hud/minimap.ts';
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

const carMesh = uploadMesh(carVertices());

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
if (urlParams.seed !== null) citySettings.seed = urlParams.seed;

const world = createWorld(citySettings, carSettings);
// Until the menu exists the game starts in a race on the city seed's route; race=0 drives freely as before.
function startCityRace() {
  if (!urlParams.race) return;
  try {
    startRace(world, generateRoute(world.roadGraph, citySettings.seed));
  } catch (error) {
    if (!(error instanceof RouteError)) throw error;
    clearRace(world);
  }
}
startCityRace();
if (urlParams.gate !== null && world.race) {
  if (urlParams.gate >= world.race.route.gates.length) throw new Error(`URL parameter gate: the route has ${world.race.route.gates.length} gates`);
  world.race.nextGate = urlParams.gate;
}
// A held tick: the world is stepped there once and the clock never runs, so every frame is the same picture.
const heldTick = urlParams.tick;
const heldInput = urlParams.drive ? { ...NO_INPUT, throttle: 1 } : NO_INPUT;
for (let i = 0; i < (heldTick ?? 0); i++) stepWorld(world, heldInput);
let cityMeshes = buildCityMeshes(world);
// The race's gates, rebuilt whenever its route changes; none in free driving.
let gateMesh: Mesh | null = null;
let gateRoute: Route | null = null;
function updateGateMesh() {
  const route = world.race?.route ?? null;
  if (route === gateRoute) return;
  if (gateMesh) deleteMesh(gateMesh);
  gateMesh = route ? uploadMesh(routeGateVertices(route.gates)) : null;
  gateRoute = route;
}
let signals = createSignalTexture(gl, world.city.junctions.length);
let minimap = createMinimap(world.city);

function regenerateCity() {
  cityMeshes.forEach(deleteMesh);
  regenerateWorldCity(world);
  startCityRace();
  if (world.race) faceCarHeading();
  cityMeshes = buildCityMeshes(world);
  gl!.deleteTexture(signals.texture);
  signals = createSignalTexture(gl!, world.city.junctions.length);
  // The new map may be smaller than the old one; the HUD draws itself again next frame.
  if (urlParams.hud !== 'test') hud.clear();
  minimap = createMinimap(world.city);
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
  cellWidth: urlParams.cellWidth ?? 6,
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
  },
  regenerateCity,
  uploadStars,
  (open) => {
    if (open) document.exitPointerLock();
    else canvas.requestPointerLock().catch(() => {});
  },
);

trackKeyboard();
trackMouse(canvas);
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
trackKeyPress('KeyR', () => {
  if (!world.race) return;
  startRace(world, world.race.route);
  faceCarHeading();
});
let carInput = NO_INPUT;

// Larger than needed up close, so the depth buffer keeps precision for curbs and markings far away.
const NEAR_PLANE = 0.5;
let previousTimeMs = 0;

function frame(timeMs: number) {
  requestAnimationFrame(frame);
  // The previous frame was drawn completely, with the glyph atlas built before the loop started.
  if (urlParams.shot && framesDrawn > 0) canvas.dataset.ready = 'true';
  framesDrawn++;
  const dt = heldTick === null ? capFrameSeconds((timeMs - previousTimeMs) / 1000) : 0;
  previousTimeMs = timeMs;
  if (heldTick === null) advanceClock(clock, dt, () => {
    carInput = settings.movement === Movement.Car ? readCarInput() : NO_INPUT;
    const { impact } = stepWorld(world, carInput);
    if (impact) crashDebris(impact);
    driftParticles();
  });
  updateParticles(particles, dt);
  // Drawn between the last two ticks by the time left over, so motion is smooth on any refresh rate.
  const { car } = world;
  const drawnCar = blendCars(world.previousCar, car, clock.leftover / TICK_SECONDS);
  let fovBoost = 0;
  if (settings.movement === Movement.FlyCamera) {
    updateFlyCamera(camera, dt);
    if (!settings.noclip) pushOutOfColliders(camera.position, CAMERA_RADIUS, world.colliders);
  } else {
    fovBoost = updateChaseCamera(camera, chase, drawnCar, carSettings, chaseSettings, world.colliders, dt);
  }
  if (urlParams.hud !== 'test') {
    if (settings.movement === Movement.Car) {
      drawHud(hud, {
        speed: Math.hypot(drawnCar.velocityX, drawnCar.velocityZ),
        topSpeed: carSettings.topSpeed,
        minimap: { minimap, car: drawnCar },
      });
    } else {
      hud.clear();
    }
  }
  const [cameraX, cameraY, cameraZ] = camera.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  devMenu.setInfo(
    `camera ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)}` +
      `  yaw ${degrees(camera.yaw)}°  pitch ${degrees(camera.pitch)}°  seed ${citySettings.seed}  tick ${world.tick}` +
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
  const background: Vec3 = [0, 0, 0];
  gl!.clearColor(background[0], background[1], background[2], 0);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  gl!.useProgram(program);
  gl!.uniform3fv(fogColorLocation, background);
  gl!.uniform1f(fogStartLocation, settings.fogStart);
  gl!.uniform1f(fogEndLocation, settings.viewDistance);
  gl!.uniform1i(showNormalsLocation, showNormals ? 1 : 0);
  gl!.uniform3fv(lightDirectionLocation, LIGHT_DIRECTION);
  gl!.uniform1f(ambientLocation, settings.ambient);
  gl!.uniform1f(lightIntensityLocation, settings.lightIntensity);
  const light = headlight(drawnCar);
  const halfAngle = (settings.headlightAngle * Math.PI) / 360;
  gl!.uniform3fv(headlightPositionLocation, light.position);
  gl!.uniform3fv(headlightDirectionLocation, light.direction);
  gl!.uniform1f(headlightOuterCosLocation, Math.cos(halfAngle));
  gl!.uniform1f(headlightInnerCosLocation, Math.cos(halfAngle * (1 - HEADLIGHT_SOFT_EDGE)));
  gl!.uniform1f(headlightRangeLocation, settings.headlightRange);
  gl!.uniform1f(headlightIntensityLocation, headlightsOn ? settings.headlightIntensity : 0);
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
  const aspect = canvas.width / canvas.height;
  const projection = perspective(((settings.fovDegrees + fovBoost) * Math.PI) / 180, aspect, NEAR_PLANE, settings.viewDistance);
  gl!.uniformMatrix4fv(projectionLocation, false, projection);
  gl!.activeTexture(gl!.TEXTURE3);
  updateSignalTexture(gl!, signals, world.signalOffsets.map((offset) => signalPhase(world.tick, offset)));
  gl!.uniform1i(signalsTextureLocation, 3);
  const view = viewMatrix(camera);

  // Stars first and without depth, so anything in the city covers them.
  gl!.useProgram(skyProgram);
  gl!.uniformMatrix4fv(skyViewRotationLocation, false, viewMatrix({ ...camera, position: [0, 0, 0] }));
  gl!.uniformMatrix4fv(skyProjectionLocation, false, projection);
  gl!.uniform1f(skyMaterialLocation, MATERIAL.star);
  gl!.uniform2fv(skyCellsLocation, pointCells);
  gl!.uniform1f(skyPointSizeLocation, samples);
  gl!.disable(gl!.DEPTH_TEST);
  gl!.bindVertexArray(starVao);
  gl!.drawArrays(gl!.POINTS, 0, starCount);
  gl!.enable(gl!.DEPTH_TEST);
  gl!.useProgram(program);

  for (const mesh of cityMeshes) draw(mesh, gl!.TRIANGLES, view);
  updateGateMesh();
  if (gateMesh) draw(gateMesh, gl!.TRIANGLES, view);
  draw(carMesh, gl!.TRIANGLES, view, multiply(translation(drawnCar.x, 0, drawnCar.z), rotationY(drawnCar.heading)));

  const particleCount = particleVertices(particles);
  if (particleCount > 0) {
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
  gl!.uniform1f(animationPhaseLocation, (world.tick % animationTicks) / animationTicks);
  gl!.uniform1f(animationLevelsLocation, settings.animationLevels);
  gl!.uniform1f(waveScaleLocation, settings.waveScale);
  gl!.uniform1i(tickLocation, world.tick);
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
requestAnimationFrame(frame);
