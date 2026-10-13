#version 300 es

in vec3 a_direction;
in vec3 a_color;

// The view without the camera's position: stars are infinitely far away, so only turning moves them.
uniform mat4 u_viewRotation;
uniform mat4 u_projection;

out vec3 v_color;

void main() {
  v_color = a_color;
  gl_Position = u_projection * u_viewRotation * vec4(a_direction, 1.0);
  // One scene pixel, so each star is exactly one cell.
  gl_PointSize = 1.0;
}
