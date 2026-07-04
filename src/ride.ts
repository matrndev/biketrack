// Ties tracking + presence to *being in a group*, not to any screen: mounted
// once at the navigation root, so backing out to Home mid-ride doesn't mark
// you offline or stop GPS. Leaving the group (or logging out) tears both down.
import { useEffect } from 'react';
import { useStore } from './store';
import { setupPresence } from './presence';
import { hasTrackingPermissions, startTracking, stopTracking } from './location';

export function useRideLifecycle(): void {
  const uid = useStore((s) => s.uid);
  const groupId = useStore((s) => s.groupId);

  useEffect(() => {
    if (!uid || !groupId) return;
    const cleanupPresence = setupPresence(groupId, uid);

    // Auto-start only if permissions are already granted; the interactive
    // request lives on the Group screen where the user can see why.
    let cancelled = false;
    (async () => {
      if ((await hasTrackingPermissions()) && !cancelled) await startTracking();
    })();

    return () => {
      cancelled = true;
      cleanupPresence();
      stopTracking();
    };
  }, [uid, groupId]);
}
