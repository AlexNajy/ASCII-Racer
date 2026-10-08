#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_normals;
uniform sampler2D u_glyphs;
uniform ivec2 u_cellSize;
uniform int u_rampLength;
uniform vec3 u_background;
uniform int u_renderMode; // 0 glyphs, 1 brightness, 2 scene, 5 normal texture

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

void main() {
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

  // Full-strength hue; the glyph's density already shows how bright the cell is.
  vec3 tint = color / max(max(color.r, color.g), max(color.b, 0.001));
  outColor = vec4(mix(u_background, tint, glyph), 1.0);
}
