#version 300 es

in vec3 a_direction;
in vec3 a_color;

// The view without the camera's position: stars are infinitely far away, so only turning moves them.
uniform mat4 u_viewRotation;
uniform mat4 u_projection;
uniform vec2 u_cells; // character cells across and up
uniform float u_pointSize; // samples per cell, so each point is exactly one glyph

out vec3 v_color;

// Moves a point to the middle of its character cell, so a point u_supersample samples wide fills exactly one cell.
vec4 snapToCell(vec4 clip) {
  vec2 cell = floor((clip.xy / clip.w * 0.5 + 0.5) * u_cells);
  return vec4(((cell + 0.5) / u_cells * 2.0 - 1.0) * clip.w, clip.zw);
}

void main() {
  v_color = a_color;
  gl_Position = snapToCell(u_projection * u_viewRotation * vec4(a_direction, 1.0));
  gl_PointSize = u_pointSize;
}
