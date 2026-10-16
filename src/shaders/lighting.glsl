// Shared by the scene shader and the glyph sprite shader, inserted at their `// @lighting` line.
uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;
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

vec3 light(vec3 color, float emission, vec3 position, vec3 normal) {
  // Diffuse: a surface gets the most light facing it head-on, none when edge-on or facing away.
  // Ambient lights every face equally, so faces turned away from the light aren't fully black.
  float diffuse = max(dot(normal, u_lightDirection), 0.0);

  // Headlight: inside the cone, fading with distance, brightest on surfaces facing it.
  vec3 toSurface = position - u_headlightPosition;
  float lightDistance = length(toSurface);
  vec3 lightRay = toSurface / max(lightDistance, 0.001);
  float cone = smoothstep(u_headlightOuterCos, u_headlightInnerCos, dot(lightRay, u_headlightDirection));
  float reach = clamp(1.0 - lightDistance / u_headlightRange, 0.0, 1.0);
  float facing = max(dot(normal, -lightRay), 0.0);
  float headlight = u_headlightIntensity * cone * reach * reach * facing;

  vec3 lit = color * (u_ambient + u_lightIntensity * diffuse + headlight);
  return mix(lit, color, emission);
}

// Clear up to u_fogStart, then a straight fade to the fog colour at u_fogEnd.
// max() avoids dividing by zero when the start is at or past the end.
float fogAt(float distance) {
  return clamp((distance - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
}
