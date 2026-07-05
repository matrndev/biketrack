// Clock sync — the whole story. RTDB exposes `.info/serverTimeOffset`: the
// estimated skew (ms) between this device's clock and Firebase's server clock.
// Add it to Date.now() to get a server-accurate "now" without any custom sync.
import { useEffect, useState } from 'react';
import { ref, onValue } from '@react-native-firebase/database';
import { db } from './firebase';

/** Live server-time offset in ms. Add to Date.now() for server time. */
export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const r = ref(db, '.info/serverTimeOffset');
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      if (typeof val === 'number') setOffset(val);
    });
    return () => unsub();
  }, []);
  return offset;
}

/** Server-corrected current time in ms. */
export function serverNow(offset: number): number {
  return Date.now() + offset;
}

/** Human "Ns ago" / "Nm Ns ago" for a server timestamp, using the offset. */
export function agoLabel(timestampMs: number, offset: number): string {
  // A just-written serverTimestamp() is still the sentinel object on the
  // writer's device — render "now" instead of "NaNs ago" until it resolves.
  if (!Number.isFinite(timestampMs)) return 'now';
  const secs = Math.max(0, Math.round((serverNow(offset) - timestampMs) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s ago`;
}
