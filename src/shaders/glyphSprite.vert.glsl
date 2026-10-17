#version 300 es

// World glyphs prototype: one character standing in space. Each sprite is a quad of 6 vertices sharing everything
// but the corner.
in vec3 a_centre;
in vec2 a_corner; // -1 or 1 on each axis
in vec2 a_size; // m, width and height of the whole sprite
in vec2 a_repeat; // copies of the glyph across and up
in vec2 a_glyph; // atlas column and row
in vec3 a_color;
in float a_emission;
in float a_id; // -1 for nothing special; 0 and up for traffic signal lamps, as in triangle.vert.glsl
in vec3 a_right; // the glyph's right and up in the world; right (0, 0, 0) turns the glyph to face the camera
in vec3 a_up;
in float a_twoSided; // 1: also seen from behind (mirrored), 0: hidden from behind

uniform mat4 u_model; // the car's sprites move with the car; identity for the city
uniform mat4 u_modelView; // the view only: positions are made world positions first
uniform mat4 u_projection;
uniform vec3 u_cameraPosition;
uniform highp usampler2D u_signals;

out vec2 v_glyphPosition; // 0 to repeat across and up the sprite, one unit per glyph
flat out vec2 v_glyph;
out vec3 v_color;
out float v_emission;
out vec3 v_worldPosition;
out vec3 v_viewPosition;
out vec3 v_normal;

const float UNLIT = 0.2; // brightness of a lamp that is off
// Glyphs turned towards the camera move this far towards it, so a | on a building's corner isn't half inside it.
const float TURNED_LIFT = 0.15; // m

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

  mat3 rotation = mat3(u_model);
  vec3 centre = (u_model * vec4(a_centre, 1.0)).xyz;
  vec3 right = rotation * a_right;
  vec3 up = rotation * a_up;
  vec3 toCamera = u_cameraPosition - centre;
  if (dot(right, right) == 0.0) {
    // Upright and turned towards the camera around the vertical.
    vec3 level = vec3(toCamera.x, 0.0, toCamera.z);
    vec3 forward = dot(level, level) > 1e-6 ? normalize(level) : vec3(0.0, 0.0, 1.0);
    right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    up = vec3(0.0, 1.0, 0.0);
    centre += forward * TURNED_LIFT;
  }
  v_normal = cross(right, up);
  if (a_twoSided < 0.5 && dot(v_normal, toCamera) < 0.0) {
    hide();
    return;
  }

  vec3 position = centre + right * (a_corner.x * a_size.x / 2.0) + up * (a_corner.y * a_size.y / 2.0);
  v_glyphPosition = (a_corner * 0.5 + 0.5) * a_repeat;
  v_glyph = a_glyph;
  v_worldPosition = position;
  vec4 viewPosition = u_modelView * vec4(position, 1.0);
  v_viewPosition = viewPosition.xyz;
  gl_Position = u_projection * viewPosition;
}
