// Ride alerts (PLAN §5.5, M5): dropped connections (yours or others') and the
// "too far" gap alert. Every alert is edge-triggered — spoken once via TTS and
// shown as a single top banner that auto-dismisses — so a condition that
// persists doesn't nag every second. Detection re-arms when the condition
// clears (with hysteresis for the gap, so hovering at the threshold is quiet).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, onValue } from '@react-native-firebase/database';
import { db } from './firebase';
import { serverNow } from './time';
import { speak } from './speech';
import type { Group } from './groups';

/** A rider counts as dropped when their heartbeat is older than this. */
export const STALE_MS = 40_000;
/** How long the banner stays up before auto-dismissing. */
export const BANNER_MS = 6_000;
/** The gap alert re-arms once the gap shrinks below threshold × this. */
const GAP_REARM_RATIO = 0.8;

/** The rider behind the widest gap in the train, as computed by the caller. */
export type Straggler = {
  name: string;
  meters: number;
  isYou: boolean;
};

export type RideAlert = {
  id: number;
  message: string;
  /** danger = lost connection, warning = group splitting. */
  tone: 'danger' | 'warning';
};

/**
 * Watches the three M5 alert sources and returns the banner to show (or null).
 * Raising an alert also speaks it; the banner clears itself after BANNER_MS.
 */
export function useRideAlerts(
  group: Group | null | undefined,
  uid: string | null,
  offset: number,
  straggler: Straggler | null,
  gapThresholdMeters: number
): RideAlert | null {
  const [alert, setAlert] = useState<RideAlert | null>(null);
  const nextId = useRef(1);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raise = useCallback(
    (message: string, spoken: string, tone: RideAlert['tone']) => {
      speak(spoken, 'important');
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      const id = nextId.current++;
      setAlert({ id, message, tone });
      dismissTimer.current = setTimeout(() => {
        setAlert((cur) => (cur?.id === id ? null : cur));
      }, BANNER_MS);
    },
    []
  );

  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    []
  );

  // Our own connection, straight from the RTDB socket. Starts as false while
  // connecting, so only a true → false transition counts as a drop.
  const connected = useRef(true);
  useEffect(() => {
    let wasConnected: boolean | null = null;
    const unsub = onValue(ref(db, '.info/connected'), (snap) => {
      const now = !!snap.val();
      connected.current = now;
      if (wasConnected === true && !now) {
        raise("You're offline — the group can't see you", 'Connection lost', 'danger');
      }
      wasConnected = now;
    });
    return () => unsub();
  }, [raise]);

  // Others + gap are evaluated on a 1 s clock over the latest props (staleness
  // crosses the threshold by time passing, not by any prop changing).
  const inputs = useRef({ group, uid, offset, straggler });
  inputs.current = { group, uid, offset, straggler };
  const droppedRiders = useRef(new Set<string>());
  const gapArmed = useRef(true);

  useEffect(() => {
    const evaluate = () => {
      const { group, uid, offset, straggler } = inputs.current;
      if (!group) return;

      // While we're offline everyone's presence is frozen in our local cache,
      // so any "staleness" we'd see is our own. The own-connection alert covers it.
      if (connected.current) {
        const now = serverNow(offset);
        for (const [id, member] of Object.entries(group.members)) {
          if (id === uid) continue;
          const p = group.presence[id];
          if (!p || p.updatedAt == null) continue; // never checked in yet
          const isDropped = p.online === false || now - p.updatedAt > STALE_MS;
          if (isDropped && !droppedRiders.current.has(id)) {
            droppedRiders.current.add(id);
            raise(`${member.name} lost connection`, `${member.name} lost connection`, 'danger');
          } else if (!isDropped) {
            droppedRiders.current.delete(id);
          }
        }
      }

      if (straggler && straggler.meters > gapThresholdMeters) {
        if (gapArmed.current) {
          gapArmed.current = false;
          const m = Math.round(straggler.meters);
          if (straggler.isYou) {
            raise(`You're too far behind — ${m} m`, 'You are too far behind', 'warning');
          } else {
            raise(
              `${straggler.name} is too far behind — ${m} m`,
              `${straggler.name} is too far behind`,
              'warning'
            );
          }
        }
      } else if (!straggler || straggler.meters < gapThresholdMeters * GAP_REARM_RATIO) {
        gapArmed.current = true;
      }
    };
    const iv = setInterval(evaluate, 1000);
    evaluate();
    return () => clearInterval(iv);
  }, [raise, gapThresholdMeters]);

  return alert;
}
