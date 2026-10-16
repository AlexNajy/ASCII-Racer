#version 300 es

// World glyphs prototype: one character standing in space. Each sprite is a quad of 6 vertices sharing everything
// but the corner.
in vec3 a_centre;
in vec2 a_corner; // -1 or 1 on each axis
in vec2 a_size; // m, width and height
in vec2 a_glyph; // atlas column and row
in vec3 a_color;
in float a_emission;
in float a_id; // -1 for nothing special; 0 and up for traffic signal lamps, as in triangle.vert.glsl
in vec3 a_right; // the glyph's right and up in the world; right (0, 0, 0) turns the glyph to face the camera
in vec3 a_up;
in float a_twoSided; // 1: also seen from behind (mirrored), 0: hidden from behind

uniform mat4 u_modelView;
uniform mat4 u_projection;
uniform vec3 u_cameraPosition;
uniform vec2 u_atlasGrid;
uniform highp usampler2D u_signals;

out vec2 v_uv;
out vec3 v_color;
out float v_emission;
out vec3 v_worldPosition;
out vec3 v_viewPosition;
out vec3 v_normal;

const float UNLIT = 0.2; // brightness of a lamp that is off

void hide() {
  // Behind the far plane, clipped away.
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}

void main() {
  v_color = a_color;
  v_emission = a_emission;

  // Signal lamps: id = junction * 10 + road * 5 + lamp, as built in trafficLight.ts.
  if (a_id >= 0.0) {
    int id = int(a_id);
    int road = (id / 5) % 2;
    int lamp = id % 5;
    uvec4 signals = texelFetch(u_signals, ivec2(id / 10, 0), 0);
    uint shown = lamp < 3 ? (road == 0 ? signals.r : signals.g) : (road == 0 ? signals.b : signals.a) + 3u;
    bool on = shown == uint(lamp);
    if (!on && lamp >= 3) {
      hide();
      return;
    }
    if (!on) {
      v_color *= UNLIT;
      v_emission = 0.0;
    }
  }

  vec3 right = a_right;
  vec3 up = a_up;
  vec3 toCamera = u_cameraPosition - a_centre;
  if (dot(right, right) == 0.0) {
    // Upright and turned towards the camera around the vertical.
    vec3 level = vec3(toCamera.x, 0.0, toCamera.z);
    vec3 forward = dot(level, level) > 1e-6 ? normalize(level) : vec3(0.0, 0.0, 1.0);
    right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    up = vec3(0.0, 1.0, 0.0);
  }
  v_normal = cross(right, up);
  if (a_twoSided < 0.5 && dot(v_normal, toCamera) < 0.0) {
    hide();
    return;
  }

  vec3 position = a_centre + right * (a_corner.x * a_size.x / 2.0) + up * (a_corner.y * a_size.y / 2.0);
  // Atlas rows run top-down.
  v_uv = (a_glyph + vec2(a_corner.x, -a_corner.y) * 0.5 + 0.5) / u_atlasGrid;
  v_worldPosition = position;
  vec4 viewPosition = u_modelView * vec4(position, 1.0);
  v_viewPosition = viewPosition.xyz;
  gl_Position = u_projection * viewPosition;
}
