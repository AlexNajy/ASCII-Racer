import { createRandom } from '../math/random.ts';
import type { Vec3 } from '../math/mat4.ts';

// Visual only: stepped with the frame time, not the simulation tick, so they don't need to be deterministic.
export const MAX_PARTICLES = 2000;
export const FLOATS_PER_PARTICLE = 7; // x, y, z, r, g, b, material

const GRAVITY = 9.8; // m/s²
const GROUND_BOUNCE = 0.3; // share of the downward speed kept on hitting the ground
const GROUND_FRICTION = 0.6; // share of the sideways speed kept on hitting the ground
const UPWARD_KICK = 0.5; // share of a burst's speed added upwards at most, so bursts arc instead of skimming

// What a burst throws: crash debris, drift sparks...
export interface ParticleKind {
  color: Vec3;
  material: number;
  life: number; // s, on average
  spread: number; // 0 = all along the burst's direction, 1 = as much sideways as forwards
  gravity: number; // share of real gravity; negative rises
  drag: number; // share of the speed lost per second, 0 to 1
}

interface Particle {
  kind: ParticleKind;
  position: Vec3;
  velocity: Vec3;
  age: number; // s
  life: number; // s, removed at this age
}

export interface Particles {
  list: Particle[];
  vertices: Float32Array;
  random: () => number;
}

export function createParticles(): Particles {
  return { list: [], vertices: new Float32Array(MAX_PARTICLES * FLOATS_PER_PARTICLE), random: createRandom(1) };
}

// `count` particles flying out of `position` along `direction` (unit length) at up to `speed` m/s, scattered by the
// kind's spread, with a kick upwards.
export function burst(particles: Particles, kind: ParticleKind, position: Vec3, direction: Vec3, count: number, speed: number) {
  const { random } = particles;
  const jitter = () => (2 * random() - 1) * kind.spread;
  for (let i = 0; i < count && particles.list.length < MAX_PARTICLES; i++) {
    const v = speed * (0.3 + 0.7 * random());
    particles.list.push({
      position: [...position],
      velocity: [
        v * (direction[0] + jitter()),
        v * (direction[1] + jitter()) + speed * UPWARD_KICK * random(),
        v * (direction[2] + jitter()),
      ],
      kind,
      age: 0,
      life: kind.life * (0.5 + random()),
    });
  }
}

export function updateParticles(particles: Particles, dt: number) {
  const { list } = particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) {
      // Swap with the last one and drop it: order doesn't matter, and nothing shifts.
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    p.velocity[1] -= p.kind.gravity * GRAVITY * dt;
    const keep = Math.max(0, 1 - p.kind.drag * dt);
    for (let axis = 0; axis < 3; axis++) {
      p.velocity[axis] *= keep;
      p.position[axis] += p.velocity[axis] * dt;
    }
    if (p.position[1] < 0) {
      p.position[1] = 0;
      p.velocity[1] *= -GROUND_BOUNCE;
      p.velocity[0] *= GROUND_FRICTION;
      p.velocity[2] *= GROUND_FRICTION;
    }
  }
}

// Fills the vertex array and returns how many particles are in it. Each fades as it ages, so its glyph
// walks down the ramp.
export function particleVertices(particles: Particles): number {
  const { list, vertices } = particles;
  list.forEach((p, i) => {
    const fade = 1 - p.age / p.life;
    const [r, g, b] = p.kind.color;
    vertices.set([...p.position, r * fade, g * fade, b * fade, p.kind.material], i * FLOATS_PER_PARTICLE);
  });
  return list.length;
}
