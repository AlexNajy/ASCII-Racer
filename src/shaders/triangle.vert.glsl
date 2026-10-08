#version 300 es

in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;

uniform mat4 u_modelView;
uniform mat4 u_projection;

out vec3 v_color;
out vec3 v_viewPosition;
out vec3 v_normal;

void main() {
  v_color = a_color;
  v_normal = a_normal;
  vec4 viewPosition = u_modelView * vec4(a_position, 1.0);
  gl_Position = u_projection * viewPosition;
  v_viewPosition = viewPosition.xyz;
}
