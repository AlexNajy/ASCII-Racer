#version 300 es
precision highp float;

in vec3 v_color;
in vec3 v_viewPosition;
flat in float v_material;

uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;

void main() {
  float distance = length(v_viewPosition);
  float fog = clamp((distance - u_fogStart) / max(u_fogEnd - u_fogStart, 0.001), 0.0, 1.0);
  outColor = vec4(mix(v_color, u_fogColor, fog), v_material / 255.0);
  // No surface, so a zero normal; the distance is real, so a particle in front of a wall doesn't give it an edge.
  outNormal = vec4(0.5, 0.5, 0.5, sqrt(clamp(distance / u_fogEnd, 0.0, 1.0)));
  outScatter = vec4(0.0);
}
