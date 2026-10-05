#version 300 es
precision highp float;

in vec3 v_color;
in float v_depth;

uniform vec3 u_fogColor;
uniform float u_fogDistance;

out vec4 outColor;

void main() {
  float fog = clamp(v_depth / u_fogDistance, 0.0, 1.0);
  outColor = vec4(mix(v_color, u_fogColor, fog), 1.0);
}
