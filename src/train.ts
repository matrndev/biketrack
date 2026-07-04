import type { Group, Role } from './groups';
import type { Presence } from './presence';

const EARTH_RADIUS_M = 6_371_000;

export const GAP_ALERT_THRESHOLD_M = 50;

export type TrainRider = {
  uid: string;
  name: string;
  role: Role;
  lat: number;
  lng: number;
  online: boolean;
  updatedAt?: number;
  battery?: number | null;
  speed?: number | null;
  projection: number;
};

export type TrainGap = {
  fromUid: string;
  toUid: string;
  meters: number;
  overThreshold: boolean;
};

export type TrainLayout = {
  riders: TrainRider[];
  gaps: TrainGap[];
  unlocated: Array<{ uid: string; name: string; role: Role; online: boolean }>;
};

type Located = {
  uid: string;
  name: string;
  role: Role;
  lat: number;
  lng: number;
  presence: Presence;
  x: number;
  y: number;
};

type Vec = { x: number; y: number };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalize(vec: Vec): Vec | null {
  const length = Math.hypot(vec.x, vec.y);
  if (length < 0.001) return null;
  return { x: vec.x / length, y: vec.y / length };
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function averageHeadingAxis(located: Located[]): Vec | null {
  const vectors = located
    .map((rider) => rider.presence.heading)
    .filter((heading): heading is number => isFiniteNumber(heading) && heading >= 0)
    .map((heading) => {
      const rad = (heading * Math.PI) / 180;
      return { x: Math.sin(rad), y: Math.cos(rad) };
    });

  if (!vectors.length) return null;
  return normalize(
    vectors.reduce((sum, vec) => ({ x: sum.x + vec.x, y: sum.y + vec.y }), {
      x: 0,
      y: 0,
    })
  );
}

function farthestPairAxis(located: Located[]): Vec | null {
  let best: { a: Located; b: Located; dist: number } | null = null;
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i];
      const b = located[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!best || dist > best.dist) best = { a, b, dist };
    }
  }
  if (!best) return null;
  return normalize({ x: best.a.x - best.b.x, y: best.a.y - best.b.y });
}

function trainAxis(group: Group, located: Located[]): Vec {
  const leader = located.find((rider) => rider.uid === group.meta.leaderId);
  if (leader) {
    const tail = located
      .filter((rider) => rider.uid !== leader.uid)
      .sort(
        (a, b) =>
          Math.hypot(b.x - leader.x, b.y - leader.y) -
          Math.hypot(a.x - leader.x, a.y - leader.y)
      )[0];
    if (tail) {
      const axis = normalize({ x: leader.x - tail.x, y: leader.y - tail.y });
      if (axis) return axis;
    }
  }

  return averageHeadingAxis(located) ?? farthestPairAxis(located) ?? { x: 0, y: 1 };
}

export function buildTrainLayout(
  group: Group,
  thresholdMeters = GAP_ALERT_THRESHOLD_M
): TrainLayout {
  const memberEntries = Object.entries(group.members);
  const origin = memberEntries
    .map(([uid]) => group.presence[uid])
    .find((presence) => isFiniteNumber(presence?.lat) && isFiniteNumber(presence?.lng));

  if (!origin || !isFiniteNumber(origin.lat) || !isFiniteNumber(origin.lng)) {
    return {
      riders: [],
      gaps: [],
      unlocated: memberEntries.map(([uid, member]) => ({
        uid,
        name: member.name,
        role: member.role,
        online: Boolean(group.presence[uid]?.online),
      })),
    };
  }

  const originLatRad = (origin.lat * Math.PI) / 180;
  const located: Located[] = [];
  const unlocated: TrainLayout['unlocated'] = [];

  for (const [uid, member] of memberEntries) {
    const presence = group.presence[uid];
    if (isFiniteNumber(presence?.lat) && isFiniteNumber(presence?.lng)) {
      located.push({
        uid,
        name: member.name,
        role: member.role,
        lat: presence.lat,
        lng: presence.lng,
        presence,
        x: (((presence.lng - origin.lng) * Math.PI) / 180) *
          EARTH_RADIUS_M *
          Math.cos(originLatRad),
        y: (((presence.lat - origin.lat) * Math.PI) / 180) * EARTH_RADIUS_M,
      });
    } else {
      unlocated.push({
        uid,
        name: member.name,
        role: member.role,
        online: Boolean(presence?.online),
      });
    }
  }

  const axis = trainAxis(group, located);
  const riders = located
    .map((rider) => ({
      uid: rider.uid,
      name: rider.name,
      role: rider.role,
      lat: rider.lat,
      lng: rider.lng,
      online: Boolean(rider.presence.online),
      updatedAt: rider.presence.updatedAt,
      battery: rider.presence.battery,
      speed: rider.presence.speed,
      projection: rider.x * axis.x + rider.y * axis.y,
    }))
    .sort((a, b) => {
      if (a.uid === group.meta.leaderId) return -1;
      if (b.uid === group.meta.leaderId) return 1;
      return b.projection - a.projection;
    });

  const gaps = riders.slice(0, -1).map((rider, index) => {
    const next = riders[index + 1];
    const meters = haversineMeters(rider, next);
    return {
      fromUid: rider.uid,
      toUid: next.uid,
      meters,
      overThreshold: meters > thresholdMeters,
    };
  });

  return { riders, gaps, unlocated };
}

export function formatMeters(meters: number): string {
  if (meters < 10) return `${meters.toFixed(1)} m`;
  return `${Math.round(meters)} m`;
}
