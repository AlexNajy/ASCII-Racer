#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform int u_scenePixelSize;

out vec4 outColor;

void main() {
  ivec2 scenePixel = ivec2(gl_FragCoord.xy) / u_scenePixelSize;
  outColor = texelFetch(u_scene, scenePixel, 0);
}
