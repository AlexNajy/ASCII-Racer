#version 300 es
precision highp float;

in vec3 v_color;

uniform float u_material;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;

void main() {
  outColor = vec4(v_color, u_material / 255.0);
  // No surface: a zero normal, as far away as possible.
  outNormal = vec4(0.5, 0.5, 0.5, 1.0);
  outScatter = vec4(0.0);
}
