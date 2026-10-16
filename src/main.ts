import './style.css';
import { createDevMenu, Movement, RenderMode, type DevSettings } from './dev/menu.ts';
import { advanceClock, createClock, TICK_SECONDS, TICKS_PER_SECOND } from './game/clock.ts';
import { blendCars, CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH, collideCar, createCar, DEFAULT_CAR_SETTINGS, stepCar, type CarSettings } from './game/car.ts';
import { NO_INPUT, readCarInput } from './game/carInput.ts';
import { updateFlyCamera } from './game/flyCamera.ts';
import {
  createChaseCamera,
  DEFAULT_CHASE_CAMERA_SETTINGS,
  updateChaseCamera,
  type ChaseCameraSettings,
} from './game/chaseCamera.ts';
import { generateBuildings, inset, SETBACK, type Building } from './game/buildings.ts';
import { DEFAULT_CITY_SETTINGS, generateCity, CURB_HEIGHT, Zone, type City, type CitySettings, type Rect, type WallKind } from './game/city.ts';
import { cityColliders, pushOutOfColliders } from './game/collision.ts';
import { lotPavements } from './game/lots.ts';
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
import { createDistanceGlyphAtlas, createGlyphAtlas } from './render/glyphs.ts';
import {
  FLOATS_PER_SPRITE_VERTEX,
  markingSprites,
  SPRITE_GLYPHS,
  spriteVertices,
  stopSignSprites,
  streetLightSprites,
  trafficLightSprites,
} from './render/glyphSprites.ts';
import { ANIMATED_MATERIALS, EDGE_MATERIALS, SCATTER_MATERIALS, STROKE_MATERIALS, STROKE_ROW, SCATTER_SETTINGS, scatterParams, GLYPH_RAMPS, MATERIAL, RAMP_LENGTH, type Material } from './render/materials.ts';
import { createSignalTexture, updateSignalTexture } from './render/signalTexture.ts';
import { box, flatDisc, FLOATS_PER_VERTEX, gableRoof, withMaterial, withSideColor, withSideMaterial } from './render/shapes.ts';
import { streetLightVertices } from './render/models/street/streetLight.ts';
import { stopSignVertices } from './render/models/street/stopSign.ts';
import { trafficLightVertices } from './render/models/street/trafficLight.ts';
import { carVertices } from './render/models/car.ts';
import { DEFAULT_SKY_SETTINGS, FLOATS_PER_STAR, starVertices, type SkySettings } from './render/sky.ts';
import { headlight, HEADLIGHT_SOFT_EDGE } from './render/headlights.ts';
import vertexSource from './shaders/triangle.vert.glsl?raw';
import fragmentSource from './shaders/triangle.frag.glsl?raw';
import worldGlyphsSource from './shaders/worldGlyphs.glsl?raw';
import lightingSource from './shaders/lighting.glsl?raw';
import glyphInkSource from './shaders/glyphInk.glsl?raw';
import spriteVertexSource from './shaders/glyphSprite.vert.glsl?raw';
import spriteFragmentSource from './shaders/glyphSprite.frag.glsl?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert.glsl?raw';
import asciiFragmentSource from './shaders/ascii.frag.glsl?raw';
import crtFragmentSource from './shaders/crt.frag.glsl?raw';
import skyVertexSource from './shaders/sky.vert.glsl?raw';
import skyFragmentSource from './shaders/sky.frag.glsl?raw';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 not supported');

// Fixed attribute locations, shared by the scene program and the world glyphs variant.
const SCENE_ATTRIBUTES = {
  a_position: 0,
  a_color: 1,
  a_normal: 2,
  a_emission: 3,
  a_id: 4,
  a_material: 5,
  a_facade: 6,
  a_building: 7,
};
// Shared shader chunks, inserted where a shader has their marker line.
const withChunks = (source: string) => source.replace('// @lighting', lightingSource).replace('// @glyph-ink', glyphInkSource);
const program = createProgram(gl, vertexSource, withChunks(fragmentSource), SCENE_ATTRIBUTES);
const positionLocation = gl.getAttribLocation(program, 'a_position');
const colorLocation = gl.getAttribLocation(program, 'a_color');
const normalLocation = gl.getAttribLocation(program, 'a_normal');
const emissionLocation = gl.getAttribLocation(program, 'a_emission');
const idLocation = gl.getAttribLocation(program, 'a_id');
const materialLocation = gl.getAttribLocation(program, 'a_material');
// Only the building mesh has facade data; every other mesh reads these constants: zeros, not a wall.
gl.vertexAttrib4f(SCENE_ATTRIBUTES.a_facade, 0, 0, 0, 0);
gl.vertexAttrib1f(SCENE_ATTRIBUTES.a_building, 0);

function sceneUniforms(sceneProgram: WebGLProgram) {
  const at = (name: string) => gl!.getUniformLocation(sceneProgram, name);
  return {
    modelView: at('u_modelView'),
    normalMatrix: at('u_normalMatrix'),
    projection: at('u_projection'),
    fogColor: at('u_fogColor'),
    fogStart: at('u_fogStart'),
    fogEnd: at('u_fogEnd'),
    showNormals: at('u_showNormals'),
    lightDirection: at('u_lightDirection'),
    lightIntensity: at('u_lightIntensity'),
    ambient: at('u_ambient'),
    model: at('u_model'),
    headlightPosition: at('u_headlightPosition'),
    headlightDirection: at('u_headlightDirection'),
    headlightOuterCos: at('u_headlightOuterCos'),
    headlightInnerCos: at('u_headlightInnerCos'),
    headlightRange: at('u_headlightRange'),
    headlightIntensity: at('u_headlightIntensity'),
    signalsTexture: at('u_signals'),
    scatterMaterials: at('u_scatterMaterials'),
    scatterParams: at('u_scatterParams'),
  };
}
type SceneUniforms = ReturnType<typeof sceneUniforms>;
const sceneProgramUniforms = sceneUniforms(program);

// Prototype: glyphs painted onto surfaces in world space. The same scene shader with WORLD_GLYPHS defined,
// writing one colour straight to the canvas. Same attribute locations, so it draws the same meshes.
const worldGlyphsProgram = createProgram(
  gl,
  vertexSource,
  withChunks(
    fragmentSource
      .replace('#version 300 es', '#version 300 es\n#define WORLD_GLYPHS')
      .replace('// @world-glyphs', worldGlyphsSource),
  ),
  SCENE_ATTRIBUTES,
);
const worldGlyphsUniforms = sceneUniforms(worldGlyphsProgram);
const worldUniform = (name: string) => gl!.getUniformLocation(worldGlyphsProgram, name);
const worldLocations = {
  glyphs: worldUniform('u_glyphs'),
  atlasGrid: worldUniform('u_atlasGrid'),
  rampLength: worldUniform('u_rampLength'),
  themeRow: worldUniform('u_themeRow'),
  themeCount: worldUniform('u_themeCount'),
  edgeRow: worldUniform('u_edgeRow'),
  cellTexels: worldUniform('u_cellTexels'),
  sdfSpread: worldUniform('u_sdfSpread'),
  glyphSize: worldUniform('u_glyphSize'),
  densities: worldUniform('u_densities'),
  edgeBrightness: worldUniform('u_edgeBrightness'),
};
let uniforms = sceneProgramUniforms;

interface Mesh {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  facadeBuffer?: WebGLBuffer;
  vertexCount: number;
}

function uploadMesh(vertices: number[], facade?: number[]): Mesh {
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

  let facadeBuffer: WebGLBuffer | undefined;
  if (facade) {
    facadeBuffer = gl!.createBuffer();
    gl!.bindBuffer(gl!.ARRAY_BUFFER, facadeBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(facade), gl!.STATIC_DRAW);
    gl!.enableVertexAttribArray(SCENE_ATTRIBUTES.a_facade);
    gl!.vertexAttribPointer(SCENE_ATTRIBUTES.a_facade, 4, gl!.FLOAT, false, FLOATS_PER_FACADE * 4, 0);
    gl!.enableVertexAttribArray(SCENE_ATTRIBUTES.a_building);
    gl!.vertexAttribPointer(SCENE_ATTRIBUTES.a_building, 1, gl!.FLOAT, false, FLOATS_PER_FACADE * 4, 4 * 4);
  }

  gl!.bindVertexArray(null);
  return { vao, buffer, facadeBuffer, vertexCount: vertices.length / FLOATS_PER_VERTEX };
}

function deleteMesh(mesh: Mesh) {
  gl!.deleteBuffer(mesh.buffer);
  if (mesh.facadeBuffer) gl!.deleteBuffer(mesh.facadeBuffer);
  gl!.deleteVertexArray(mesh.vao);
}


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

// Test roofs for the screen direction glyphs.
const ROOF_ANGLE = 30; // degrees

function isHouse(city: City, rect: Rect): boolean {
  const x = (rect.minX + rect.maxX) / 2;
  const z = (rect.minZ + rect.maxZ) / 2;
  return city.blocks.some(
    (block) => block.zone === Zone.Houses && x > block.rect.minX && x < block.rect.maxX && z > block.rect.minZ && z < block.rect.maxZ,
  );
}

function slab(rect: Rect, bottom: number, top: number, color: Vec3): number[] {
  return box([rect.minX, bottom, rect.minZ], [rect.maxX, top, rect.maxZ], color);
}

// World glyphs: for each vertex of a building's side walls, u and v in m from the face's bottom left as seen from
// outside, the face width, the box height and a tag: building number + 1, or -1 for a panel. Top and bottom faces get zeros.
const FLOATS_PER_FACADE = 5;

function facadeData(vertices: number[], rect: Rect, bottom: number, height: number, tag: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < vertices.length; i += FLOATS_PER_VERTEX) {
    const [x, y, z, , , , nx, ny, nz] = vertices.slice(i, i + 9);
    if (ny !== 0) {
      data.push(0, 0, 0, 0, 0);
      continue;
    }
    const width = nx !== 0 ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
    const u = nx > 0 ? rect.maxZ - z : nx < 0 ? z - rect.minZ : nz > 0 ? x - rect.minX : rect.maxX - x;
    data.push(u, y - bottom, width, height, tag);
  }
  return data;
}

const CAR_PANEL = -1;
const carModel = carVertices();
const carRect = { minX: -CAR_WIDTH / 2, minZ: -CAR_LENGTH / 2, maxX: CAR_WIDTH / 2, maxZ: CAR_LENGTH / 2 };
const carMesh = uploadMesh(carModel, facadeData(carModel, carRect, 0, CAR_HEIGHT, CAR_PANEL));

// Temporary wall tints, for checking the shuffled order.
const WALL_COLORS: Record<WallKind, Vec3> = {
  corner: [0.3, 0.3, 0.32],
  narrow: [0.9, 0.85, 0.2],
  medium: [0.95, 0.5, 0.1],
  wide: [0.8, 0.15, 0.1],
  flex: [0.2, 0.7, 0.9],
};

const ROAD_COLOR: Vec3 = [0.2, 0.2, 0.2];
const CONCRETE_COLOR: Vec3 = [0.6, 0.6, 0.6];
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

// Test pond in the middle of each park, for the animated water glyphs.
const POND_RADIUS = 12;
const POND_SIDES = 24;
const POND_COLOR: Vec3 = [0.15, 0.3, 0.6];

function buildCityMeshes(
  city: City,
  buildings: Building[],
  streetLights: StreetLight[],
  { trafficLights, stopSigns }: Intersections,
): { ground: Mesh[]; furniture: Mesh[] } {
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
      const ground = slab(inset(rect, SETBACK), CURB_HEIGHT, CURB_HEIGHT + 0.02, color);
      return [...curb(slab(rect, 0, CURB_HEIGHT, CONCRETE_COLOR)), ...withMaterial(ground, MATERIAL[material])];
    }),
  );
  const wall = uploadMesh(
    curb([
      ...city.wallPavement.flatMap((strip) => slab(strip, 0, CURB_HEIGHT, CONCRETE_COLOR)),
      ...city.wall.flatMap(({ rect, kind }) => slab(rect, 0, CURB_HEIGHT, WALL_COLORS[kind])),
    ]),
  );
  // All buildings in one mesh, with corners already in world position, so they draw in a single call.
  const buildingVertices: number[] = [];
  const buildingFacades: number[] = [];
  buildings.forEach(({ rect, height }, index) => {
    const walls = withMaterial(slab(rect, CURB_HEIGHT, CURB_HEIGHT + height, [0.75, 0.7, 0.65]), MATERIAL.defaultBuilding);
    buildingVertices.push(...walls);
    buildingFacades.push(...facadeData(walls, rect, CURB_HEIGHT, height, index + 1));
    if (!isHouse(city, rect)) return;
    const { minX, minZ, maxX, maxZ } = rect;
    const roofHeight = (Math.tan((ROOF_ANGLE * Math.PI) / 180) * Math.min(maxX - minX, maxZ - minZ)) / 2;
    const roof = gableRoof(minX, minZ, maxX, maxZ, CURB_HEIGHT + height, roofHeight, [0.75, 0.7, 0.65]);
    // Only the slopes are roof; the gable ends are wall.
    buildingVertices.push(...withSideMaterial(withMaterial(roof, MATERIAL.houseRoof), MATERIAL.defaultBuilding));
    buildingFacades.push(...new Array((roof.length / FLOATS_PER_VERTEX) * FLOATS_PER_FACADE).fill(0));
  });
  const buildingMesh = uploadMesh(buildingVertices, buildingFacades);
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
  // Street furniture and markings are drawn as glyph sprites in the world glyphs mode instead.
  return { ground: [road, pavements, wall, buildingMesh, ponds], furniture: [markings, lights, signals] };
}

const citySettings: CitySettings = { ...DEFAULT_CITY_SETTINGS };
const carSettings: CarSettings = { ...DEFAULT_CAR_SETTINGS };
const chaseSettings: ChaseCameraSettings = { ...DEFAULT_CHASE_CAMERA_SETTINGS };
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
  [...cityMeshes.ground, ...cityMeshes.furniture].forEach(deleteMesh);
  cityMeshes = buildCityMeshes(city, buildings, streetLights, intersections);
  spritesHeight = 0;
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
  glyphHeight: 1.2,
  starGlyphSize: 10,
  edgeBrightness: 0.7,
};

const dpr = window.devicePixelRatio || 1;
const CELL_ASPECT = 1.75;
const scene = createRenderTarget(gl);

// World glyphs prototype.
// Window glyph themes, one picked per building, darkest first like a ramp.
const WINDOW_THEMES = [' .:;=+#HHH', ' .,:;xXZXZ', " .'`/|//\\/", ' .:o%%#%@%', ' .,vVAYAVO'];
// Glyphs that draw the outline of each wall: left side, right side, top.
const WALL_EDGES = '[]=';
const ATLAS_COLUMNS = [...GLYPH_RAMPS[0]].length;
const padRow = (glyphs: string) => glyphs + ' '.repeat(ATLAS_COLUMNS - [...glyphs].length);
const WORLD_GLYPH_ROWS = [...GLYPH_RAMPS, ...WINDOW_THEMES.map(padRow), padRow(WALL_EDGES), padRow(SPRITE_GLYPHS)];
const EDGE_ROW = WORLD_GLYPH_ROWS.length - 2;
const SPRITE_ROW = WORLD_GLYPH_ROWS.length - 1;
// Share of grid squares with a glyph, so surfaces are scattered characters with dark space between them.
// Curb sides are too low for a whole glyph, so they stay dark.
const GLYPH_DENSITY: Partial<Record<Material, number>> = { defaultRoad: 0.04, concrete: 0.3, grass: 0.35, defaultCurbSide: 0 };
// Atlas cell size in texels. Big, since the distance field is cut from it: the finer it is, the truer the outlines.
const WORLD_ATLAS_CELL_HEIGHT = 128;
const WORLD_ATLAS_CELL_WIDTH = Math.round(WORLD_ATLAS_CELL_HEIGHT / CELL_ASPECT);
const SDF_SPREAD = 12; // texels
const worldGlyphAtlas = createDistanceGlyphAtlas(gl, WORLD_GLYPH_ROWS, WORLD_ATLAS_CELL_WIDTH, WORLD_ATLAS_CELL_HEIGHT, SDF_SPREAD);

const worldGlyphDensities = new Float32Array(32).fill(1);
for (const [name, density] of Object.entries(GLYPH_DENSITY) as [Material, number][]) {
  worldGlyphDensities[MATERIAL[name]] = density;
}

// Street furniture and road markings as single characters in space (render/glyphSprites.ts).
const SPRITE_ATTRIBUTES = {
  a_centre: 0,
  a_corner: 1,
  a_size: 2,
  a_glyph: 3,
  a_color: 4,
  a_emission: 5,
  a_id: 6,
  a_right: 7,
  a_up: 8,
  a_twoSided: 9,
};
// Floats per attribute, in the order they are packed.
const SPRITE_LAYOUT: [keyof typeof SPRITE_ATTRIBUTES, number][] = [
  ['a_centre', 3],
  ['a_corner', 2],
  ['a_size', 2],
  ['a_glyph', 2],
  ['a_color', 3],
  ['a_emission', 1],
  ['a_id', 1],
  ['a_right', 3],
  ['a_up', 3],
  ['a_twoSided', 1],
];
const spriteProgram = createProgram(gl, spriteVertexSource, withChunks(spriteFragmentSource), SPRITE_ATTRIBUTES);
const spriteUniforms = sceneUniforms(spriteProgram);
const spriteUniform = (name: string) => gl!.getUniformLocation(spriteProgram, name);
const spriteLocations = {
  cameraPosition: spriteUniform('u_cameraPosition'),
  atlasGrid: spriteUniform('u_atlasGrid'),
  atlasSize: spriteUniform('u_atlasSize'),
  glyphs: spriteUniform('u_glyphs'),
  sdfSpread: spriteUniform('u_sdfSpread'),
};
const spriteVao = gl.createVertexArray();
const spriteBuffer = gl.createBuffer();
gl.bindVertexArray(spriteVao);
gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
let spriteOffset = 0;
for (const [name, size] of SPRITE_LAYOUT) {
  gl.enableVertexAttribArray(SPRITE_ATTRIBUTES[name]);
  gl.vertexAttribPointer(SPRITE_ATTRIBUTES[name], size, gl.FLOAT, false, FLOATS_PER_SPRITE_VERTEX * 4, spriteOffset * 4);
  spriteOffset += size;
}
gl.bindVertexArray(null);
let spriteCount = 0;
// The glyph height the sprites were built for; 0 means they need building.
let spritesHeight = 0;

// Rebuilt when the city or the glyph height changes.
function uploadSprites(height: number) {
  const sprites = [
    ...streetLights.flatMap((light) => streetLightSprites(light, height)),
    ...intersections.trafficLights.flatMap((light) => trafficLightSprites(light, height)),
    ...intersections.stopSigns.flatMap((sign) => stopSignSprites(sign, height)),
    ...city.markings.flatMap(markingSprites),
  ];
  const vertices = spriteVertices(sprites, SPRITE_ROW);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, spriteBuffer);
  gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(vertices), gl!.STATIC_DRAW);
  spriteCount = vertices.length / FLOATS_PER_SPRITE_VERTEX;
  spritesHeight = height;
}

// The sky as glyphs: the same star shaders with WORLD_GLYPHS defined, drawing glyph sprites.
const withWorldGlyphs = (source: string) => source.replace('#version 300 es', '#version 300 es\n#define WORLD_GLYPHS');
const skyWorldProgram = createProgram(gl, withWorldGlyphs(skyVertexSource), withWorldGlyphs(skyFragmentSource), {
  a_direction: starDirectionLocation,
  a_color: starColorLocation,
});
const skyUniform = (name: string) => gl!.getUniformLocation(skyWorldProgram, name);
const skyWorldLocations = {
  viewRotation: skyUniform('u_viewRotation'),
  projection: skyUniform('u_projection'),
  material: skyUniform('u_material'),
  pointSize: skyUniform('u_pointSize'),
  glyphs: skyUniform('u_glyphs'),
  atlasGrid: skyUniform('u_atlasGrid'),
  rampLength: skyUniform('u_rampLength'),
};

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
  gl!.uniformMatrix4fv(uniforms.modelView, false, model ? multiply(view, model) : view);
  // Only valid while models have no scaling.
  const m = model ?? identity();
  gl!.uniformMatrix4fv(uniforms.model, false, m);
  gl!.uniformMatrix3fv(uniforms.normalMatrix, false, [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
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
    collideCar(car, colliders, carSettings);
  });
  // Drawn between the last two ticks by the time left over, so motion is smooth on any refresh rate.
  const drawnCar = blendCars(previousCar, car, clock.leftover / TICK_SECONDS);
  let fovBoost = 0;
  if (settings.movement === Movement.FlyCamera) {
    updateFlyCamera(camera, dt);
    if (!settings.noclip) pushOutOfColliders(camera.position, CAMERA_RADIUS, colliders);
  } else {
    fovBoost = updateChaseCamera(camera, chase, drawnCar, carSettings, chaseSettings, colliders, dt);
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
  const worldGlyphs = settings.renderMode === RenderMode.WorldGlyphs;
  const fullResolution = settings.renderMode === RenderMode.FullResolution || showNormals || worldGlyphs;
  const sceneProgram = worldGlyphs ? worldGlyphsProgram : program;
  uniforms = worldGlyphs ? worldGlyphsUniforms : sceneProgramUniforms;
  const target = fullResolution ? { framebuffer: null, width: canvas.width, height: canvas.height } : scene;
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
  gl!.viewport(0, 0, target.width, target.height);
  gl!.enable(gl!.DEPTH_TEST);
  const background: Vec3 = [0, 0, 0];
  gl!.clearColor(background[0], background[1], background[2], 0);
  gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

  const light = headlight(drawnCar);
  const halfAngle = (settings.headlightAngle * Math.PI) / 360;
  const aspect = canvas.width / canvas.height;
  const projection = perspective(((settings.fovDegrees + fovBoost) * Math.PI) / 180, aspect, NEAR_PLANE, settings.viewDistance);
  gl!.activeTexture(gl!.TEXTURE3);
  updateSignalTexture(gl!, signals, offsets.map((offset) => signalPhase(clock.tick, offset)));
  // The scene program and the glyph sprites share fog, lights, projection and signals.
  const applySceneUniforms = (u: SceneUniforms) => {
    gl!.uniform3fv(u.fogColor, background);
    gl!.uniform1f(u.fogStart, settings.fogStart);
    gl!.uniform1f(u.fogEnd, settings.viewDistance);
    gl!.uniform1i(u.showNormals, showNormals ? 1 : 0);
    gl!.uniform3fv(u.lightDirection, LIGHT_DIRECTION);
    gl!.uniform1f(u.ambient, settings.ambient);
    gl!.uniform1f(u.lightIntensity, settings.lightIntensity);
    gl!.uniform3fv(u.headlightPosition, light.position);
    gl!.uniform3fv(u.headlightDirection, light.direction);
    gl!.uniform1f(u.headlightOuterCos, Math.cos(halfAngle));
    gl!.uniform1f(u.headlightInnerCos, Math.cos(halfAngle * (1 - HEADLIGHT_SOFT_EDGE)));
    gl!.uniform1f(u.headlightRange, settings.headlightRange);
    gl!.uniform1f(u.headlightIntensity, headlightsOn ? settings.headlightIntensity : 0);
    gl!.uniform1i(u.scatterMaterials, SCATTER_MATERIALS);
    gl!.uniform3fv(u.scatterParams, scatterParams());
    gl!.uniformMatrix4fv(u.projection, false, projection);
    gl!.uniform1i(u.signalsTexture, 3);
  };
  gl!.useProgram(sceneProgram);
  applySceneUniforms(uniforms);
  const view = viewMatrix(camera);

  // Stars first and without depth, so anything in the city covers them.
  const skyRotation = viewMatrix({ ...camera, position: [0, 0, 0] });
  if (worldGlyphs) {
    gl!.useProgram(skyWorldProgram);
    gl!.uniformMatrix4fv(skyWorldLocations.viewRotation, false, skyRotation);
    gl!.uniformMatrix4fv(skyWorldLocations.projection, false, projection);
    gl!.uniform1f(skyWorldLocations.material, MATERIAL.star);
    gl!.uniform1f(skyWorldLocations.pointSize, settings.starGlyphSize * dpr);
    gl!.activeTexture(gl!.TEXTURE5);
    gl!.bindTexture(gl!.TEXTURE_2D, worldGlyphAtlas);
    gl!.uniform1i(skyWorldLocations.glyphs, 5);
    gl!.uniform2f(skyWorldLocations.atlasGrid, ATLAS_COLUMNS, WORLD_GLYPH_ROWS.length);
    gl!.uniform1i(skyWorldLocations.rampLength, RAMP_LENGTH);
  } else {
    gl!.useProgram(skyProgram);
    gl!.uniformMatrix4fv(skyViewRotationLocation, false, skyRotation);
    gl!.uniformMatrix4fv(skyProjectionLocation, false, projection);
    gl!.uniform1f(skyMaterialLocation, MATERIAL.star);
  }
  gl!.disable(gl!.DEPTH_TEST);
  gl!.bindVertexArray(starVao);
  gl!.drawArrays(gl!.POINTS, 0, starCount);
  gl!.enable(gl!.DEPTH_TEST);
  gl!.useProgram(sceneProgram);
  if (worldGlyphs) {
    gl!.activeTexture(gl!.TEXTURE5);
    gl!.bindTexture(gl!.TEXTURE_2D, worldGlyphAtlas);
    gl!.uniform1i(worldLocations.glyphs, 5);
    gl!.uniform2f(worldLocations.atlasGrid, ATLAS_COLUMNS, WORLD_GLYPH_ROWS.length);
    gl!.uniform1i(worldLocations.rampLength, RAMP_LENGTH);
    gl!.uniform1i(worldLocations.themeRow, GLYPH_RAMPS.length);
    gl!.uniform1i(worldLocations.themeCount, WINDOW_THEMES.length);
    gl!.uniform1i(worldLocations.edgeRow, EDGE_ROW);
    gl!.uniform2f(worldLocations.cellTexels, WORLD_ATLAS_CELL_WIDTH, WORLD_ATLAS_CELL_HEIGHT);
    gl!.uniform1f(worldLocations.sdfSpread, SDF_SPREAD);
    gl!.uniform2f(worldLocations.glyphSize, settings.glyphHeight / CELL_ASPECT, settings.glyphHeight);
    gl!.uniform1fv(worldLocations.densities, worldGlyphDensities);
    gl!.uniform1f(worldLocations.edgeBrightness, settings.edgeBrightness);
  }

  for (const mesh of cityMeshes.ground) draw(mesh, gl!.TRIANGLES, view);
  if (!worldGlyphs) for (const mesh of cityMeshes.furniture) draw(mesh, gl!.TRIANGLES, view);
  draw(carMesh, gl!.TRIANGLES, view, multiply(translation(drawnCar.x, 0, drawnCar.z), rotationY(drawnCar.heading)));
  if (worldGlyphs) {
    if (spritesHeight !== settings.glyphHeight) uploadSprites(settings.glyphHeight);
    gl!.useProgram(spriteProgram);
    applySceneUniforms(spriteUniforms);
    gl!.uniformMatrix4fv(spriteUniforms.modelView, false, view);
    gl!.uniform3fv(spriteLocations.cameraPosition, camera.position);
    gl!.uniform2f(spriteLocations.atlasGrid, ATLAS_COLUMNS, WORLD_GLYPH_ROWS.length);
    gl!.uniform2f(spriteLocations.atlasSize, ATLAS_COLUMNS * WORLD_ATLAS_CELL_WIDTH, WORLD_GLYPH_ROWS.length * WORLD_ATLAS_CELL_HEIGHT);
    gl!.uniform1i(spriteLocations.glyphs, 5);
    gl!.uniform1f(spriteLocations.sdfSpread, SDF_SPREAD);
    gl!.bindVertexArray(spriteVao);
    gl!.drawArrays(gl!.TRIANGLES, 0, spriteCount);
  }
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
