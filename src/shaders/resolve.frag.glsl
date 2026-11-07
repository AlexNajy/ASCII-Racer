#version 300 es
precision highp float;

// The scene is drawn with u_supersample × u_supersample samples per cell. This pass turns each cell's samples into
// the one value per cell the ASCII pass reads, so a thin pole or a far line covers part of a cell instead of
// popping in and out as one sample lands on it or misses.
uniform sampler2D u_scene;
uniform sampler2D u_normals;
uniform sampler2D u_scatter;
uniform int u_supersample;
// 0: a partly covered cell keeps the full brightness of what covers it; 1: it dims by the share covered.
uniform float u_coverageDimming;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outScatter;

const int MAX_SAMPLES = 16; // 4 × 4

void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * u_supersample;
  int count = u_supersample * u_supersample;
  vec4 samples[MAX_SAMPLES];
  int materials[MAX_SAMPLES];
  for (int i = 0; i < count; i++) {
    samples[i] = texelFetch(u_scene, base + ivec2(i % u_supersample, i / u_supersample), 0);
    materials[i] = int(round(samples[i].a * 255.0));
  }

  // The material covering most samples wins; on a tie, the one nearest the cell centre.
  vec2 centre = vec2(float(u_supersample - 1) / 2.0);
  int best = -1;
  int bestVotes = 0;
  float bestOffCentre = 1e9;
  vec3 sum = vec3(0.0);
  int covered = 0;
  for (int i = 0; i < count; i++) {
    if (materials[i] == 0) continue;
    covered++;
    sum += samples[i].rgb;
    int votes = 0;
    for (int j = 0; j < count; j++) votes += materials[j] == materials[i] ? 1 : 0;
    float offCentre = length(vec2(i % u_supersample, i / u_supersample) - centre);
    if (votes > bestVotes || (votes == bestVotes && offCentre < bestOffCentre)) {
      best = i;
      bestVotes = votes;
      bestOffCentre = offCentre;
    }
  }

  if (best < 0) {
    outColor = vec4(0.0);
    outNormal = vec4(0.5, 0.5, 0.5, 1.0);
    outScatter = vec4(0.0);
    return;
  }

  // Normal, distance and scatter can't be averaged meaningfully, so they come from the winning sample.
  ivec2 winner = base + ivec2(best % u_supersample, best / u_supersample);
  float coverage = float(covered) / float(count);
  vec3 color = sum / float(covered) * mix(1.0, coverage, u_coverageDimming);
  outColor = vec4(color, samples[best].a);
  outNormal = texelFetch(u_normals, winner, 0);
  outScatter = texelFetch(u_scatter, winner, 0);
}
