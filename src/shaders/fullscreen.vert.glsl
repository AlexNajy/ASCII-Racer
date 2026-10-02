#version 300 es

// Corners (-1,-1), (3,-1), (-1,3): one triangle that covers the whole screen.
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
