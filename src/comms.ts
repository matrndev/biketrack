// Comms (PLAN §5.4): geo-pinned one-tap alerts. Each comm is stored under its
// dedupKey — "{type}:{geohash}" at precision 7 (≈150 m cells) — so two riders
// firing the same alert at the same spot converge on ONE pin: the RTDB
// transaction below either creates the pin or bumps `count` and refreshes
// `expiresAt`. Keying by dedupKey makes the dedup check and the write a single
// atomic operation (no read-then-push race).
import { useEffect, useRef, useState } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faAnglesDown,
  faArrowLeft,
  faArrowRight,
  faCarSide,
  faHand,
  faLocationDot,
  faWarning,
} from '@fortawesome/free-solid-svg-icons';
import {
  ref,
  onValue,
  push,
  remove,
  runTransaction,
  serverTimestamp,
  set,
} from '@react-native-firebase/database';
import { db } from './firebase';
import { serverNow } from './time';
import { haversineMeters } from './train';
import { useStore } from './store';
import { speak } from './speech';

export type CommType =
  | 'danger'
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
  icon: IconDefinition;
  /** TTS phrase spoken on every recipient when the comm lands. */
  spoken: string;
  /** TTS phrase for "reached the pin" — only geo-static types have one. */
  approach?: string;
  severity: Severity;
  /** Type-dependent TTL: transient warnings die fast, road hazards linger. */
  ttlMs: number;
};

export const COMM_DEFS: Record<CommType, CommDef> = {
  danger: {
    label: 'Danger',
    icon: faWarning,
    spoken: 'Danger',
    approach: 'Danger ahead',
    severity: 'critical',
    ttlMs: 10 * 60_000,
  },
  car_back: {
    label: 'Car back',
    icon: faCarSide,
    spoken: 'Car back',
    severity: 'critical',
    ttlMs: 45_000,
  },
  stopping: {
    label: 'Stopping',
    icon: faHand,
    spoken: 'Stopping',
    severity: 'critical',
    ttlMs: 2 * 60_000,
  },
  slowing: {
    label: 'Slowing',
    icon: faAnglesDown,
    spoken: 'Slowing down',
    severity: 'important',
    ttlMs: 60_000,
  },
  turn_left: {
    label: 'Turn left',
    icon: faArrowLeft,
    spoken: 'Turn left',
    approach: 'Left turn ahead',
    severity: 'low',
    ttlMs: 3 * 60_000,
  },
  turn_right: {
    label: 'Turn right',
    icon: faArrowRight,
    spoken: 'Turn right',
    approach: 'Right turn ahead',
    severity: 'low',
    ttlMs: 3 * 60_000,
  },
  regroup: {
    label: 'Regroup',
    icon: faLocationDot,
    spoken: 'Regroup here',
    approach: 'Regroup point ahead',
    severity: 'important',
    ttlMs: 5 * 60_000,
  },
};

/** Within this range of a pin (and closing in) the approach phrase is spoken. */
export const APPROACH_METERS = 20;

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
 * value on the server clock). With `dedup` off (Settings toggle) every send
 * becomes its own pin under a pushed key — nothing merges, everything is
 * announced; pins from riders who kept dedup on still merge with each other.
 */
export async function sendComm(
  groupId: string,
  uid: string,
  type: CommType,
  lat: number,
  lng: number,
  offset: number,
  dedup = true
): Promise<void> {
  const def = COMM_DEFS[type];
  const now = serverNow(offset);
  if (!dedup) {
    const node = push(ref(db, `groups/${groupId}/comms`));
    await set(node, {
      type,
      severity: def.severity,
      lat,
      lng,
      dedupKey: node.key,
      createdBy: uid,
      createdAt: serverTimestamp(),
      expiresAt: now + def.ttlMs,
      count: 1,
    });
    return;
  }
  const dedupKey = `${type}:${geohash(lat, lng)}`;
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
 * Live comms for a group, newest first. `loaded` flips once the first RTDB
 * snapshot lands — consumers must not treat the initial empty state as "no
 * backlog" (the announcer seeds off it). Also does lazy TTL cleanup: any
 * member deletes pins that have been expired for over a minute (best-effort —
 * clients race harmlessly, deletion is idempotent).
 */
export function useComms(
  groupId: string | null,
  offset: number
): { comms: Comm[]; loaded: boolean } {
  const [comms, setComms] = useState<Comm[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setComms([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onValue(
      ref(db, `groups/${groupId}/comms`),
      (snap) => {
        const v = (snap.val() ?? {}) as Record<string, Omit<Comm, 'id'>>;
        const list = Object.entries(v).map(([id, c]) => ({ ...c, id }));
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setComms(list);
        setLoaded(true);
      },
      () => {
        setComms([]);
        setLoaded(true);
      }
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

  return { comms, loaded };
}

// Announce keys include createdAt so a pin recreated at the same spot after
// expiry (same RTDB key) still gets spoken as new.
const announceKey = (c: Comm) => `${c.id}@${c.createdAt}`;

/**
 * The spoken side of comms (PLAN §5.4), for the rider holding this device:
 * - a comm landing from another rider is spoken once (severity-shaped),
 *   followed by the sender's name;
 * - approaching a geo-static pin (within APPROACH_METERS and closing in)
 *   speaks its approach phrase once per pin per rider.
 * The backlog present when the first snapshot lands is seeded silently —
 * joining mid-ride must not read out every old pin. Seeding waits for
 * `loaded`: the pre-snapshot empty state must not count as the backlog.
 */
export function useCommsAnnouncer(
  comms: Comm[],
  loaded: boolean,
  uid: string | null,
  offset: number,
  members: Record<string, { name: string }>
): void {
  const lastFix = useStore((s) => s.lastFix);
  const seeded = useRef(false);
  const spokenNew = useRef(new Set<string>());
  const approachDone = useRef(new Set<string>());
  const lastDist = useRef(new Map<string, number>());

  // New-comm announcements.
  useEffect(() => {
    if (!loaded) return;
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
      if (c.createdBy !== uid) {
        const name = members[c.createdBy]?.name;
        speak(COMM_DEFS[c.type].spoken, c.severity, name ? `from ${name}` : undefined);
      }
    }
  }, [comms, loaded, uid, offset]);

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
