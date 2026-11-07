#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_viewPosition;
in vec3 v_worldPosition;
in vec3 v_normal;
in float v_emission;
flat in float v_material;
in vec2 v_facadeUv;
flat in vec2 v_facade;

uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;
uniform bool u_showNormals;
uniform vec3 u_lightDirection; // towards the light, unit length
uniform float u_ambient;
uniform float u_lightIntensity;
// World space, like the normals.
uniform vec3 u_headlightPosition;
uniform vec3 u_headlightDirection; // unit length
uniform float u_headlightOuterCos; // cosine of the cone's half-angle: no light outside it
uniform float u_headlightInnerCos; // full light inside this
uniform float u_headlightRange; // m, the light fades to nothing here
uniform float u_headlightIntensity;
uniform int u_scatterMaterials; // bit n set: material n picks its glyph from the scatter value
// Per material number: square size (m), patch size (m), patchiness (0 = squares only, 1 = patches only).
uniform vec3 u_scatterParams[32];
// Per facade style: window width and height (shares of a bay and a row), share of windows lit, bays lit together.
uniform vec4 u_windowStyles[16];
uniform float u_windowLitMaterial;
uniform float u_windowDarkMaterial;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;

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

// Further than this many bays or rows per cell, a window is too small to have a wall around it.
const float SOLID_WINDOW_FOOTPRINT = 0.34;
// Further than this, windows group into squares of 2, 4, 8... so each group covers at least a cell.
const float GROUP_FOOTPRINT = 0.7;
const vec3 GLASS_COLOR = vec3(0.3, 0.36, 0.44);
// Share of the fog that things that glow shine through, so the far skyline keeps its lights.
const float GLOW_THROUGH_FOG = 0.6;
const vec3 WINDOW_TINTS[4] = vec3[4](
  vec3(1.0, 0.82, 0.5),  // warm bulb
  vec3(1.0, 0.68, 0.32), // amber
  vec3(0.95, 0.93, 0.8), // cool white
  vec3(0.55, 0.75, 1.0)  // a television
);

struct Surface {
  vec3 color;
  float emission;
  float material;
};

// What the facade shows here: the wall, dark glass, or a lit window. Works on what a cell can show: a window keeps the
// wall around it only up close, and further away each axis gives up detail on its own, so a street seen at a
// shallow angle keeps its rows of windows.
Surface facade() {
  Surface wall = Surface(v_color, v_emission, v_material);
  vec4 style = u_windowStyles[int(v_facade.y)];
  uint seed = uint(v_facade.x);
  vec2 footprint = fwidth(v_facadeUv);
  vec2 group = max(vec2(1.0), pow(vec2(2.0), ceil(log2(max(footprint / GROUP_FOOTPRINT, vec2(0.001))))));
  bvec2 solid = greaterThan(footprint, vec2(SOLID_WINDOW_FOOTPRINT));
  vec2 offCentre = abs(fract(v_facadeUv) - 0.5);
  if ((!solid.x && offCentre.x > style.x / 2.0) || (!solid.y && offCentre.y > style.y / 2.0)) return wall;

  vec2 cell = floor(v_facadeUv / group);
  ivec2 unit = ivec2(floor(cell.x / max(style.w, 1.0)), cell.y);
  if (hash(unit, seed) < style.z) {
    float choice = hash(ivec2(cell), seed + 1u);
    float strength = 0.65 + 0.35 * hash(ivec2(cell), seed + 2u);
    return Surface(WINDOW_TINTS[int(choice * choice * 3.99)] * strength, 1.0, u_windowLitMaterial);
  }
  // Dark glass only reads as glass with the wall around it.
  if (solid.x && solid.y) return wall;
  return Surface(GLASS_COLOR, 0.0, u_windowDarkMaterial);
}

void main() {
  vec3 normal = normalize(v_normal);
  // The camera is at the origin of view space, so this is the true distance, giving a circle of fog.
  // Positions interpolate correctly across a triangle; distances don't, so the length is taken here.
  float distance = length(v_viewPosition);
  // Alpha holds the distance for the ASCII pass's edges. Square root, so its 8 bits are finer up close.
  outNormal = vec4(normal * 0.5 + 0.5, sqrt(clamp(distance / u_fogEnd, 0.0, 1.0)));
  bool scattered = (u_scatterMaterials & (1 << int(v_material))) != 0;
  outScatter = vec4(scattered ? scatter(normal) : 0.0, 0.0, 0.0, 0.0);

  // Debug view: normals run from -1 to 1, colours from 0 to 1, so each axis is remapped.
  if (u_showNormals) {
    outColor = vec4(normal * 0.5 + 0.5, v_material / 255.0);
    return;
  }

  Surface surface = Surface(v_color, v_emission, v_material);
  if (v_facade.y > 0.0) surface = facade();

  // Diffuse: a surface gets the most light facing it head-on, none when edge-on or facing away.
  // Ambient lights every face equally, so faces turned away from the light aren't fully black.
  float diffuse = max(dot(normal, u_lightDirection), 0.0);

  // Headlight: inside the cone, fading with distance, brightest on surfaces facing it.
  vec3 toSurface = v_worldPosition - u_headlightPosition;
  float lightDistance = length(toSurface);
  vec3 lightRay = toSurface / max(lightDistance, 0.001);
  float cone = smoothstep(u_headlightOuterCos, u_headlightInnerCos, dot(lightRay, u_headlightDirection));
  float reach = clamp(1.0 - lightDistance / u_headlightRange, 0.0, 1.0);
  float facing = max(dot(normal, -lightRay), 0.0);
  float headlight = u_headlightIntensity * cone * reach * reach * facing;

  vec3 lit = surface.color * (u_ambient + u_lightIntensity * diffuse + headlight);
  lit = mix(lit, surface.color, surface.emission);

  // Clear up to u_fogStart, then a straight fade to the fog colour at u_fogEnd.
  // max() avoids dividing by zero when the start is at or past the end.
  float fog = clamp((distance - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
  // Alpha holds the material: 8 bits, so the ASCII pass reads it back as round(a * 255).
  outColor = vec4(mix(lit, u_fogColor, fog * (1.0 - GLOW_THROUGH_FOG * surface.emission)), surface.material / 255.0);
}
