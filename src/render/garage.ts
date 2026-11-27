import { TICKS_PER_SECOND } from '../game/clock.ts';
import { normalize, type Vec3 } from '../math/mat4.ts';
import type { Camera } from './camera.ts';
import { MATERIAL } from './materials.ts';
import { flatDisc, flatRing, withMaterial } from './shapes.ts';

// The garage's own small scene, drawn instead of the city: the car turning on a pool of light in the dark,
// seen from a fixed camera. Rendering only; nothing here touches the world.

export const GARAGE_TURN_TICKS = 16 * TICKS_PER_SECOND; // one full turn
const CAMERA_DISTANCE = 5.6; // m from the car's centre, along the ground
const CAMERA_HEIGHT = 2.8; // m
const LOOK_AT_HEIGHT = 0.55; // m, a little under the car's middle so it sits above the panel
// The floor is bright out to SPOT_INNER_RADIUS, round the car, then fades to the dark at SPOT_RADIUS.
const SPOT_INNER_RADIUS = 2.6; // m
const SPOT_RADIUS = 4.6; // m
const SPOT_SIDES = 48;
const SPOT_CENTRE: Vec3 = [0.74, 0.68, 0.57]; // the floor straight under the light
const SPOT_INNER: Vec3 = [0.57, 0.52, 0.44];
const SPOT_RIM: Vec3 = [0, 0, 0];
const SPOT_GLOW = 1;
// The light over the spot, used instead of the moonlight: high up and on the camera's side, so the faces the camera
// sees are lit.
export const GARAGE_LIGHT_DIRECTION: Vec3 = normalize([0.4, 1, 0.8]);
export const GARAGE_AMBIENT = 0.55;
export const GARAGE_LIGHT_INTENSITY = 0.6;

// The car stands at the origin, the camera looks at it from the south, slightly above.
export const GARAGE_CAMERA: Readonly<Camera> = {
  position: [0, CAMERA_HEIGHT, CAMERA_DISTANCE],
  yaw: 0,
  pitch: -Math.atan2(CAMERA_HEIGHT - LOOK_AT_HEIGHT, CAMERA_DISTANCE),
};

// The car's heading at a (fractional) tick: one slow turn every GARAGE_TURN_TICKS, to the left.
export function garageHeading(tick: number): number {
  return (2 * Math.PI * (tick % GARAGE_TURN_TICKS)) / GARAGE_TURN_TICKS;
}

// The lit spot: a disc on the ground that glows brightest in the middle and fades out to its rim.
export function garageFloorVertices(): number[] {
  const middle = flatDisc([0, 0, 0], SPOT_INNER_RADIUS, SPOT_SIDES, SPOT_CENTRE, SPOT_GLOW, SPOT_INNER);
  const fade = flatRing([0, 0, 0], SPOT_INNER_RADIUS, SPOT_RADIUS, SPOT_SIDES, SPOT_INNER, SPOT_RIM, SPOT_GLOW);
  return withMaterial([...middle, ...fade], MATERIAL.garageFloor);
}
