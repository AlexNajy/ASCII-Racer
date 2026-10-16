// Shared by the world glyph shaders, inserted at their `// @glyph-ink` line.
// The world atlas holds a signed distance field in red (0.5 on the glyph's outline, higher inside) and plain ink
// coverage in green. Up close the outline is cut sharp from the distance field at any size; once a glyph is only a
// few pixels big, the mipmapped coverage takes over, since distances don't average into the right brightness.
uniform float u_sdfSpread; // texels from the outline to where the distance field reaches 0 or 1

float glyphInk(vec4 texel, float texelsPerPixel) {
  float edge = texelsPerPixel / (2.0 * u_sdfSpread); // one pixel, in distance field units
  float sharp = smoothstep(0.5 - edge, 0.5 + edge, texel.r);
  return mix(sharp, texel.g, smoothstep(0.25, 0.5, edge));
}
