import './style.css';
import { createDevMenu, RenderMode, type DevSettings } from './dev/menu.ts';
import { advanceClock, createClock } from './game/clock.ts';
import { updateFlyCamera } from './game/flyCamera.ts';
import { generateBuildings, type Building } from './game/buildings.ts';
import { DEFAULT_CITY_SETTINGS, generateCity, CURB_HEIGHT, Zone, type City, type CitySettings, type Rect, type WallKind } from './game/city.ts';
import { cityColliders, pushOutOfColliders } from './game/collision.ts';
import { generateIntersections, type Intersections } from './game/intersections.ts';
import { signalOffsets, signalPhase } from './game/signals.ts';
import { generateStreetLights, type StreetLight } from './game/streetLights.ts';
import { trackKeyboard, trackMouse } from './game/input.ts';
import { createRenderTarget, resizeRenderTarget } from './gl/framebuffer.ts';
import { createProgram } from './gl/shader.ts';
import { multiply, normalize, perspective, rotationY, translation, type Mat4, type Vec3 } from './math/mat4.ts';
import { viewMatrix, type Camera } from './render/camera.ts';
import { createGlyphAtlas } from './render/glyphs.ts';
import { createSignalTexture, updateSignalTexture } from './render/signalTexture.ts';
import { box, FLOATS_PER_VERTEX } from './render/shapes.ts';
import { streetLightVertices } from './render/models/street/streetLight.ts';
import { stopSignVertices } from './render/models/street/stopSign.ts';
import { trafficLightVertices } from './render/models/street/trafficLight.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert.glsl?raw';
import asciiFragmentSource from './shaders/ascii.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 not supported');

const program = createProgram(gl, vertexSource, fragmentSource);
const modelViewLocation = gl.getUniformLocation(program, 'u_modelView');
const projectionLocation = gl.getUniformLocation(program, 'u_projection');
const fogColorLocation = gl.getUniformLocation(program, 'u_fogColor');
const fogStartLocation = gl.getUniformLocation(program, 'u_fogStart');
const fogEndLocation = gl.getUniformLocation(program, 'u_fogEnd');
const showNormalsLocation = gl.getUniformLocation(program, 'u_showNormals');
const lightDirectionLocation = gl.getUniformLocation(program, 'u_lightDirection');
const lightIntensityLocation = gl.getUniformLocation(program, 'u_lightIntensity');
const ambientLocation = gl.getUniformLocation(program, 'u_ambient');
const positionLocation = gl.getAttribLocation(program, 'a_position');
const colorLocation = gl.getAttribLocation(program, 'a_color');
const normalLocation = gl.getAttribLocation(program, 'a_normal');
const emissionLocation = gl.getAttribLocation(program, 'a_emission');
const idLocation = gl.getAttribLocation(program, 'a_id');
const signalsTextureLocation = gl.getUniformLocation(program, 'u_signals');

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

  gl!.bindVertexArray(null);
  return { vao, buffer, vertexCount: vertices.length / FLOATS_PER_VERTEX };
}

function deleteMesh(mesh: Mesh) {
  gl!.deleteBuffer(mesh.buffer);
  gl!.deleteVertexArray(mesh.vao);
}

const triangle = uploadMesh([
   0.0,  0.5, 0.0, 1.0, 0.5, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0,
  -0.5, -0.5, 0.0, 1.0, 0.5, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0,
   0.5, -0.5, 0.0, 1.0, 0.5, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0,
]);

function slab(rect: Rect, bottom: number, top: number, color: Vec3): number[] {
  return box([rect.minX, bottom, rect.minZ], [rect.maxX, top, rect.maxZ], color);
}

// Temporary wall tints, for checking the shuffled order.
const WALL_COLORS: Record<WallKind, Vec3> = {
  corner: [0.3, 0.3, 0.32],
  narrow: [0.9, 0.85, 0.2],
  medium: [0.95, 0.5, 0.1],
  wide: [0.8, 0.15, 0.1],
  flex: [0.2, 0.7, 0.9],
};

// Temporary zone tints, for seeing the zoning.
const ZONE_COLORS: Record<Zone, Vec3> = {
  [Zone.LowDensity]: [0.2, 0.3, 0.75],
  [Zone.MidDensity]: [0.05, 0.3, 0.1],
  [Zone.HighRise]: [0.75, 0.75, 0.75],
  [Zone.Houses]: [0.35, 0.55, 0.15],
  [Zone.Park]: [0.15, 0.85, 0.2],
  [Zone.Supermarket]: [0.9, 0.8, 0.1],
  [Zone.ParkingLot]: [0.2, 0.2, 0.2],
  [Zone.Plaza]: [0.2, 0.7, 0.9],
};

function buildCityMeshes(
  city: City,
  buildings: Building[],
  streetLights: StreetLight[],
  { trafficLights, stopSigns }: Intersections,
): Mesh[] {
  const road = uploadMesh(slab(city.bounds, -0.1, 0, [0.25, 0.25, 0.25]));
  // Raised slightly so the paint doesn't fight the road surface for depth.
  const markings = uploadMesh(city.markings.flatMap((marking) => slab(marking, 0, 0.02, [1, 1, 1])));
  const pavements = uploadMesh(city.blocks.flatMap(({ rect, zone }) => slab(rect, 0, CURB_HEIGHT, ZONE_COLORS[zone])));
  const wall = uploadMesh([
    ...city.wallPavement.flatMap((strip) => slab(strip, 0, CURB_HEIGHT, WALL_COLORS.corner)),
    ...city.wall.flatMap(({ rect, kind }) => slab(rect, 0, CURB_HEIGHT, WALL_COLORS[kind])),
  ]);
  // All buildings in one mesh, with corners already in world position, so they draw in a single call.
  const buildingMesh = uploadMesh(
    buildings.flatMap(({ rect, height }) => slab(rect, CURB_HEIGHT, CURB_HEIGHT + height, [0.75, 0.7, 0.65])),
  );
  const lights = uploadMesh(streetLights.flatMap(streetLightVertices));
  const signals = uploadMesh([
    ...trafficLights.flatMap((light) => trafficLightVertices(light)),
    ...stopSigns.flatMap((sign) => stopSignVertices(sign)),
  ]);
  return [road, markings, pavements, wall, buildingMesh, lights, signals];
}

const citySettings: CitySettings = { ...DEFAULT_CITY_SETTINGS };
let city = generateCity(citySettings);
let buildings = generateBuildings(city, citySettings);
let streetLights = generateStreetLights(city, citySettings);
let intersections = generateIntersections(city, citySettings);
let offsets = signalOffsets(city, citySettings.seed);
let signals = createSignalTexture(gl, city.junctions.length);
let colliders = cityColliders(buildings, streetLights, intersections);
let cityMeshes = buildCityMeshes(city, buildings, streetLights, intersections);

// The data is kept, not just the meshes, so the game can collide with it.
function regenerateCity() {
  city = generateCity(citySettings);
  buildings = generateBuildings(city, citySettings);
  streetLights = generateStreetLights(city, citySettings);
  intersections = generateIntersections(city, citySettings);
  colliders = cityColliders(buildings, streetLights, intersections);
  offsets = signalOffsets(city, citySettings.seed);
  gl!.deleteTexture(signals.texture);
  signals = createSignalTexture(gl!, city.junctions.length);
  cityMeshes.forEach(deleteMesh);
  cityMeshes = buildCityMeshes(city, buildings, streetLights, intersections);
}

const asciiProgram = createProgram(gl, fullscreenVertexSource, asciiFragmentSource);
const sceneTextureLocation = gl.getUniformLocation(asciiProgram, 'u_scene');
const normalTextureLocation = gl.getUniformLocation(asciiProgram, 'u_normals');
const cellSizeLocation = gl.getUniformLocation(asciiProgram, 'u_cellSize');
const glyphsLocation = gl.getUniformLocation(asciiProgram, 'u_glyphs');
const rampLengthLocation = gl.getUniformLocation(asciiProgram, 'u_rampLength');
const backgroundLocation = gl.getUniformLocation(asciiProgram, 'u_background');
const renderModeLocation = gl.getUniformLocation(asciiProgram, 'u_renderMode');
const fullscreenVao = gl.createVertexArray();

const settings: DevSettings = {
  fovDegrees: 60,
  cellWidth: 6,
  viewDistance: 1000,
  fogStart: 150,
  renderMode: RenderMode.Glyphs,
  noclip: false,
  ambient: 0.3,
  lightIntensity: 0.8,
};

const dpr = window.devicePixelRatio || 1;
const CELL_ASPECT = 1.75;
const GLYPH_RAMPS = [' .-:=+*%#@'];
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
  (setting) => {
    if (setting === 'cellWidth') {
      buildCells();
      resize();
    }
  },
  regenerateCity,
);

trackKeyboard();
trackMouse(canvas);

const camera: Camera = {
  position: [0, 1.5, 4],
  yaw: 0,
  pitch: -0.2,
};
const CAMERA_RADIUS = 0.5;

// A fixed light high up, from +x and +z, until the night lights replace it.
const LIGHT_DIRECTION = normalize([0.5, 1, 0.3]);

function draw(mesh: Mesh, mode: GLenum, modelView: Mat4) {
  gl!.uniformMatrix4fv(modelViewLocation, false, modelView);
  gl!.bindVertexArray(mesh.vao);
  gl!.drawArrays(mode, 0, mesh.vertexCount);
}

const clock = createClock();

// Longest step allowed, so returning to a background tab doesn't teleport the camera
// or run a burst of simulation ticks.
const MAX_FRAME_SECONDS = 0.1;
// Larger than needed up close, so the depth buffer keeps precision for curbs and markings far away.
const NEAR_PLANE = 0.5;
let previousTimeMs = 0;

function frame(timeMs: number) {
  requestAnimationFrame(frame);
  const t = timeMs / 1000;
  const dt = Math.min((timeMs - previousTimeMs) / 1000, MAX_FRAME_SECONDS);
  previousTimeMs = timeMs;
  advanceClock(clock, dt, () => {
    // Simulation steps go here.
  });
  updateFlyCamera(camera, dt);
  if (!settings.noclip) pushOutOfColliders(camera.position, CAMERA_RADIUS, colliders);
  const [cameraX, cameraY, cameraZ] = camera.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  devMenu.setInfo(
    `camera ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)}` +
      `  yaw ${degrees(camera.yaw)}°  pitch ${degrees(camera.pitch)}°  seed ${citySettings.seed}  tick ${clock.tick}`,
  );

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
  const aspect = canvas.width / canvas.height;
  const projection = perspective((settings.fovDegrees * Math.PI) / 180, aspect, NEAR_PLANE, settings.viewDistance);
  gl!.uniformMatrix4fv(projectionLocation, false, projection);
  gl!.activeTexture(gl!.TEXTURE3);
  updateSignalTexture(gl!, signals, offsets.map((offset) => signalPhase(clock.tick, offset)));
  gl!.uniform1i(signalsTextureLocation, 3);
  const view = viewMatrix(camera);

  for (const mesh of cityMeshes) draw(mesh, gl!.TRIANGLES, view);
  draw(triangle, gl!.TRIANGLES, multiply(view, multiply(translation(0, 0.5, 0), rotationY(t))));
  if (fullResolution) return;

  gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
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
  gl!.uniform1i(rampLengthLocation, [...GLYPH_RAMPS[0]].length);
  gl!.uniform3fv(backgroundLocation, background);
  gl!.uniform1i(renderModeLocation, settings.renderMode);
  gl!.bindVertexArray(fullscreenVao);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
}
requestAnimationFrame(frame);
