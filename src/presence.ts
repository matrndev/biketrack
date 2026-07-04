// Presence lifecycle (PLAN §4): while in a group, keep presence/{uid}/online
// true and arm an RTDB onDisconnect so the *server* flips it to false when the
// socket dies — that's what powers "connection dropped" alerts. Location data
// on the same node is written by the background task in location.ts.
//
// updatedAt doubles as the heartbeat: the location task bumps it on every fix,
// but fixes stop when stationary (distanceInterval), so we also bump it on a
// timer — otherwise a rider stopped at a café looks dropped (alerts.ts STALE_MS).
import {
  ref,
  onValue,
  update,
  onDisconnect,
  serverTimestamp,
} from '@react-native-firebase/database';
import { db } from './firebase';

/** Well under alerts.ts STALE_MS, so a live-but-stationary rider never looks dropped. */
const HEARTBEAT_MS = 15_000;

export type Presence = {
  lat?: number;
  lng?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  battery?: number | null;
  sharingLocation?: boolean;
  online?: boolean;
  updatedAt?: number;
};

/**
 * Maintain online/onDisconnect for this member. Re-arms on every reconnect
 * (an onDisconnect fires once, so each new connection needs a fresh one).
 * Returns a cleanup that marks us cleanly offline.
 */
export function setupPresence(groupId: string, uid: string): () => void {
  const presRef = ref(db, `groups/${groupId}/presence/${uid}`);
  const connRef = ref(db, '.info/connected');

  const unsub = onValue(connRef, (snap) => {
    if (!snap.val()) return;
    onDisconnect(presRef)
      .update({ online: false })
      .then(() => update(presRef, { online: true, updatedAt: serverTimestamp() }))
      .catch(() => {});
  });

  const heartbeat = setInterval(() => {
    update(presRef, { updatedAt: serverTimestamp() }).catch(() => {});
  }, HEARTBEAT_MS);

  return () => {
    unsub();
    clearInterval(heartbeat);
    onDisconnect(presRef).cancel().catch(() => {});
    update(presRef, { online: false }).catch(() => {});
  };
}
