#version 300 es
precision highp float;

in vec3 v_color;

uniform float u_material;

#ifdef WORLD_GLYPHS
// Each star is a glyph from the star ramp, picked by brightness, on a square point sprite.
uniform sampler2D u_glyphs;
uniform vec2 u_atlasGrid;
uniform int u_rampLength;

layout(location = 0) out vec4 outColor;

const float CELL_ASPECT = 1.75;

void main() {
  float brightness = dot(v_color, vec3(0.299, 0.587, 0.114));
  int level = clamp(int(brightness * float(u_rampLength)), 1, u_rampLength - 1);
  // The sprite is square and the glyph narrower, so x is stretched around the centre.
  vec2 inside = vec2((gl_PointCoord.x - 0.5) * CELL_ASPECT + 0.5, gl_PointCoord.y);
  if (inside.x < 0.0 || inside.x > 1.0) discard;
  float glyph = texture(u_glyphs, (vec2(level, u_material - 1.0) + inside) / u_atlasGrid).r;
  if (glyph == 0.0) discard;
  outColor = vec4(v_color * glyph, 1.0);
}
#else
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;

void main() {
  outColor = vec4(v_color, u_material / 255.0);
  // No surface: a zero normal, as far away as possible.
  outNormal = vec4(0.5, 0.5, 0.5, 1.0);
  outScatter = vec4(0.0);
}
#endif
