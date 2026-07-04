// Train view math (PLAN §5.3): collapse the group onto one dimension along the
// direction of travel, order riders front → back, and measure straight-line
// (haversine) gaps between neighbours. Pure functions — no Firebase, no React.

/** Gaps larger than this get highlighted (ties into the "too far" alert, M5). */
export const GAP_ALERT_METERS = 50;

/** Below this speed (m/s) a rider's heading is noise — GPS headings drift when stopped. */
const MIN_MOVING_SPEED = 1;

export type RiderPoint = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
};

export type Train = {
  /** Riders ordered front → back. */
  order: RiderPoint[];
  /** gaps[i] = straight-line meters between order[i] and order[i + 1]. */
  gaps: number[];
};

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Straight-line distance in meters between two coordinates. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Initial bearing (radians, clockwise from north) from one point to another. */
function bearingRad(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const p1 = toRad(from.lat);
  const p2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

/**
 * Group direction of travel as the circular mean of moving riders' headings.
 * Null when nobody is moving or headings largely cancel out (no coherent
 * direction — e.g. half the group pointing back at a turnaround).
 */
function movingBearing(riders: RiderPoint[]): number | null {
  let east = 0;
  let north = 0;
  let count = 0;
  for (const r of riders) {
    if ((r.speed ?? 0) < MIN_MOVING_SPEED) continue;
    if (r.heading == null || r.heading < 0) continue;
    east += Math.sin(toRad(r.heading));
    north += Math.cos(toRad(r.heading));
    count++;
  }
  if (count === 0) return null;
  if (Math.hypot(east, north) / count < 0.5) return null;
  return Math.atan2(east, north);
}

/**
 * Fallback axis when headings are unusable: the line from the rider farthest
 * from the leader toward the leader (leader assumed at the front). Null when
 * there's no meaningful spread to orient by.
 */
function fallbackBearing(riders: RiderPoint[], leaderId: string): number | null {
  if (riders.length < 2) return null;
  const front = riders.find((r) => r.id === leaderId) ?? riders[0];
  let back: RiderPoint | null = null;
  let backDist = 0;
  for (const r of riders) {
    if (r.id === front.id) continue;
    const d = haversineMeters(r, front);
    if (d >= backDist) {
      back = r;
      backDist = d;
    }
  }
  if (!back || backDist < 1) return null;
  return bearingRad(back, front);
}

/**
 * Build the train: project each rider onto the direction of travel to get a
 * 1-D position, sort front → back, and compute neighbour gaps. When no
 * direction can be determined (single rider / everyone stacked), the order is
 * leader-first and gaps are effectively zero anyway.
 */
export function buildTrain(riders: RiderPoint[], leaderId: string): Train {
  if (riders.length === 0) return { order: [], gaps: [] };

  const dir = movingBearing(riders) ?? fallbackBearing(riders, leaderId);

  let order: RiderPoint[];
  if (dir == null) {
    order = [...riders].sort((a, b) => {
      if (a.id === leaderId) return -1;
      if (b.id === leaderId) return 1;
      return a.id.localeCompare(b.id);
    });
  } else {
    // Equirectangular projection around the group centroid is plenty accurate
    // at group scale (< a few km); position = projection onto the travel axis.
    const lat0 = riders.reduce((s, r) => s + r.lat, 0) / riders.length;
    const lng0 = riders.reduce((s, r) => s + r.lng, 0) / riders.length;
    const cosLat0 = Math.cos(toRad(lat0));
    const along = new Map<string, number>();
    for (const r of riders) {
      const east = toRad(r.lng - lng0) * cosLat0 * EARTH_RADIUS_M;
      const north = toRad(r.lat - lat0) * EARTH_RADIUS_M;
      along.set(r.id, east * Math.sin(dir) + north * Math.cos(dir));
    }
    order = [...riders].sort((a, b) => along.get(b.id)! - along.get(a.id)!);
  }

  const gaps = order.slice(1).map((r, i) => haversineMeters(order[i], r));
  return { order, gaps };
}
