#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform ivec2 u_cellSize;

out vec4 outColor;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy) / u_cellSize;
  outColor = texelFetch(u_scene, cell, 0);
}
