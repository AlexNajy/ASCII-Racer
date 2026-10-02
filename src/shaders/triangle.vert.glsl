#version 300 es

in vec3 a_position;
in float a_shade;

uniform mat4 u_matrix;

out float v_shade;
out float v_depth;

void main() {
  v_shade = a_shade;
  gl_Position = u_matrix * vec4(a_position, 1.0);
  v_depth = gl_Position.w;
}
