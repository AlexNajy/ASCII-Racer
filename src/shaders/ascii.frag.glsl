#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform ivec2 u_cellSize;

out vec4 outColor;

const int RAMP_LENGTH = 10;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy) / u_cellSize;
  vec3 color = texelFetch(u_scene, cell, 0).rgb;

  // Perceived brightness: the eye is most sensitive to green, least to blue.
  float brightness = dot(color, vec3(0.299, 0.587, 0.114));
  int level = min(int(brightness * float(RAMP_LENGTH)), RAMP_LENGTH - 1);

  float grey = float(level) / float(RAMP_LENGTH - 1);
  outColor = vec4(vec3(grey), 1.0);
}
