// Comms (PLAN §5.4): geo-pinned one-tap alerts. Each comm is stored under its
// dedupKey — "{type}:{geohash}" at precision 7 (≈150 m cells) — so two riders
// firing the same alert at the same spot converge on ONE pin: the RTDB
// transaction below either creates the pin or bumps `count` and refreshes
// `expiresAt`. Keying by dedupKey makes the dedup check and the write a single
// atomic operation (no read-then-push race).
import { useEffect, useRef, useState } from 'react';
import {
  ref,
  onValue,
  remove,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/database';
import { db } from './firebase';
import { serverNow } from './time';
import { haversineMeters } from './train';
import { useStore } from './store';
import { speak } from './speech';

export type CommType =
  | 'pothole'
  | 'slowing'
  | 'stopping'
  | 'regroup'
  | 'turn_left'
  | 'turn_right'
  | 'car_back';

export type Severity = 'critical' | 'important' | 'low';

export type Comm = {
  /** RTDB key — equals the dedupKey. */
  id: string;
  type: CommType;
  severity: Severity;
  lat: number;
  lng: number;
  dedupKey: string;
  createdBy: string;
  createdAt: number;
  /** Server-clock ms after which the pin is stale. */
  expiresAt: number;
  /** How many riders fired this same alert (merged duplicates). */
  count: number;
};

export type CommDef = {
  label: string;
  icon: string;
  /** TTS phrase spoken on every recipient when the comm lands. */
  spoken: string;
  /** TTS phrase for "reached the pin" — only geo-static types have one. */
  approach?: string;
  severity: Severity;
  /** Type-dependent TTL: transient warnings die fast, road hazards linger. */
  ttlMs: number;
};

export const COMM_DEFS: Record<CommType, CommDef> = {
  pothole: {
    label: 'Pothole',
    icon: '🕳️',
    spoken: 'Pothole',
    approach: 'Pothole ahead',
    severity: 'critical',
    ttlMs: 10 * 60_000,
  },
  car_back: {
    label: 'Car back',
    icon: '🚗',
    spoken: 'Car back',
    severity: 'critical',
    ttlMs: 45_000,
  },
  stopping: {
    label: 'Stopping',
    icon: '🛑',
    spoken: 'Stopping',
    severity: 'critical',
    ttlMs: 2 * 60_000,
  },
  slowing: {
    label: 'Slowing',
    icon: '🐢',
    spoken: 'Slowing down',
    severity: 'important',
    ttlMs: 60_000,
  },
  turn_left: {
    label: 'Turn left',
    icon: '⬅️',
    spoken: 'Turn left',
    approach: 'Left turn ahead',
    severity: 'important',
    ttlMs: 3 * 60_000,
  },
  turn_right: {
    label: 'Turn right',
    icon: '➡️',
    spoken: 'Turn right',
    approach: 'Right turn ahead',
    severity: 'important',
    ttlMs: 3 * 60_000,
  },
  regroup: {
    label: 'Regroup',
    icon: '📍',
    spoken: 'Regroup here',
    approach: 'Regroup point ahead',
    severity: 'low',
    ttlMs: 5 * 60_000,
  },
};

/** Within this range of a pin (and closing in) the approach phrase is spoken. */
export const APPROACH_METERS = 40;

// Standard geohash base32. Precision 7 ≈ 150 m × 150 m cells — the dedup
// radius from PLAN §5.4 ("geohash@precision≈150m").
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_PRECISION = 7;

export function geohash(lat: number, lng: number, precision = GEOHASH_PRECISION): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let bits = 0;
  let bitCount = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        bits = bits * 2 + 1;
        minLng = mid;
      } else {
        bits *= 2;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        bits = bits * 2 + 1;
        minLat = mid;
      } else {
        bits *= 2;
        maxLat = mid;
      }
    }
    evenBit = !evenBit;
    if (++bitCount === 5) {
      hash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return hash;
}

/**
 * Fire a comm at the given position. Atomic dedup: a live pin with the same
 * dedupKey gets `count`+1 and a fresh `expiresAt`; otherwise a new pin is
 * created. `offset` is the serverTimeOffset (expiresAt must be a concrete ms
 * value on the server clock).
 */
export async function sendComm(
  groupId: string,
  uid: string,
  type: CommType,
  lat: number,
  lng: number,
  offset: number
): Promise<void> {
  const def = COMM_DEFS[type];
  const dedupKey = `${type}:${geohash(lat, lng)}`;
  const now = serverNow(offset);
  await runTransaction(ref(db, `groups/${groupId}/comms/${dedupKey}`), (current) => {
    if (current && typeof current.expiresAt === 'number' && current.expiresAt > now) {
      return {
        ...current,
        count: (current.count ?? 1) + 1,
        expiresAt: now + def.ttlMs,
      };
    }
    return {
      type,
      severity: def.severity,
      lat,
      lng,
      dedupKey,
      createdBy: uid,
      createdAt: serverTimestamp(),
      expiresAt: now + def.ttlMs,
      count: 1,
    };
  });
}

/** The comms that haven't expired yet, given a server-clock "now". */
export function activeComms(comms: Comm[], now: number): Comm[] {
  return comms.filter((c) => c.expiresAt > now);
}

/**
 * Live comms for a group, newest first. Also does lazy TTL cleanup: any member
 * deletes pins that have been expired for over a minute (best-effort — clients
 * race harmlessly, deletion is idempotent).
 */
export function useComms(groupId: string | null, offset: number): Comm[] {
  const [comms, setComms] = useState<Comm[]>([]);

  useEffect(() => {
    if (!groupId) {
      setComms([]);
      return;
    }
    const unsub = onValue(
      ref(db, `groups/${groupId}/comms`),
      (snap) => {
        const v = (snap.val() ?? {}) as Record<string, Omit<Comm, 'id'>>;
        const list = Object.entries(v).map(([id, c]) => ({ ...c, id }));
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setComms(list);
      },
      () => setComms([])
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const cutoff = serverNow(offset) - 60_000;
    for (const c of comms) {
      if (c.expiresAt < cutoff) {
        remove(ref(db, `groups/${groupId}/comms/${c.id}`)).catch(() => {});
      }
    }
  }, [groupId, comms]);

  return comms;
}

// Announce keys include createdAt so a pin recreated at the same spot after
// expiry (same RTDB key) still gets spoken as new.
const announceKey = (c: Comm) => `${c.id}@${c.createdAt}`;

/**
 * The spoken side of comms (PLAN §5.4), for the rider holding this device:
 * - a comm landing from another rider is spoken once (severity-shaped);
 * - approaching a geo-static pin (within APPROACH_METERS and closing in)
 *   speaks its approach phrase once per pin per rider.
 * The backlog present on mount is seeded silently — joining mid-ride must not
 * read out every old pin.
 */
export function useCommsAnnouncer(
  comms: Comm[],
  uid: string | null,
  offset: number
): void {
  const lastFix = useStore((s) => s.lastFix);
  const seeded = useRef(false);
  const spokenNew = useRef(new Set<string>());
  const approachDone = useRef(new Set<string>());
  const lastDist = useRef(new Map<string, number>());

  // New-comm announcements.
  useEffect(() => {
    const active = activeComms(comms, serverNow(offset));
    if (!seeded.current) {
      for (const c of active) spokenNew.current.add(announceKey(c));
      seeded.current = true;
      return;
    }
    for (const c of active) {
      const key = announceKey(c);
      if (spokenNew.current.has(key)) continue;
      spokenNew.current.add(key);
      // The sender got haptic confirmation on tap; don't parrot back at them.
      if (c.createdBy !== uid) speak(COMM_DEFS[c.type].spoken, c.severity);
    }
  }, [comms, uid, offset]);

  // "Reached the pin" — re-check whenever a fix or the pin set changes.
  useEffect(() => {
    if (!lastFix) return;
    const active = activeComms(comms, serverNow(offset));
    for (const c of active) {
      const def = COMM_DEFS[c.type];
      if (!def.approach) continue; // transient types aren't geo-anchored
      const key = announceKey(c);
      const d = haversineMeters(lastFix, c);
      const prev = lastDist.current.get(key);
      lastDist.current.set(key, d);
      if (approachDone.current.has(key)) continue;
      if (prev == null) {
        // First sighting already inside the radius = the pin was born under
        // our wheels (we sent it, or just heard it land) — never announce.
        if (d <= APPROACH_METERS) approachDone.current.add(key);
        continue;
      }
      if (d <= APPROACH_METERS && d < prev) {
        approachDone.current.add(key);
        speak(def.approach, c.severity);
      }
    }
  }, [lastFix, comms, offset]);
}
