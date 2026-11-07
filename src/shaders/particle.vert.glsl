#version 300 es

in vec3 a_position;
in vec3 a_color;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 v_color;
out vec3 v_viewPosition;

void main() {
  v_color = a_color;
  vec4 viewPosition = u_view * vec4(a_position, 1.0);
  v_viewPosition = viewPosition.xyz;
  gl_Position = u_projection * viewPosition;
  // One scene pixel, so each particle is exactly one glyph.
  gl_PointSize = 1.0;
}
