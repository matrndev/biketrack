// Live RTDB connection state + a timeout guard for writes. RTDB write promises
// only resolve on a server ack and queue forever while the connection is down
// (or stuck unauthenticated), so an unguarded await can hang the UI on a
// spinner indefinitely — fail fast and tell the user instead.
import { useEffect, useState } from 'react';
import { ref, onValue } from '@react-native-firebase/database';
import { db } from './firebase';

/** How long a group write may wait for a server ack before we give up. */
export const WRITE_TIMEOUT_MS = 15_000;

export const OFFLINE_MESSAGE = "Can't establish a connection to the server, check your network.";

export const TIMEOUT_MESSAGE =
  'The server is not responding. Check your connection and try again.';

/**
 * True while the client has a live RTDB connection. Starts optimistic so the
 * brief false `.info/connected` emits during startup don't flash offline UI.
 */
export function useConnected(): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const unsub = onValue(ref(db, '.info/connected'), (snap) =>
      setConnected(snap.val() === true)
    );
    return () => unsub();
  }, []);
  return connected;
}

/**
 * Reject after `ms` so a write queued while offline can't hang the caller.
 * The underlying write is NOT cancelled — it may still land if the connection
 * recovers later. For join-code reservations that only orphans a code, which
 * the rules let the next group reclaim (its group id never comes to exist).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
