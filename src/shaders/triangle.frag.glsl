#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_viewPosition;
in vec3 v_worldPosition;
in vec3 v_normal;
in float v_emission;

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

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;

void main() {
  vec3 normal = normalize(v_normal);
  // Alpha 1 marks the cell as covered, like the colour texture.
  outNormal = vec4(normal * 0.5 + 0.5, 1.0);

  // Debug view: normals run from -1 to 1, colours from 0 to 1, so each axis is remapped.
  if (u_showNormals) {
    outColor = vec4(normal * 0.5 + 0.5, 1.0);
    return;
  }

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

  vec3 lit = v_color * (u_ambient + u_lightIntensity * diffuse + headlight);
  lit = mix(lit, v_color, v_emission);

  // The camera is at the origin of view space, so this is the true distance, giving a circle of fog.
  // Positions interpolate correctly across a triangle; distances don't, so the length is taken here.
  float distance = length(v_viewPosition);
  // Clear up to u_fogStart, then a straight fade to the fog colour at u_fogEnd.
  // max() avoids dividing by zero when the start is at or past the end.
  float fog = clamp((distance - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
  outColor = vec4(mix(lit, u_fogColor, fog), 1.0);
}
