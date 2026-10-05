import './style.css';
import { createDevMenu, RenderMode, type DevSettings } from './dev/menu.ts';
import { updateFlyCamera } from './game/flyCamera.ts';
import { generateBuildings } from './game/buildings.ts';
import { DEFAULT_CITY_SETTINGS, generateCity, Zone, type Rect, type WallKind } from './game/city.ts';
import { trackKeyboard, trackMouse } from './game/input.ts';
import { createRenderTarget, resizeRenderTarget } from './gl/framebuffer.ts';
import { createProgram } from './gl/shader.ts';
import { multiply, perspective, rotationY, scaling, translation, type Mat4, type Vec3 } from './math/mat4.ts';
import { viewMatrix, type Camera } from './render/camera.ts';
import { createGlyphAtlas } from './render/glyphs.ts';
import { box, FLOATS_PER_VERTEX } from './render/shapes.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert.glsl?raw';
import asciiFragmentSource from './shaders/ascii.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 not supported');

const program = createProgram(gl, vertexSource, fragmentSource);
const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
const colorLocation = gl.getUniformLocation(program, 'u_color');
const fogColorLocation = gl.getUniformLocation(program, 'u_fogColor');
const fogDistanceLocation = gl.getUniformLocation(program, 'u_fogDistance');
const positionLocation = gl.getAttribLocation(program, 'a_position');
const shadeLocation = gl.getAttribLocation(program, 'a_shade');

interface Mesh {
  vao: WebGLVertexArrayObject;
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
  gl!.enableVertexAttribArray(shadeLocation);
  gl!.vertexAttribPointer(shadeLocation, 1, gl!.FLOAT, false, stride, 3 * 4);

  gl!.bindVertexArray(null);
  return { vao, vertexCount: vertices.length / FLOATS_PER_VERTEX };
}

const triangle = uploadMesh([
   0.0,  0.5, 0.0, 1.0,
  -0.5, -0.5, 0.0, 1.0,
   0.5, -0.5, 0.0, 1.0,
]);

const city = generateCity(DEFAULT_CITY_SETTINGS);
const KERB_HEIGHT = 0.15;

function slab(rect: Rect, bottom: number, top: number): number[] {
  return box([rect.minX, bottom, rect.minZ], [rect.maxX, top, rect.maxZ]);
}

const road = uploadMesh(slab(city.bounds, -0.1, 0));

// Temporary wall tints, for checking the shuffled order.
const WALL_COLORS: Record<WallKind, Vec3> = {
  corner: [0.3, 0.3, 0.32],
  narrow: [0.9, 0.85, 0.2],
  medium: [0.95, 0.5, 0.1],
  wide: [0.8, 0.15, 0.1],
};
const wallPieces = (Object.keys(WALL_COLORS) as WallKind[]).map((kind) => ({
  color: WALL_COLORS[kind],
  mesh: uploadMesh(city.wall.filter((piece) => piece.kind === kind).flatMap(({ rect }) => slab(rect, 0, KERB_HEIGHT))),
}));

// Temporary zone tints, one mesh per zone until colour moves into the vertex data.
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
const pavements = Object.values(Zone).map((zone) => ({
  color: ZONE_COLORS[zone],
  mesh: uploadMesh(
    city.blocks.filter((block) => block.zone === zone).flatMap((block) => slab(block.rect, 0, KERB_HEIGHT)),
  ),
}));
// Raised slightly so the paint doesn't fight the road surface for depth.
const markings = uploadMesh(city.markings.flatMap((marking) => slab(marking, 0, 0.02)));

const cube = uploadMesh(box([-0.5, 0, -0.5], [0.5, 1, 0.5]));

const buildings = generateBuildings(city, DEFAULT_CITY_SETTINGS.seed);
const unitCube = uploadMesh(box([0, 0, 0], [1, 1, 1]));

const lampPost = uploadMesh([
  ...box([-0.05, 0, -0.05], [0.05, 2.2, 0.05]),
  ...box([-0.6, 2.1, -0.04], [0.05, 2.2, 0.04]),
]);
const lampHead = uploadMesh(box([-0.7, 1.95, -0.12], [-0.4, 2.1, 0.12]));

const asciiProgram = createProgram(gl, fullscreenVertexSource, asciiFragmentSource);
const sceneTextureLocation = gl.getUniformLocation(asciiProgram, 'u_scene');
const cellSizeLocation = gl.getUniformLocation(asciiProgram, 'u_cellSize');
const glyphsLocation = gl.getUniformLocation(asciiProgram, 'u_glyphs');
const rampLengthLocation = gl.getUniformLocation(asciiProgram, 'u_rampLength');
const backgroundLocation = gl.getUniformLocation(asciiProgram, 'u_background');
const renderModeLocation = gl.getUniformLocation(asciiProgram, 'u_renderMode');
const fullscreenVao = gl.createVertexArray();

const settings: DevSettings = {
  fovDegrees: 60,
  cellWidth: 6,
  viewDistance: 500,
  renderMode: RenderMode.Glyphs,
  lockHeight: false,
};

const dpr = window.devicePixelRatio || 1;
const CELL_ASPECT = 1.75;
const GLYPH_RAMPS = [' .:-=+*#%@'];
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

const devMenu = createDevMenu(settings, (setting) => {
  if (setting === 'cellWidth') {
    buildCells();
    resize();
  }
});

trackKeyboard();
trackMouse(canvas);

const camera: Camera = {
  position: [0, 1.5, 4],
  yaw: 0,
  pitch: -0.2,
};

function draw(mesh: Mesh, mode: GLenum, matrix: Mat4, color: Vec3) {
  gl!.uniformMatrix4fv(matrixLocation, false, matrix);
  gl!.uniform3fv(colorLocation, color);
  gl!.bindVertexArray(mesh.vao);
  gl!.drawArrays(mode, 0, mesh.vertexCount);
}

// Longest step allowed, so returning to a background tab doesn't teleport the camera.
const MAX_FRAME_SECONDS = 0.1;
let previousTimeMs = 0;

function frame(timeMs: number) {
  requestAnimationFrame(frame);
  const t = timeMs / 1000;
  const dt = Math.min((timeMs - previousTimeMs) / 1000, MAX_FRAME_SECONDS);
  previousTimeMs = timeMs;
  updateFlyCamera(camera, dt, settings.lockHeight);
  const [cameraX, cameraY, cameraZ] = camera.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  devMenu.setInfo(
    `camera ${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)}` +
      `  yaw ${degrees(camera.yaw)}°  pitch ${degrees(camera.pitch)}°  seed ${DEFAULT_CITY_SETTINGS.seed}`,
  );

  // Full resolution skips the ASCII pass and draws the scene straight to the screen.
  const fullResolution = settings.renderMode === RenderMode.FullResolution;
  const target = fullResolution ? { framebuffer: null, width: canvas.width, height: canvas.height } : scene;
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
  gl!.viewport(0, 0, target.width, target.height);
  gl!.enable(gl!.DEPTH_TEST);
  const background: Vec3 = [0, 0, 0];
  gl!.clearColor(background[0], background[1], background[2], 0);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  gl!.useProgram(program);
  gl!.uniform3fv(fogColorLocation, background);
  gl!.uniform1f(fogDistanceLocation, settings.viewDistance);
  const aspect = canvas.width / canvas.height;
  const projection = perspective((settings.fovDegrees * Math.PI) / 180, aspect, 0.1, settings.viewDistance);
  const viewProjection = multiply(projection, viewMatrix(camera));

  draw(road, gl!.TRIANGLES, viewProjection, [0, 0, 0]);
  draw(markings, gl!.TRIANGLES, viewProjection, [1, 1, 1]);
  for (const { mesh, color } of pavements) draw(mesh, gl!.TRIANGLES, viewProjection, color);
  for (const { mesh, color } of wallPieces) draw(mesh, gl!.TRIANGLES, viewProjection, color);

  // One unit cube, moved to each building's corner and stretched to its size.
  for (const { rect, height } of buildings) {
    const model = multiply(
      translation(rect.minX, KERB_HEIGHT, rect.minZ),
      scaling(rect.maxX - rect.minX, height, rect.maxZ - rect.minZ),
    );
    draw(unitCube, gl!.TRIANGLES, multiply(viewProjection, model), [0.75, 0.7, 0.65]);
  }
  draw(triangle, gl!.TRIANGLES, multiply(viewProjection, rotationY(t)), [1.0, 0.5, 0.0]);
  draw(cube, gl!.TRIANGLES, multiply(viewProjection, translation(-2.5, 0, -2.5)), [0.3, 0.7, 1.0]);

  const lamp = multiply(viewProjection, translation(2.5, 0, -2.5));
  draw(lampPost, gl!.TRIANGLES, lamp, [0.6, 0.6, 0.65]);
  draw(lampHead, gl!.TRIANGLES, lamp, [1.0, 0.9, 0.4]);
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
  gl!.uniform1i(rampLengthLocation, [...GLYPH_RAMPS[0]].length);
  gl!.uniform3fv(backgroundLocation, background);
  gl!.uniform1i(renderModeLocation, settings.renderMode);
  gl!.bindVertexArray(fullscreenVao);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
}
requestAnimationFrame(frame);
