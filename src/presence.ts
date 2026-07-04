// Presence lifecycle (PLAN §4): while in a group, keep presence/{uid}/online
// true and arm an RTDB onDisconnect so the *server* flips it to false when the
// socket dies — that's what powers "connection dropped" alerts. Location data
// on the same node is written by the background task in location.ts.
import {
  ref,
  onValue,
  update,
  onDisconnect,
  serverTimestamp,
} from '@react-native-firebase/database';
import { db } from './firebase';

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

  return () => {
    unsub();
    onDisconnect(presRef).cancel().catch(() => {});
    update(presRef, { online: false }).catch(() => {});
  };
}
