#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_viewPosition;

uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;

out vec4 outColor;

void main() {
  // The camera is at the origin of view space, so this is the true distance, giving a circle of fog.
  // Positions interpolate correctly across a triangle; distances don't, so the length is taken here.
  float distance = length(v_viewPosition);
  // Clear up to u_fogStart, then a straight fade to the fog colour at u_fogEnd.
  // max() avoids dividing by zero when the start is at or past the end.
  float fog = clamp((distance - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
  outColor = vec4(mix(v_color, u_fogColor, fog), 1.0);
}
