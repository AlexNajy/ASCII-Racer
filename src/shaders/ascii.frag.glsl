#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_normals;
uniform sampler2D u_glyphs;
uniform ivec2 u_cellSize;
uniform int u_rampLength;
uniform vec3 u_background;
uniform int u_renderMode; // 0 glyphs, 1 brightness, 2 scene, 5 normal texture, 6 CRT scene

out vec4 outColor;

// Neighbouring faces whose normals are further apart than this (about 25°) form an edge.
const float EDGE_THRESHOLD = 0.9;

vec4 normalAt(ivec2 cell) {
  ivec2 last = textureSize(u_normals, 0) - 1;
  return texelFetch(u_normals, clamp(cell, ivec2(0), last), 0);
}

bool facesDiffer(vec4 a, vec4 b) {
  return dot(a.rgb * 2.0 - 1.0, b.rgb * 2.0 - 1.0) < EDGE_THRESHOLD;
}

// Both cells at an edge count, so it still shows when one side is black (e.g. the road).
bool isEdge(ivec2 cell, vec4 normal) {
  const ivec2 neighbours[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  for (int i = 0; i < 4; i++) {
    vec4 neighbour = normalAt(cell + neighbours[i]);
    // An empty neighbour is a silhouette.
    if (neighbour.a == 0.0 || facesDiffer(normal, neighbour)) return true;
  }
  return false;
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

  // Atlas rows run top-down, screen rows bottom-up, hence the flipped y.
  ivec2 inCell = ivec2(gl_FragCoord.xy) - cell * u_cellSize;
  ivec2 atlasPixel = ivec2(
    level * u_cellSize.x + inCell.x,
    u_cellSize.y - 1 - inCell.y
  );
  float glyph = texelFetch(u_glyphs, atlasPixel, 0).r;

  outColor = vec4(mix(u_background, color, glyph), 1.0);
}
