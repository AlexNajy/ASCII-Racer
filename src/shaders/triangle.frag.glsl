#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_viewPosition;
in vec3 v_worldPosition;
in vec3 v_normal;
in float v_emission;
flat in float v_material;

uniform bool u_showNormals;
uniform int u_scatterMaterials; // bit n set: material n picks its glyph from the scatter value
// Per material number: square size (m), patch size (m), patchiness (0 = squares only, 1 = patches only).
uniform vec3 u_scatterParams[32];

#ifdef WORLD_GLYPHS
layout(location = 0) out vec4 outColor;
#else
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;
#endif

// A random number from 0 to 1 for a grid square (PCG 3D hash): the same square always gives the same number.
// The material is the third input, so each material gets its own pattern.
float hash(ivec2 square, uint material) {
  uvec3 v = uvec3(uvec2(square), material) * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float(v.x) / 4294967295.0;
}

// Random numbers at the grid corners, blended smoothly in between: soft blobs instead of hard squares.
float valueNoise(vec2 p, uint material) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float bottom = mix(hash(i, material), hash(i + ivec2(1, 0), material), f.x);
  float top = mix(hash(i + ivec2(0, 1), material), hash(i + ivec2(1, 1), material), f.x);
  return mix(bottom, top, f.y);
}

// The surface's own 2D coordinates: the two world axes it lies along (floors xz, walls xy or zy).
vec2 surfacePosition(vec3 position, vec3 normal) {
  vec3 a = abs(normal);
  if (a.y >= a.x && a.y >= a.z) return position.xz;
  return a.x >= a.z ? position.zy : position.xy;
}

// Fine random squares mixed with soft patches, so the variants clump like grass and stains do.
float scatter(vec3 normal) {
  int material = int(v_material);
  vec3 params = u_scatterParams[material];
  vec2 p = surfacePosition(v_worldPosition, normal);
  float fine = hash(ivec2(floor(p / params.x)), uint(material));
  float patches = valueNoise(p / params.y, uint(material));
  return mix(fine, patches, params.z);
}

// @lighting

#ifdef WORLD_GLYPHS
// @world-glyphs
#endif

void main() {
  vec3 normal = normalize(v_normal);
  // The camera is at the origin of view space, so this is the true distance, giving a circle of fog.
  // Positions interpolate correctly across a triangle; distances don't, so the length is taken here.
  float distance = length(v_viewPosition);
#ifdef WORLD_GLYPHS
  worldGlyphs(normal, distance);
  return;
#endif
#ifndef WORLD_GLYPHS
  // Alpha holds the distance for the ASCII pass's edges. Square root, so its 8 bits are finer up close.
  outNormal = vec4(normal * 0.5 + 0.5, sqrt(clamp(distance / u_fogEnd, 0.0, 1.0)));
  bool scattered = (u_scatterMaterials & (1 << int(v_material))) != 0;
  outScatter = vec4(scattered ? scatter(normal) : 0.0, 0.0, 0.0, 0.0);
#endif

  // Debug view: normals run from -1 to 1, colours from 0 to 1, so each axis is remapped.
  if (u_showNormals) {
    outColor = vec4(normal * 0.5 + 0.5, v_material / 255.0);
    return;
  }

  vec3 color = mix(light(v_color, v_emission, v_worldPosition, normal), u_fogColor, fogAt(distance));
#ifndef WORLD_GLYPHS
  // Alpha holds the material: 8 bits, so the ASCII pass reads it back as round(a * 255).
  outColor = vec4(color, v_material / 255.0);
#endif
}
