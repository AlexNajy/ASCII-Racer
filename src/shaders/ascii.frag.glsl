#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_normals;
uniform sampler2D u_glyphs;
uniform sampler2D u_scatter;
uniform ivec2 u_cellSize;
uniform int u_rampLength;
uniform int u_edgeMaterials; // bit n set: material n has edge glyphs after its ramp
uniform int u_scatterMaterials; // bit n set: material n's ramp is 10 variants picked by the scatter value
uniform int u_animatedMaterials; // bit n set: material n's glyph moves over time
uniform int u_strokeMaterials; // bit n set: material n uses the stroke sets on faces sloping on screen
uniform int u_strokeRow; // atlas row of the first stroke set (|), followed by \, - and /
uniform float u_animationPhase; // 0 to 1 through one animation loop
uniform float u_animationLevels; // animated glyphs move up to this many ramp levels brighter or darker
uniform float u_waveScale;
uniform int u_tick; // an int, so it stays exact (a float would lose whole ticks after ~77 hours)
uniform float u_splashChance; // share of shore cells splashing at any moment
uniform int u_splashTicks; // how long one splash lasts
uniform vec3 u_background;
// 0 = full-strength hue, 1 = the cell's true colour.
uniform float u_glyphShade;
uniform int u_renderMode; // 0 glyphs, 1 brightness, 2 scene, 5 normal texture, 6 CRT scene, 8 screen normals
// Turns world directions into view space: x right, y up, z towards the camera.
uniform mat3 u_viewRotation;

out vec4 outColor;

// Neighbouring faces whose normals are further apart than this (about 25°) form an edge.
const float EDGE_THRESHOLD = 0.9;
// Edges darker than this level use their ramp glyph, so fogged, far buildings don't turn into rows of edges.
const int EDGE_MIN_LEVEL = 2;
// Edges darker than this level use the dim edge glyph instead of the left and right ones.
const int EDGE_BRIGHT_LEVEL = 4;
// A neighbour this many distance steps closer (normals alpha, 1/255 each) is in front, so it hides the
// face instead of ending it. 1 step is ~0.3 m at 2 m, ~0.6 m at 10 m, ~2 m at 100 m.
const float EDGE_DEPTH_STEPS = 1.5;
// Two waves crossing at different angles and speeds, -1 to 1. Whole-number speeds so the loop is seamless.
float wave(ivec2 cell) {
  float t = 6.2831853 * u_animationPhase;
  vec2 c = vec2(cell) * u_waveScale;
  return 0.5 * (sin(t + c.x * 0.7 + c.y * 0.3) + sin(2.0 * t - c.x * 0.4 + c.y * 0.9));
}

vec4 normalAt(ivec2 cell) {
  ivec2 last = textureSize(u_normals, 0) - 1;
  return texelFetch(u_normals, clamp(cell, ivec2(0), last), 0);
}

bool facesDiffer(vec4 a, vec4 b) {
  return dot(a.rgb * 2.0 - 1.0, b.rgb * 2.0 - 1.0) < EDGE_THRESHOLD;
}

// World normals with more y than this are flat ground or roofs and keep their ramp.
const float FLAT_NORMAL_Y = 0.99;
// Faces whose fall line runs less than this along the screen (it points at or away from the camera) have no
// stroke direction.
const float STROKE_MIN_LEAN = 0.3;
// Degrees either side of straight up a stroke line can tilt and still be |, and either side of level and still be -.
// Everything between is / or \. Equal bins are 22.5 each.
const float STROKE_VERTICAL_RANGE = 20.0;
const float STROKE_HORIZONTAL_RANGE = 20.0;

// The direction a face's strokes run on screen, along its fall line (straight downhill on the face):
// 0 |, 1 \, 2 -, 3 /, or -1 for none.
int strokeDirection(ivec2 cell) {
  vec3 world = normalAt(cell).rgb * 2.0 - 1.0;
  if (world.y > FLAT_NORMAL_Y) return -1;
  // Straight down, minus the part that points out of the face.
  vec3 fall = normalize(vec3(0.0, -1.0, 0.0) + world.y * world);
  vec2 line = (u_viewRotation * fall).xy;
  if (length(line) < STROKE_MIN_LEAN) return -1;
  // A line has no front or back, so angles half a turn apart are the same: fold into 0 to 180°.
  float angle = degrees(atan(line.y, line.x));
  if (angle < 0.0) angle += 180.0;
  if (abs(angle - 90.0) < STROKE_VERTICAL_RANGE) return 0;
  if (angle < STROKE_HORIZONTAL_RANGE || angle > 180.0 - STROKE_HORIZONTAL_RANGE) return 2;
  return angle < 90.0 ? 3 : 1;
}

// The cell is at the edge of its face on that side: the neighbour is empty (a silhouette), or faces another
// way without standing in front of it.
bool edgeTowards(ivec2 cell, vec4 normal, ivec2 offset) {
  ivec2 other = clamp(cell + offset, ivec2(0), textureSize(u_normals, 0) - 1);
  if (texelFetch(u_scene, other, 0).a == 0.0) return true;
  vec4 neighbour = texelFetch(u_normals, other, 0);
  bool inFront = (normal.a - neighbour.a) * 255.0 > EDGE_DEPTH_STEPS;
  return facesDiffer(normal, neighbour) && !inFront;
}

// A random number from 0 to 1 for three whole numbers (PCG 3D hash): the same inputs always give the same result.
float hash(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float(v.x) / 4294967295.0;
}

// A cell at the edge of its material: a neighbour above, below or to the side is empty or another material,
// and not standing in front of it (a car in front of the pond doesn't make a shore).
bool isShore(ivec2 cell, int material) {
  ivec2 last = textureSize(u_scene, 0) - 1;
  float distance = texelFetch(u_normals, cell, 0).a;
  ivec2 offsets[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
  for (int i = 0; i < 4; i++) {
    ivec2 other = clamp(cell + offsets[i], ivec2(0), last);
    float alpha = texelFetch(u_scene, other, 0).a;
    if (alpha == 0.0) return true;
    if (int(round(alpha * 255.0)) == material) continue;
    bool inFront = (distance - texelFetch(u_normals, other, 0).a) * 255.0 > EDGE_DEPTH_STEPS;
    if (!inFront) return true;
  }
  return false;
}

// Shore cells splash now and then. Each cell starts its splashes at its own offset, so they don't all
// change at the same moment.
bool splashing(ivec2 cell) {
  uvec2 c = uvec2(cell);
  int start = int(hash(uvec3(c, 0u)) * float(u_splashTicks));
  int slot = (u_tick + start) / u_splashTicks;
  return hash(uvec3(c, uint(slot) + 1u)) < u_splashChance;
}

// Dev view, like an old TV: each scene pixel is a soft blob that bleeds into its neighbours (wider
// sideways, like a CRT beam), with darker gaps between rows as scanlines.
const vec2 CRT_SPREAD = vec2(0.6, 0.4); // blob size in scene pixels, x and y
const float CRT_SCANLINE = 0.35; // how much darker the gaps between rows are

vec3 crt() {
  vec2 position = gl_FragCoord.xy / vec2(u_cellSize) - 0.5;
  ivec2 base = ivec2(floor(position));
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int y = -1; y <= 2; y++) {
    for (int x = -1; x <= 2; x++) {
      ivec2 texel = clamp(base + ivec2(x, y), ivec2(0), textureSize(u_scene, 0) - 1);
      vec4 scene = texelFetch(u_scene, texel, 0);
      vec2 distance = (vec2(base + ivec2(x, y)) - position) / CRT_SPREAD;
      float weight = exp(-0.5 * dot(distance, distance));
      sum += weight * (scene.a == 0.0 ? u_background : scene.rgb);
      total += weight;
    }
  }
  float row = fract(position.y + 0.5) - 0.5; // -0.5 to 0.5 across a row, 0 in its middle
  return sum / total * (1.0 - CRT_SCANLINE * smoothstep(0.2, 0.5, abs(row)));
}

void main() {
  if (u_renderMode == 6) {
    outColor = vec4(crt(), 1.0);
    return;
  }

  ivec2 cell = ivec2(gl_FragCoord.xy) / u_cellSize;
  vec4 scene = texelFetch(u_scene, cell, 0);
  vec3 color = scene.rgb;

  // Alpha 0 means nothing was drawn here: show the background as a solid colour.
  if (scene.a == 0.0) {
    outColor = vec4(u_background, 1.0);
    return;
  }

  if (u_renderMode == 5) {
    outColor = vec4(texelFetch(u_normals, cell, 0).rgb, 1.0);
    return;
  }

  if (u_renderMode == 8) {
    vec3 normal = u_viewRotation * (texelFetch(u_normals, cell, 0).rgb * 2.0 - 1.0);
    outColor = vec4(normal * 0.5 + 0.5, 1.0);
    return;
  }

  if (u_renderMode == 2) {
    outColor = vec4(color, 1.0);
    return;
  }

  // Perceived brightness: the eye is most sensitive to green, least to blue.
  float brightness = dot(color, vec3(0.299, 0.587, 0.114));
  int level = min(int(brightness * float(u_rampLength)), u_rampLength - 1);

  if (u_renderMode == 1) {
    outColor = vec4(vec3(float(level) / float(u_rampLength - 1)), 1.0);
    return;
  }

  // Alpha holds the material (1-255) in 8 bits; material 1 is atlas row 0.
  int material = int(round(scene.a * 255.0));
  int row = material - 1;

  if (level > 0 && (u_animatedMaterials & (1 << material)) != 0) {
    level = clamp(level + int(round(wave(cell) * u_animationLevels)), 1, u_rampLength - 1);
    if (isShore(cell, material) && splashing(cell)) level = u_rampLength - 1;
  }

  int column = level;
  if ((u_scatterMaterials & (1 << material)) != 0) {
    // Too dark: empty, like level 0 of a ramp. Otherwise the scatter value picks the glyph, not the brightness.
    if (level == 0) {
      outColor = vec4(u_background, 1.0);
      return;
    }
    column = min(int(texelFetch(u_scatter, cell, 0).r * float(u_rampLength)), u_rampLength - 1);
  }
  if (level >= EDGE_MIN_LEVEL && (u_edgeMaterials & (1 << material)) != 0) {
    vec4 normal = normalAt(cell);
    bool left = edgeTowards(cell, normal, ivec2(-1, 0));
    bool right = edgeTowards(cell, normal, ivec2(1, 0));
    // Edge glyphs follow the ramp: dim, left, right. A face one cell wide is both, so it gets the dim one.
    if (left || right) column = u_rampLength + (level < EDGE_BRIGHT_LEVEL || left == right ? 0 : left ? 1 : 2);
  }

  // Edge glyphs win: they live in the material's own row.
  if (level > 0 && column < u_rampLength && (u_strokeMaterials & (1 << material)) != 0) {
    int direction = strokeDirection(cell);
    if (direction >= 0) row = u_strokeRow + direction;
  }

  // Atlas rows run top-down, screen rows bottom-up, hence the flipped y.
  ivec2 inCell = ivec2(gl_FragCoord.xy) - cell * u_cellSize;
  ivec2 atlasPixel = ivec2(
    column * u_cellSize.x + inCell.x,
    row * u_cellSize.y + u_cellSize.y - 1 - inCell.y
  );
  float glyph = texelFetch(u_glyphs, atlasPixel, 0).r;

  vec3 hue = color / max(max(color.r, color.g), max(color.b, 0.001));
  outColor = vec4(mix(u_background, mix(hue, color, u_glyphShade), glyph), 1.0);
}
