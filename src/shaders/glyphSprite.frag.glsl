#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_color;
in float v_emission;
in vec3 v_worldPosition;
in vec3 v_viewPosition;
in vec3 v_normal;

uniform sampler2D u_glyphs;
uniform vec2 u_atlasSize; // texels

layout(location = 0) out vec4 outColor;

// @lighting
// @glyph-ink

// Pixels with less ink than this are left out, so only the character itself is drawn and hides what's behind it.
const float MIN_INK = 0.05;

void main() {
  vec2 texels = v_uv * u_atlasSize;
  float texelsPerPixel = sqrt(length(dFdx(texels)) * length(dFdy(texels)));
  float ink = glyphInk(texture(u_glyphs, v_uv), texelsPerPixel);
  if (ink < MIN_INK) discard;
  // A two-sided glyph seen from behind is lit on its back.
  vec3 normal = normalize(gl_FrontFacing ? v_normal : -v_normal);
  vec3 lit = light(v_color, v_emission, v_worldPosition, normal);
  outColor = vec4(mix(lit * ink, u_fogColor, fogAt(length(v_viewPosition))), 1.0);
}
