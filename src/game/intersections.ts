import { CROSSWALK_LENGTH, type City, type CitySettings, type Junction, type Leg } from './city.ts';

// A traffic light pole on a junction corner. With no heads it is a short pole for crosswalk lights only.
export interface TrafficLight {
  x: number;
  z: number;
  armX: number; // the direction the arm reaches out over the road
  armZ: number;
  facingX: number; // the side the lamps point to, towards the traffic they control
  facingZ: number;
  heads: number[]; // distance of each signal head from the pole, along the arm; the arm ends at the furthest
  walkSignals: { facingX: number; facingZ: number }[]; // crosswalk lights, facing the people waiting across
}

export interface StopSign {
  x: number;
  z: number;
  facingX: number; // the side the red face points to, towards the traffic that has to stop
  facingZ: number;
}

export interface Intersections {
  trafficLights: TrafficLight[];
  stopSigns: StopSign[];
}

const CURB_DISTANCE = 1; // poles stand this far in from both curbs of their corner
const STOP_SIGN_GAP = 0.5; // between the crosswalk and the stop sign, along the road

// Unit steps from the junction centre out along each leg. North is -z.
const LEG_DIRECTIONS: Record<Leg, [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

// Traffic coming in on a leg drives towards the junction (minus the leg direction) and keeps right.
// Its right hand side, as a step: the leg direction turned a quarter.
function rightOf([dx, dz]: [number, number]): [number, number] {
  return [dz, -dx];
}

// Each corner is a pair of signs: -1 or 1 in x (west or east) and in z (north or south).
// Traffic lights stand on the far right corner of the leg they control, US style, so each of the 4 corners
// serves one leg. Stop signs stand on the near right corner, just before the crosswalk. Crosswalk lights go on the poles at both ends
// of each crosswalk, adding a short pole where a corner has no traffic light (T-junctions at the ring).
function junctionControls(
  junction: Junction,
  columnAvenue: boolean,
  rowAvenue: boolean,
  settings: CitySettings,
  result: Intersections,
): void {
  const halfColumn = (columnAvenue ? settings.avenueWidth : settings.roadWidth) / 2;
  const halfRow = (rowAvenue ? settings.avenueWidth : settings.roadWidth) / 2;
  const corner = (sx: number, sz: number) => ({
    x: junction.x + sx * (halfColumn + CURB_DISTANCE),
    z: junction.z + sz * (halfRow + CURB_DISTANCE),
  });
  const legs = Object.keys(LEG_DIRECTIONS) as Leg[];

  if (junction.control === 'allWayStop' || junction.control === 'twoWayStop') {
    for (const leg of legs) {
      if (!junction.stops[leg]) continue;
      const [dx, dz] = LEG_DIRECTIONS[leg];
      const [rx, rz] = rightOf([dx, dz]);
      // Moved back along the leg so it stands just before the crosswalk, where traffic stops.
      const { x, z } = corner(dx + rx, dz + rz);
      const back = CROSSWALK_LENGTH + STOP_SIGN_GAP - CURB_DISTANCE;
      result.stopSigns.push({ x: x + dx * back, z: z + dz * back, facingX: dx, facingZ: dz });
    }
    return;
  }
  if (junction.control !== 'lights') return;

  const poles = new Map<string, TrafficLight>();
  const poleAt = (sx: number, sz: number): TrafficLight => {
    const key = `${sx},${sz}`;
    let pole = poles.get(key);
    if (!pole) {
      pole = { ...corner(sx, sz), armX: 0, armZ: 0, facingX: 0, facingZ: 0, heads: [], walkSignals: [] };
      poles.set(key, pole);
    }
    return pole;
  };

  for (const leg of legs) {
    if (!junction.stops[leg]) continue;
    const [dx, dz] = LEG_DIRECTIONS[leg];
    const [rx, rz] = rightOf([dx, dz]);
    // Far right corner: one step on towards the far side (-d), one step right.
    const pole = poleAt(rx - dx, rz - dz);
    // Lanes run between the road's centre and its right hand curb. One head over each lane on an avenue,
    // one over the centre line on a street.
    const half = dx === 0 ? halfColumn : halfRow;
    const isAvenue = dx === 0 ? columnAvenue : rowAvenue;
    pole.armX = -rx;
    pole.armZ = -rz;
    pole.facingX = dx;
    pole.facingZ = dz;
    pole.heads = isAvenue
      ? [CURB_DISTANCE + half / 4, CURB_DISTANCE + (half * 3) / 4]
      : [CURB_DISTANCE + half];
  }

  for (const leg of legs) {
    if (!junction.crosswalks[leg]) continue;
    const [dx, dz] = LEG_DIRECTIONS[leg];
    // The crosswalk's two ends are the corners either side of the leg, each facing the other.
    for (const side of [-1, 1]) {
      const pole = dx === 0 ? poleAt(side, dz) : poleAt(dx, side);
      pole.walkSignals.push(dx === 0 ? { facingX: -side, facingZ: 0 } : { facingX: 0, facingZ: -side });
    }
  }
  result.trafficLights.push(...poles.values());
}

export function generateIntersections(city: City, settings: CitySettings): Intersections {
  const result: Intersections = { trafficLights: [], stopSigns: [] };
  for (const junction of city.junctions) {
    const { columns, rows } = city.avenues;
    junctionControls(junction, columns.has(junction.column), rows.has(junction.row), settings, result);
  }
  return result;
}
