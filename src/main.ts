import './style.css';
import { createDevMenu, Movement, RenderMode, type DevSettings } from './dev/menu.ts';
import { advanceClock, createClock, TICK_SECONDS, TICKS_PER_SECOND } from './game/clock.ts';
import { blendCars, collideCar, createCar, DEFAULT_CAR_SETTINGS, stepCar, type CarSettings } from './game/car.ts';
import { NO_INPUT, readCarInput } from './game/carInput.ts';
import { updateFlyCamera } from './game/flyCamera.ts';
import {
  createChaseCamera,
  DEFAULT_CHASE_CAMERA_SETTINGS,
  updateChaseCamera,
  type ChaseCameraSettings,
} from './game/chaseCamera.ts';
import { generateBuildings, inset, SETBACK, type Building, type Layout } from './game/buildings.ts';
import { DEFAULT_CITY_SETTINGS, generateCity, CURB_HEIGHT, subtract, Zone, type City, type CitySettings, type Rect } from './game/city.ts';
import { cityColliders, pushOutOfColliders, type Collider } from './game/collision.ts';
import { FENCE_HEIGHT, houseFences } from './game/fences.ts';
import { houseDriveways } from './game/driveways.ts';
import { lotPavements } from './game/lots.ts';
import { POND_RADIUS } from './game/park.ts';
import { generateIntersections, type Intersections } from './game/intersections.ts';
import { signalOffsets, signalPhase } from './game/signals.ts';
import { generateStreetLights, type StreetLight } from './game/streetLights.ts';
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
import { ANIMATED_MATERIALS, EDGE_MATERIALS, SCATTER_MATERIALS, STROKE_MATERIALS, STROKE_ROW, SCATTER_SETTINGS, scatterParams, GLYPH_RAMPS, MATERIAL, RAMP_LENGTH, type Material } from './render/materials.ts';
import { createSignalTexture, updateSignalTexture } from './render/signalTexture.ts';
import { box, flatDisc, FLOATS_PER_VERTEX, withMaterial, withSideColor, withSideMaterial } from './render/shapes.ts';
import { windowStyleParams } from './render/models/facade.ts';
import { cityModels } from './render/models/spawn.ts';
import { streetLightVertices } from './render/models/street/streetLight.ts';
import { stopSignVertices } from './render/models/street/stopSign.ts';
import { trafficLightVertices } from './render/models/street/trafficLight.ts';
import { carVertices } from './render/models/car.ts';
import { DEFAULT_SKY_SETTINGS, FLOATS_PER_STAR, starVertices, type SkySettings } from './render/sky.ts';
import { headlight, HEADLIGHT_SOFT_EDGE } from './render/headlights.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert.glsl?raw';
import asciiFragmentSource from './shaders/ascii.frag.glsl?raw';
import crtFragmentSource from './shaders/crt.frag.glsl?raw';
import skyVertexSource from './shaders/sky.vert.glsl?raw';
import skyFragmentSource from './shaders/sky.frag.glsl?raw';

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
const signalsTextureLocation = gl.getUniformLocation(program, 'u_signals');
const sceneScatterMaterialsLocation = gl.getUniformLocation(program, 'u_scatterMaterials');
const scatterParamsLocation = gl.getUniformLocation(program, 'u_scatterParams');

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

function buildCityMeshes(
  city: City,
  buildings: Building[],
  driveways: Rect[],
  models: number[],
  fences: Rect[],
  streetLights: StreetLight[],
  { trafficLights, stopSigns }: Intersections,
): Mesh[] {
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
  const modelMesh = uploadMesh(models);
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

interface World {
  city: City;
  layout: Layout;
  fences: Rect[];
  streetLights: StreetLight[];
  intersections: Intersections;
  offsets: number[];
  colliders: Collider[];
  meshes: Mesh[];
}

// The data is kept, not just the meshes, so the game can collide with it.
function generateWorld(): World {
  const city = generateCity(citySettings);
  const layout = generateBuildings(city, citySettings);
  const fences = houseFences(city, layout.buildings);
  const driveways = houseDriveways(city, layout.buildings);
  const streetLights = generateStreetLights(city, citySettings);
  const intersections = generateIntersections(city, citySettings);
  const models = cityModels(city, layout, driveways, citySettings.seed);
  return {
    city,
    layout,
    fences,
    streetLights,
    intersections,
    offsets: signalOffsets(city, citySettings.seed),
    colliders: cityColliders(models.colliders, fences, streetLights, intersections),
    meshes: buildCityMeshes(city, layout.buildings, driveways, models.vertices, fences, streetLights, intersections),
  };
}

let world = generateWorld();
let signals = createSignalTexture(gl, world.city.junctions.length);

function regenerateCity() {
  world.meshes.forEach(deleteMesh);
  world = generateWorld();
  gl!.deleteTexture(signals.texture);
  signals = createSignalTexture(gl!, world.city.junctions.length);
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
const fullscreenVao = gl.createVertexArray();
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
  cellWidth: 6,
  viewDistance: 1000,
  fogStart: 150,
  renderMode: RenderMode.Glyphs,
  movement: Movement.Car,
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
};

const dpr = window.devicePixelRatio || 1;
const CELL_ASPECT = 1.75;
const scene = createRenderTarget(gl);

let cellWidth = 0;
let cellHeight = 0;
let glyphAtlas: WebGLTexture | null = null;

function buildCells() {
  cellWidth = Math.round(settings.cellWidth * dpr);
  cellHeight = Math.round(settings.cellWidth * CELL_ASPECT * dpr);
  gl!.deleteTexture(glyphAtlas);
  glyphAtlas = createGlyphAtlas(gl!, GLYPH_RAMPS, cellWidth, cellHeight);
}

function resize() {
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  resizeRenderTarget(
    gl!,
    scene,
    Math.ceil(canvas.width / cellWidth),
    Math.ceil(canvas.height / cellHeight),
  );
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
    if (setting === 'cellWidth') {
      buildCells();
      resize();
    }
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
const car = createCar(0, 0, 0);
let previousCar = car;
const chase = createChaseCamera();
let carInput = NO_INPUT;

// Longest step allowed, so returning to a background tab doesn't teleport the camera
// or run a burst of simulation ticks.
const MAX_FRAME_SECONDS = 0.1;
// Larger than needed up close, so the depth buffer keeps precision for curbs and markings far away.
const NEAR_PLANE = 0.5;
let previousTimeMs = 0;

function frame(timeMs: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((timeMs - previousTimeMs) / 1000, MAX_FRAME_SECONDS);
  previousTimeMs = timeMs;
  advanceClock(clock, dt, () => {
    previousCar = { ...car };
    carInput = settings.movement === Movement.Car ? readCarInput() : NO_INPUT;
    stepCar(car, carInput, carSettings);
    collideCar(car, world.colliders, carSettings);
  });
  // Drawn between the last two ticks by the time left over, so motion is smooth on any refresh rate.
  const drawnCar = blendCars(previousCar, car, clock.leftover / TICK_SECONDS);
  let fovBoost = 0;
  if (settings.movement === Movement.FlyCamera) {
    updateFlyCamera(camera, dt);
    if (!settings.noclip) pushOutOfColliders(camera.position, CAMERA_RADIUS, world.colliders);
  } else {
    fovBoost = updateChaseCamera(camera, chase, drawnCar, carSettings, chaseSettings, world.colliders, dt);
  }
  const [cameraX, cameraY, cameraZ] = camera.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  devMenu.setInfo(
    `camera ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)}` +
      `  yaw ${degrees(camera.yaw)}°  pitch ${degrees(camera.pitch)}°  seed ${citySettings.seed}  tick ${clock.tick}` +
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
  gl!.uniform1i(beaconOnLocation, clock.tick % BEACON_CYCLE_TICKS < BEACON_ON_TICKS ? 1 : 0);
  const aspect = canvas.width / canvas.height;
  const projection = perspective(((settings.fovDegrees + fovBoost) * Math.PI) / 180, aspect, NEAR_PLANE, settings.viewDistance);
  gl!.uniformMatrix4fv(projectionLocation, false, projection);
  gl!.activeTexture(gl!.TEXTURE3);
  updateSignalTexture(gl!, signals, world.offsets.map((offset) => signalPhase(clock.tick, offset)));
  gl!.uniform1i(signalsTextureLocation, 3);
  const view = viewMatrix(camera);

  // Stars first and without depth, so anything in the city covers them.
  gl!.useProgram(skyProgram);
  gl!.uniformMatrix4fv(skyViewRotationLocation, false, viewMatrix({ ...camera, position: [0, 0, 0] }));
  gl!.uniformMatrix4fv(skyProjectionLocation, false, projection);
  gl!.uniform1f(skyMaterialLocation, MATERIAL.star);
  gl!.disable(gl!.DEPTH_TEST);
  gl!.bindVertexArray(starVao);
  gl!.drawArrays(gl!.POINTS, 0, starCount);
  gl!.enable(gl!.DEPTH_TEST);
  gl!.useProgram(program);

  for (const mesh of world.meshes) draw(mesh, gl!.TRIANGLES, view);
  draw(carMesh, gl!.TRIANGLES, view, multiply(translation(drawnCar.x, 0, drawnCar.z), rotationY(drawnCar.heading)));
  if (fullResolution) return;

  gl!.bindFramebuffer(gl!.FRAMEBUFFER, crtImage ? crtImage.framebuffer : null);
  gl!.viewport(0, 0, canvas.width, canvas.height);
  gl!.disable(gl!.DEPTH_TEST);

  gl!.useProgram(asciiProgram);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.colorTexture);
  gl!.uniform1i(sceneTextureLocation, 0);
  gl!.uniform2i(cellSizeLocation, cellWidth, cellHeight);
  gl!.activeTexture(gl!.TEXTURE1);
  gl!.bindTexture(gl!.TEXTURE_2D, glyphAtlas);
  gl!.uniform1i(glyphsLocation, 1);
  gl!.activeTexture(gl!.TEXTURE2);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.normalTexture);
  gl!.uniform1i(normalTextureLocation, 2);
  gl!.activeTexture(gl!.TEXTURE4);
  gl!.bindTexture(gl!.TEXTURE_2D, scene.scatterTexture);
  gl!.uniform1i(scatterTextureLocation, 4);
  gl!.uniform1i(scatterMaterialsLocation, SCATTER_MATERIALS);
  gl!.uniform1i(rampLengthLocation, RAMP_LENGTH);
  gl!.uniform1i(edgeMaterialsLocation, EDGE_MATERIALS);
  gl!.uniform1i(animatedMaterialsLocation, ANIMATED_MATERIALS);
  gl!.uniform1i(strokeMaterialsLocation, STROKE_MATERIALS);
  gl!.uniform1i(strokeRowLocation, STROKE_ROW);
  const animationTicks = Math.round(settings.animationSeconds * TICKS_PER_SECOND);
  gl!.uniform1f(animationPhaseLocation, (clock.tick % animationTicks) / animationTicks);
  gl!.uniform1f(animationLevelsLocation, settings.animationLevels);
  gl!.uniform1f(waveScaleLocation, settings.waveScale);
  gl!.uniform1i(tickLocation, clock.tick);
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
