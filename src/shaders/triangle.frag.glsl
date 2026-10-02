#version 300 es
precision highp float;

in float v_shade;

uniform vec3 u_color;

out vec4 outColor;

void main() {
  outColor = vec4(u_color * v_shade, 1.0);
}
