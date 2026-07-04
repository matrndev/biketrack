// Group lifecycle (create / join / leave) + live subscription. All authoritative
// timestamps are RTDB server timestamps. Join codes live in a `joinCodes/{code}`
// reverse-lookup node so a 6-digit join is a single read (PLAN §3).
import { useEffect, useState } from 'react';
import {
  ref,
  get,
  set,
  update,
  onValue,
  serverTimestamp,
  push,
  runTransaction,
} from '@react-native-firebase/database';
import { db } from './firebase';
import type { Presence } from './presence';

export type Role = 'leader' | 'member';

export type Member = {
  name: string;
  role: Role;
  joinedAt: number;
};

export type GroupMeta = {
  name: string;
  leaderId: string;
  createdAt: number;
  joinCode: string;
  rideStartedAt?: number;
  rideStartedBy?: string;
};

export type Group = {
  id: string;
  meta: GroupMeta;
  members: Record<string, Member>;
  presence: Record<string, Presence>;
};

const QR_PREFIX = 'biketrack://join/';

/** Payload we encode in the group QR code. The code alone is enough to join. */
export function qrPayload(code: string): string {
  return `${QR_PREFIX}${code}`;
}

/** Extract a 6-digit join code from scanned QR data or manual input; null if invalid. */
export function parseJoinCode(data: string): string | null {
  const raw = data.startsWith(QR_PREFIX) ? data.slice(QR_PREFIX.length) : data;
  const trimmed = raw.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function randomCode(): string {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

/**
 * Atomically reserve an unused join code for this group. A transaction on
 * `joinCodes/{code}` only commits when the slot is empty, so two groups can't
 * grab the same code even if they race.
 */
async function reserveJoinCode(groupId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const res = await runTransaction(ref(db, `joinCodes/${code}`), (current) =>
      current === null ? groupId : undefined
    );
    if (res.committed) return code;
  }
  throw new Error('Could not allocate a join code — try again.');
}

/** Create a group; caller becomes leader. Resolves with the new groupId. */
export async function createGroup(
  groupName: string,
  uid: string,
  displayName: string
): Promise<string> {
  const groupId = push(ref(db, 'groups')).key!;
  const joinCode = await reserveJoinCode(groupId);
  await update(ref(db), {
    [`groups/${groupId}/meta`]: {
      name: groupName,
      leaderId: uid,
      createdAt: serverTimestamp(),
      joinCode,
    },
    [`groups/${groupId}/members/${uid}`]: {
      name: displayName,
      role: 'leader',
      joinedAt: serverTimestamp(),
    },
  });
  return groupId;
}

/** Join a group by 6-digit code. Resolves with the groupId. */
export async function joinGroup(
  code: string,
  uid: string,
  displayName: string
): Promise<string> {
  const codeSnap = await get(ref(db, `joinCodes/${code}`));
  const groupId = codeSnap.val();
  if (typeof groupId !== 'string') throw new Error('No group with that code.');

  // Rejoining a group we're already in must not demote a leader. We can only
  // read the group once we're a member, so a denied read just means "not in".
  let existing: Member | null = null;
  try {
    const snap = await get(ref(db, `groups/${groupId}/members/${uid}`));
    existing = snap.val();
  } catch {
    existing = null;
  }

  await set(ref(db, `groups/${groupId}/members/${uid}`), {
    name: displayName,
    role: existing?.role ?? 'member',
    joinedAt: existing?.joinedAt ?? serverTimestamp(),
  });
  return groupId;
}

/**
 * Leave a group. Last member out deletes the group and frees its join code;
 * a departing leader hands leadership to the longest-standing member (so the
 * last member standing is always the leader).
 */
export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const snap = await get(ref(db, `groups/${groupId}`));
  const group = snap.val();
  if (!group?.meta) return; // already gone

  const members: Record<string, Member> = group.members ?? {};
  const others = Object.keys(members).filter((id) => id !== uid);

  if (others.length === 0) {
    await update(ref(db), {
      [`groups/${groupId}`]: null,
      [`joinCodes/${group.meta.joinCode}`]: null,
    });
    return;
  }

  const updates: Record<string, unknown> = {
    [`groups/${groupId}/members/${uid}`]: null,
    [`groups/${groupId}/presence/${uid}`]: null,
  };
  if (group.meta.leaderId === uid) {
    const next = others.sort(
      (a, b) => (members[a]?.joinedAt ?? 0) - (members[b]?.joinedAt ?? 0)
    )[0];
    updates[`groups/${groupId}/meta/leaderId`] = next;
    updates[`groups/${groupId}/members/${next}/role`] = 'leader';
  }
  await update(ref(db), updates);
}

/** Leader action: mark the group ride as started so every member enters Ride. */
export async function startRide(groupId: string, uid: string): Promise<void> {
  await update(ref(db, `groups/${groupId}/meta`), {
    rideStartedAt: serverTimestamp(),
    rideStartedBy: uid,
  });
}

/**
 * Live view of a group. `undefined` = loading, `null` = group gone (deleted,
 * or we lost access — e.g. we were removed). Callers should clear their stored
 * groupId on `null`.
 */
export function useGroup(groupId: string | null): Group | null | undefined {
  const [group, setGroup] = useState<Group | null | undefined>(
    groupId ? undefined : null
  );

  useEffect(() => {
    if (!groupId) {
      setGroup(null);
      return;
    }
    setGroup(undefined);
    const unsub = onValue(
      ref(db, `groups/${groupId}`),
      (snap) => {
        const v = snap.val();
        if (!v?.meta) {
          setGroup(null);
          return;
        }
        setGroup({
          id: groupId,
          meta: v.meta,
          members: v.members ?? {},
          presence: v.presence ?? {},
        });
      },
      () => setGroup(null) // permission denied → treat as gone
    );
    return () => unsub();
  }, [groupId]);

  return group;
}
