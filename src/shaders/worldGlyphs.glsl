// World glyphs prototype, inserted into triangle.frag.glsl when WORLD_GLYPHS is defined.
// Every surface is drawn only as glyphs on black: building walls as a grid of windows fitted to the face with edge
// glyphs around it, everything else as a grid in its own space. Small street things are glyph sprites instead
// (glyphSprite.*.glsl).

in vec4 v_facade; // building walls: u, v in m from the face's bottom left, face width, box height
in float v_building; // building number + 1; -1 for a panel (the car's sides): edges, but no windows; 0 for neither
in vec3 v_objectPosition;
in vec3 v_objectNormal;

uniform sampler2D u_glyphs; // mipmapped distance field atlas: material ramps, window themes, edge glyphs, sprites
uniform vec2 u_atlasGrid; // atlas columns and rows
uniform vec2 u_cellTexels; // size of one atlas cell in texels
uniform int u_rampLength;
uniform int u_themeRow; // atlas row of the first window theme
uniform int u_themeCount;
uniform int u_edgeRow; // atlas row of the edge glyphs
uniform vec2 u_glyphSize; // m, width and height of one glyph, the same on every surface
uniform float u_densities[32]; // share of grid squares per material that get a glyph at all
uniform float u_edgeBrightness;
uniform mat3 u_normalMatrix; // the model's rotation, also set for the vertex shader

// @glyph-ink

const float FLOOR_HEIGHT = 3.5; // m, wanted floor height; floors are fitted to each building's height
const float LIT_MIN = 0.03; // share of a building's windows that are lit, picked per building
const float LIT_MAX = 0.22;
const float EMPTY_WINDOWS = 0.3; // share of windows with no glyph at all
// Below this many pixels per glyph, single windows and scatter squares start to sparkle as the camera moves,
// so they blend into the face's expected colour.
const float CELL_FADE_START = 2.5;
const float CELL_FADE_END = 0.8;
const float LIT_COVERAGE = 0.35; // rough ink coverage of a bright glyph
const float DIM_COVERAGE = 0.2;
// Mostly warm and white rooms, now and then a neon one.
const vec3 WINDOW_TINTS[8] = vec3[8](
  vec3(1.0, 0.78, 0.45), vec3(1.0, 0.78, 0.45), vec3(1.0, 0.85, 0.6), vec3(1.0, 0.85, 0.6),
  vec3(0.85, 0.9, 1.0), vec3(0.85, 0.9, 1.0), vec3(0.35, 0.9, 1.0), vec3(1.0, 0.4, 0.85)
);
// Dark windows: their glyph is this much brighter than the face's lit colour, picked between the two per glyph.
const vec2 DIM_GLYPH_BOOST = vec2(0.7, 1.4);
// Columns of the edge row: [ ] =
const int EDGE_LEFT = 0;
const int EDGE_RIGHT = 1;
const int EDGE_TOP = 2;
// Glowing things use at least this many of the densest glyphs of their ramp.
const int GLOW_LEVELS = 3;

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

int levelOf(vec3 color) {
  return min(int(luma(color) * float(u_rampLength)), u_rampLength - 1);
}

// The surface's axes as seen from in front of it, so glyphs aren't mirrored: u to the right, v up.
void glyphAxes(vec3 normal, out vec3 u, out vec3 v) {
  vec3 a = abs(normal);
  if (a.y >= a.x && a.y >= a.z) {
    u = vec3(1.0, 0.0, 0.0);
    v = vec3(0.0, 0.0, -1.0);
  } else if (a.x >= a.z) {
    u = vec3(0.0, 0.0, -sign(normal.x));
    v = vec3(0.0, 1.0, 0.0);
  } else {
    u = vec3(sign(normal.z), 0.0, 0.0);
    v = vec3(0.0, 1.0, 0.0);
  }
}

// Pixels one glyph covers on screen, from how fast the grid position changes per pixel. The mean of both screen
// directions, so walls seen edge-on don't fade early: anisotropic filtering handles the squeezed direction.
float pixelsPerGlyph(vec2 dpdx, vec2 dpdy) {
  return 1.0 / max(sqrt(length(dpdx) * length(dpdy)), 1e-6);
}

// Ink of one glyph at grid position p. Gradients come from the unbroken p, since fract() jumps at every square
// border and would pick the smallest mip there.
float glyphMask(int column, int row, vec2 p, vec2 dpdx, vec2 dpdy) {
  vec2 cell = vec2(column, row);
  vec2 inside = fract(p);
  vec2 scale = vec2(1.0, -1.0) / u_atlasGrid; // atlas rows run top-down, v runs up
  vec4 texel = textureGrad(u_glyphs, (cell + vec2(inside.x, 1.0 - inside.y)) / u_atlasGrid, dpdx * scale, dpdy * scale);
  float texelsPerPixel = sqrt(length(dpdx * u_cellTexels) * length(dpdy * u_cellTexels));
  return glyphInk(texel, texelsPerPixel);
}

// Edges in the surface's own hue, bright enough to read even on dark materials, dimmer on faces turned from the light.
vec3 edgeColor(vec3 lit) {
  float strongest = max(v_color.r, max(v_color.g, v_color.b));
  float lighting = clamp(luma(lit) / max(luma(v_color), 0.01), 0.5, 1.5);
  return v_color / max(strongest, 0.25) * u_edgeBrightness * lighting;
}

vec3 facade(vec3 normal, vec2 p, vec2 cellSize, ivec2 cells, int rowsPerFloor, vec2 dpdx, vec2 dpdy) {
  float cellDetail = smoothstep(CELL_FADE_END, CELL_FADE_START, pixelsPerGlyph(dpdx, dpdy));

  // Per building: a glyph theme, how many windows are lit, and their colour.
  int building = int(v_building);
  int row = u_themeRow + min(int(hash(ivec2(building, 1), 101u) * float(u_themeCount)), u_themeCount - 1);
  float litChance = mix(LIT_MIN, LIT_MAX, hash(ivec2(building, 2), 101u));
  vec3 tint = WINDOW_TINTS[min(int(hash(ivec2(building, 3), 101u) * 8.0), 7)];

  // Lit at the glyph's centre, so a glyph never splits across a lighting edge.
  ivec2 cell = clamp(ivec2(floor(p)), ivec2(0), cells - 1);
  vec3 u, v;
  glyphAxes(normal, u, v);
  vec2 toCentre = (vec2(cell) + 0.5 - p) * cellSize;
  vec3 lit = light(v_color, v_emission, v_worldPosition + toCentre.x * u + toCentre.y * v, normal);

  // The face's outline is made of glyphs too: brackets down the sides, a row along the top.
  int edge = cell.x == 0 ? EDGE_LEFT : cell.x == cells.x - 1 ? EDGE_RIGHT : cell.y == cells.y - 1 ? EDGE_TOP : -1;
  if (edge >= 0) {
    vec3 color = edgeColor(lit);
    return mix(color * DIM_COVERAGE, color * glyphMask(edge, u_edgeRow, p, dpdx, dpdy), cellDetail);
  }

  if (v_building < -0.5) {
    vec3 sharp = lit * glyphMask(levelOf(lit), int(v_material) - 1, p, dpdx, dpdy);
    return mix(lit * DIM_COVERAGE, sharp, cellDetail);
  }

  // A window spans the rows of one floor. Each face of a building gets its own pattern.
  uint salt = uint(building) * 8u + uint(int(normal.x * 2.0 + normal.z * 3.0) + 4);
  float window = hash(ivec2(cell.x, cell.y / rowsPerFloor), salt);
  float variant = hash(cell, salt + 1000003u);
  vec3 color = lit * mix(DIM_GLYPH_BOOST.x, DIM_GLYPH_BOOST.y, variant);
  int level = 0;
  if (window < litChance) {
    // Lit windows glow whatever the light, with the densest glyphs of the theme.
    color = tint;
    level = u_rampLength - 1 - int(variant * 3.0);
  } else if (window < 1.0 - EMPTY_WINDOWS) {
    level = levelOf(color);
  }

  vec3 sharp = color * glyphMask(level, row, p, dpdx, dpdy);
  vec3 average = litChance * tint * LIT_COVERAGE + (1.0 - litChance - EMPTY_WINDOWS) * lit * DIM_COVERAGE;
  return mix(average, sharp, cellDetail);
}

// A grid in the object's own space (world space for the city, the car's space for the car), so glyphs stick to
// whatever they are on.
vec3 grid(vec3 normal, vec2 p, vec3 u, vec3 v, vec2 dpdx, vec2 dpdy) {
  float cellDetail = smoothstep(CELL_FADE_END, CELL_FADE_START, pixelsPerGlyph(dpdx, dpdy));

  ivec2 cell = ivec2(floor(p));
  vec2 toCentre = (vec2(cell) + 0.5 - p) * u_glyphSize;
  vec3 lit = light(v_color, v_emission, v_worldPosition + u_normalMatrix * (toCentre.x * u + toCentre.y * v), normal);
  int material = int(v_material);
  int level = levelOf(lit);
  if (v_emission > 0.5) level = max(level, u_rampLength - GLOW_LEVELS);
  if (level > 0 && (u_scatterMaterials & (1 << material)) != 0) {
    level = min(int(hash(cell, uint(material)) * float(u_rampLength)), u_rampLength - 1);
  }
  float density = u_densities[material];
  if (hash(cell, uint(material) + 64u) >= density) level = 0;
  vec3 sharp = lit * glyphMask(level, material - 1, p, dpdx, dpdy);
  return mix(lit * DIM_COVERAGE * density, sharp, cellDetail);
}

void worldGlyphs(vec3 normal, float distance) {
  int material = int(v_material);

  // Both grids and their gradients are worked out for every pixel: derivatives are only defined outside branches.
  vec3 u, v;
  glyphAxes(normalize(v_objectNormal), u, v);
  vec2 gridP = vec2(dot(v_objectPosition, u), dot(v_objectPosition, v)) / u_glyphSize;
  vec2 gridDx = dFdx(gridP);
  vec2 gridDy = dFdy(gridP);
  // Whole glyphs across the face, whole floors up the building and whole rows per floor, so no glyph is cut.
  // Panels have no floors: each row is its own floor.
  bool building = v_building > 0.5;
  float height = max(v_facade.w, 0.01);
  float floorHeight = height / max(1.0, round(height / (building ? FLOOR_HEIGHT : u_glyphSize.y)));
  int rowsPerFloor = max(1, int(round(floorHeight / u_glyphSize.y)));
  float rowHeight = floorHeight / float(rowsPerFloor);
  float faceWidth = max(v_facade.z, 0.01);
  float columns = max(1.0, round(faceWidth / (rowHeight * u_glyphSize.x / u_glyphSize.y)));
  vec2 cellSize = vec2(faceWidth / columns, rowHeight);
  ivec2 cells = ivec2(columns, round(height / rowHeight));
  vec2 facadeP = v_facade.xy / cellSize;
  vec2 facadeDx = dFdx(facadeP);
  vec2 facadeDy = dFdy(facadeP);

  vec3 color = abs(v_building) > 0.5
    ? facade(normal, facadeP, cellSize, cells, rowsPerFloor, facadeDx, facadeDy)
    : grid(normal, gridP, u, v, gridDx, gridDy);
  outColor = vec4(mix(color, u_fogColor, fogAt(distance)), 1.0);
}
