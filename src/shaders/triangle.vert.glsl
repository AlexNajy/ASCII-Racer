#version 300 es

in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;
in float a_emission;
in float a_id; // -1 for nothing special; 0 and up for traffic signal lamps

uniform mat4 u_modelView;
uniform mat4 u_projection;
// One texel per junction: r = column road light, g = row road light (0 red, 1 yellow, 2 green).
uniform highp usampler2D u_signals;

out vec3 v_color;
out vec3 v_viewPosition;
out vec3 v_normal;
out float v_emission;

const uint GREEN = 2u;
const float UNLIT = 0.2; // brightness of a lamp that is off

void main() {
  v_color = a_color;
  v_normal = a_normal;
  v_emission = a_emission;

  // Signal lamps: id = junction * 10 + road * 5 + lamp, as built in trafficLight.ts.
  if (a_id >= 0.0) {
    int id = int(a_id);
    int road = (id / 5) % 2;
    int lamp = id % 5;
    uvec2 lights = texelFetch(u_signals, ivec2(id / 10, 0), 0).rg;
    uint light = road == 0 ? lights.r : lights.g;
    // Lamps 0-2 match the light codes. 3 (walking person) is on while the road alongside has green, 4 (hand)
    // the rest of the time.
    bool on = lamp < 3 ? light == uint(lamp) : (lamp == 3) == (light == GREEN);
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
}
