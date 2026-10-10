// Maths for the simulation that gives identical results in every browser. Math.sin, Math.cos, Math.atan2 and
// Math.hypot are only approximations whose last digits can differ; these use only + - * / and Math.sqrt,
// which IEEE 754 requires to be exactly rounded, so they can't.

const HALF_PI = Math.PI / 2;

// Taylor series, accurate to ~1e-16 for |x| ≤ π/4.
function sinNear0(x: number): number {
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - (x2 / 156) * (1 - x2 / 210)))))));
}

function cosNear0(x: number): number {
  const x2 = x * x;
  return 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - (x2 / 132) * (1 - (x2 / 182) * (1 - x2 / 240)))))));
}

// sin(x + quarterTurns · π/2). x is split into whole quarter turns plus a rest within π/4.
function sinShifted(x: number, quarterTurns: number): number {
  const turns = Math.round(x / HALF_PI);
  const rest = x - turns * HALF_PI;
  switch ((((turns + quarterTurns) % 4) + 4) % 4) {
    case 0:
      return sinNear0(rest);
    case 1:
      return cosNear0(rest);
    case 2:
      return -sinNear0(rest);
    default:
      return -cosNear0(rest);
  }
}

export function sin(x: number): number {
  return sinShifted(x, 0);
}

export function cos(x: number): number {
  return sinShifted(x, 1);
}

// atan for 0 ≤ t ≤ 1. Halving the angle 3 times (tan of half an angle is t / (1 + √(1 + t²))) brings t below 0.1,
// where the series is accurate to ~1e-16.
function atan01(t: number): number {
  for (let i = 0; i < 3; i++) t = t / (1 + Math.sqrt(1 + t * t));
  const t2 = t * t;
  return 8 * t * (1 + t2 * (-1 / 3 + t2 * (1 / 5 + t2 * (-1 / 7 + t2 * (1 / 9 + t2 * (-1 / 11 + t2 * (1 / 13)))))));
}

// Like Math.atan2, except 0 for (0, 0) and π (never -π) straight along -x.
export function atan2(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  let angle = ay <= ax ? atan01(ay / ax) : HALF_PI - atan01(ax / ay);
  if (x < 0) angle = Math.PI - angle;
  return y < 0 ? -angle : angle;
}

export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
