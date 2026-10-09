#version 300 es
precision highp float;

// Dev view: the finished glyph picture as an old TV would show it. Each screen pixel blends its neighbours,
// more sideways than up and down like a CRT beam, and every few rows are darker as scanlines.
uniform sampler2D u_image;

out vec4 outColor;

const vec2 SPREAD = vec2(3.0, 1.6); // blur size in screen pixels, x and y
const vec2 SAMPLE_STEP = vec2(1.5, 1.0); // pixels between samples, so a wide blur stays cheap
// Blurring averages thin glyph strokes with the black around them, so the picture gets darker. A curve brings
// it back: dark tones are lifted a lot, bright ones barely, and nothing clips hard at white.
const float EXPOSURE = 4.0;
const float SCANLINE_PIXELS = 3.0; // height of one scanline
const float SCANLINE_DARKNESS = 0.25;

void main() {
  vec2 pixel = gl_FragCoord.xy;
  ivec2 last = textureSize(u_image, 0) - 1;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int y = -3; y <= 3; y++) {
    for (int x = -4; x <= 4; x++) {
      vec2 offset = vec2(x, y) * SAMPLE_STEP;
      vec2 distance = offset / SPREAD;
      float weight = exp(-0.5 * dot(distance, distance));
      sum += weight * texelFetch(u_image, clamp(ivec2(pixel + offset), ivec2(0), last), 0).rgb;
      total += weight;
    }
  }
  float row = fract(gl_FragCoord.y / SCANLINE_PIXELS) - 0.5; // -0.5 to 0.5 across a scanline
  vec3 color = 1.0 - exp(-sum / total * EXPOSURE);
  outColor = vec4(color * (1.0 - SCANLINE_DARKNESS * smoothstep(0.2, 0.5, abs(row))), 1.0);
}
