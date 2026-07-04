// Location layer — the only file that touches expo-location, so it can be
// swapped for react-native-background-geolocation without touching the rest of
// the app (PLAN §7). Tracking runs as a TaskManager background task promoted to
// an Android foreground service, which is what keeps GPS alive with the screen
// off or the app backgrounded.
//
// IMPORTANT: this module must be imported at app startup (index.ts) so the
// task is defined before Android delivers queued locations to it.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import { PermissionsAndroid, Platform } from 'react-native';
import { ref, update, serverTimestamp } from '@react-native-firebase/database';
import { db } from './firebase';
import { useStore, Fix } from './store';

export const LOCATION_TASK = 'biketrack-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[locations.length - 1]; // batch may arrive; freshest wins
  if (!loc) return;

  const battery = await Battery.getBatteryLevelAsync().catch(() => null);
  const fix: Fix = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    heading: loc.coords.heading,
    speed: loc.coords.speed,
    accuracy: loc.coords.accuracy,
    battery,
    timestamp: loc.timestamp,
  };
  useStore.getState().setLastFix(fix);

  // In a group → publish presence. update() (not set) so the online flag
  // maintained by presence.ts survives.
  const { uid, groupId } = useStore.getState();
  if (uid && groupId) {
    await update(ref(db, `groups/${groupId}/presence/${uid}`), {
      lat: fix.lat,
      lng: fix.lng,
      heading: fix.heading,
      speed: fix.speed,
      accuracy: fix.accuracy,
      battery: fix.battery,
      sharingLocation: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {}); // offline blip — RTDB retries on reconnect anyway
  }
});

/**
 * Ask for everything screen-off tracking needs: foreground location, then
 * background ("Allow all the time" — Android sends the user to settings for
 * this), then notification permission so the foreground-service notification
 * is visible on Android 13+.
 */
export async function requestTrackingPermissions(): Promise<{
  granted: boolean;
  reason?: string;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { granted: false, reason: 'Location permission denied.' };

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) {
    return {
      granted: false,
      reason: 'Background location denied — pick "Allow all the time" in settings.',
    };
  }

  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    // Best-effort: tracking works without it, the FGS notification is just hidden.
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    ).catch(() => {});
  }
  return { granted: true };
}

/** Non-interactive check: are both location grants already in place? */
export async function hasTrackingPermissions(): Promise<boolean> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return fg.granted && bg.granted;
}

/** Start (or keep) the tracking task + foreground service. Idempotent. */
export async function startTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      // ~1–2 s cadence at riding speed (PLAN §5.1); adaptive tuning is M6.
      accuracy: Location.Accuracy.High,
      timeInterval: 2000,
      distanceInterval: 3,
      // The foreground service is what stops Android killing us on screen-off.
      foregroundService: {
        notificationTitle: 'BikeTrack is using location services',
        notificationBody: 'Your group can see your live position.',
        notificationColor: '#4C9EFF',
        killServiceOnDestroy: false,
      },
      // iOS (later milestone, set sanely now)
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  }
  useStore.getState().setTracking(true);
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  useStore.getState().setTracking(false);
}

/** Re-sync the store with reality on boot — the service survives app restarts. */
export async function syncTrackingState(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(
    () => false
  );
  useStore.getState().setTracking(running);
}

/**
 * true = Android battery optimization may kill background tracking (bad, OEMs
 * are aggressive — PLAN §7); null = can't tell on this platform.
 */
export async function isBatteryOptimized(): Promise<boolean | null> {
  try {
    return await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return null;
  }
}

/** Deep-link to the system screen where the user can exempt BikeTrack. */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
  );
}
