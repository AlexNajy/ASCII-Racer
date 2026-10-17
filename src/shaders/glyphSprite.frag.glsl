#version 300 es
precision highp float;

in vec2 v_glyphPosition;
flat in vec2 v_glyph;
in vec3 v_color;
in float v_emission;
in vec3 v_worldPosition;
in vec3 v_viewPosition;
in vec3 v_normal;

uniform sampler2D u_glyphs;
uniform vec2 u_atlasGrid; // atlas columns and rows
uniform vec2 u_cellTexels; // size of one atlas cell in texels

layout(location = 0) out vec4 outColor;

// @lighting
// @glyph-ink

// Pixels with less ink than this are left out, so only the character itself is drawn and hides what's behind it.
const float MIN_INK = 0.05;

void main() {
  // Gradients of the unbroken position, since fract() jumps between repeated glyphs. Atlas rows run top-down.
  vec2 dx = dFdx(v_glyphPosition);
  vec2 dy = dFdy(v_glyphPosition);
  vec2 inside = fract(v_glyphPosition);
  vec2 uv = (v_glyph + vec2(inside.x, 1.0 - inside.y)) / u_atlasGrid;
  vec2 scale = vec2(1.0, -1.0) / u_atlasGrid;
  float texelsPerPixel = sqrt(length(dx * u_cellTexels) * length(dy * u_cellTexels));
  float ink = glyphInk(textureGrad(u_glyphs, uv, dx * scale, dy * scale), texelsPerPixel);
  if (ink < MIN_INK) discard;
  // A two-sided glyph seen from behind is lit on its back.
  vec3 normal = normalize(gl_FrontFacing ? v_normal : -v_normal);
  vec3 lit = light(v_color, v_emission, v_worldPosition, normal);
  outColor = vec4(mix(lit * ink, u_fogColor, fogAt(length(v_viewPosition))), 1.0);
}
