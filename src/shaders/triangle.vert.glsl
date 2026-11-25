#version 300 es

in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;
in float a_emission;
in float a_id; // -1 for nothing special; 0 and up for traffic signal lamps; -10 and down for race gates
in float a_material; // 1-255, picks the glyph set
in vec2 a_facadeUv; // window bays across, rows up
in vec2 a_facade; // seed, style (0 = no windows)

uniform mat4 u_model;
uniform mat4 u_modelView;
uniform mat4 u_projection;
uniform mat3 u_normalMatrix;
// One texel per junction: r and g = column and row road lights (0 red, 1 yellow, 2 green),
// b and a = crosswalk lights alongside each road (0 walking person, 1 hand, 2 off).
uniform highp usampler2D u_signals;
uniform bool u_beaconOn;
uniform bool u_braking;
uniform int u_nextGate; // the race's next gate; gates before it are passed

out vec3 v_color;
out vec3 v_viewPosition;
out vec3 v_worldPosition;
out vec3 v_normal;
out float v_emission;
flat out float v_material;
out vec2 v_facadeUv;
flat out vec2 v_facade;

const float UNLIT = 0.2; // brightness of a lamp that is off
const float BEACON_ID = -2.0;
const float BRAKE_ID = -3.0;
const float TAIL_LIGHT_DIM = 0.75; // tail lights while not braking: still glowing, but dimmer
const float GATE_ID_BASE = -10.0; // gate ids count down from here, as built in gate.ts
const float UPCOMING_GATE_DIM = 0.35; // gates still to come: unlit, only lit by the moon and headlights

void main() {
  v_color = a_color;
  v_normal = u_normalMatrix * a_normal;
  v_emission = a_emission;
  v_material = a_material;
  v_facadeUv = a_facadeUv;
  v_facade = a_facade;

  if (a_id == BRAKE_ID && !u_braking) v_color *= TAIL_LIGHT_DIM;

  if (a_id == BEACON_ID && !u_beaconOn) {
    v_color *= UNLIT;
    v_emission = 0.0;
  }

  if (a_id <= GATE_ID_BASE) {
    int gate = int(GATE_ID_BASE - a_id + 0.5);
    if (gate < u_nextGate) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    if (gate > u_nextGate) {
      v_color *= UPCOMING_GATE_DIM;
      v_emission = 0.0;
    }
  }

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
