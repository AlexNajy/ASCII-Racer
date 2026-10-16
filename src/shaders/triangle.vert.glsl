#version 300 es

in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;
in float a_emission;
in float a_id; // -1 for nothing special; 0 and up for traffic signal lamps
in float a_material; // 1-255, picks the glyph set
// World glyphs, building walls only: u and v in m from the face's bottom left, face width, building height.
in vec4 a_facade;
in float a_building; // building number + 1, 0 if not a building wall

uniform mat4 u_model;
uniform mat4 u_modelView;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;
// One texel per junction: r and g = column and row road lights (0 red, 1 yellow, 2 green),
// b and a = crosswalk lights alongside each road (0 walking person, 1 hand, 2 off).
uniform highp usampler2D u_signals;

out vec3 v_color;
out vec3 v_viewPosition;
out vec3 v_worldPosition;
out vec3 v_normal;
out float v_emission;
flat out float v_material;
out vec4 v_facade;
out float v_building;
out vec3 v_objectPosition;
out vec3 v_objectNormal;

const float UNLIT = 0.2; // brightness of a lamp that is off

void main() {
  v_color = a_color;
  v_normal = u_normalMatrix * a_normal;
  v_emission = a_emission;
  v_material = a_material;
  v_facade = a_facade;
  v_building = a_building;
  v_objectPosition = a_position;
  v_objectNormal = a_normal;

  // Signal lamps: id = junction * 10 + road * 5 + lamp, as built in trafficLight.ts.
  if (a_id >= 0.0) {
    int id = int(a_id);
    int road = (id / 5) % 2;
    int lamp = id % 5;
    uvec4 signals = texelFetch(u_signals, ivec2(id / 10, 0), 0);
    // Lamps 0-2 match the light codes, 3 and 4 (walking person, hand) the walk codes plus 3.
    uint shown = lamp < 3 ? (road == 0 ? signals.r : signals.g) : (road == 0 ? signals.b : signals.a) + 3u;
    bool on = shown == uint(lamp);
    if (!on && lamp >= 3) {
      // Walk symbols share one spot, so the one that is off disappears: behind the far plane, clipped away.
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    if (!on) {
      v_color *= UNLIT;
      v_emission = 0.0;
    }
  }

  vec4 viewPosition = u_modelView * vec4(a_position, 1.0);
  gl_Position = u_projection * viewPosition;
  v_viewPosition = viewPosition.xyz;
  v_worldPosition = (u_model * vec4(a_position, 1.0)).xyz;
}
