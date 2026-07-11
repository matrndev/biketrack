// Local app state. displayName and the active groupId are persisted to
// AsyncStorage so relaunching mid-ride drops you straight back into the group.
// uid comes from anonymous auth.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_GAP_ALERT_METERS } from './train';

const NAME_KEY = 'biketrack.displayName';
const GROUP_KEY = 'biketrack.groupId';
const DEDUP_KEY = 'biketrack.commsDedup';
const GAP_KEY = 'biketrack.gapAlertMeters';
const AVATAR_COLOR_KEY = 'biketrack.avatarColor';
const AVATAR_INITIALS_KEY = 'biketrack.avatarInitials';

export const DEFAULT_AVATAR_COLOR = '#4C9EFF';

/** Fallback avatar letters when none are set: first letter of the name. */
export const defaultInitials = (name: string | null) =>
  (name ?? '').trim().slice(0, 1).toUpperCase() || '?';

/** Latest GPS fix as captured by the background location task. */
export type Fix = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  battery: number | null;
  /** Device timestamp of the fix (ms). */
  timestamp: number;
};

type State = {
  uid: string | null;
  displayName: string | null;
  groupId: string | null;
  hydrated: boolean;
  tracking: boolean;
  lastFix: Fix | null;
  /** Ride setting: keep the display awake. Session-only, not persisted. */
  keepAwake: boolean;
  /** Ride setting: merge identical nearby comms into one pin. Persisted. */
  commsDedup: boolean;
  /** Ride setting: gap size (m) that triggers the "too far" alert. Persisted. */
  gapAlertMeters: number;
  /** Avatar background color (hex). Persisted; null → DEFAULT_AVATAR_COLOR. */
  avatarColor: string | null;
  /** Avatar letters (max 2). Persisted; null → first letter of displayName. */
  avatarInitials: string | null;
  setUid: (uid: string | null) => void;
  setAvatar: (color: string, initials: string) => Promise<void>;
  setKeepAwake: (keepAwake: boolean) => void;
  setCommsDedup: (commsDedup: boolean) => Promise<void>;
  setGapAlertMeters: (gapAlertMeters: number) => Promise<void>;
  setTracking: (tracking: boolean) => void;
  setLastFix: (fix: Fix) => void;
  setDisplayName: (name: string) => Promise<void>;
  setGroupId: (groupId: string | null) => Promise<void>;
  /** Wipe persisted identity state (name + group) — used on log out. */
  reset: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useStore = create<State>((set) => ({
  uid: null,
  displayName: null,
  groupId: null,
  hydrated: false,
  tracking: false,
  lastFix: null,
  keepAwake: false,
  commsDedup: true,
  gapAlertMeters: DEFAULT_GAP_ALERT_METERS,
  avatarColor: null,
  avatarInitials: null,
  setUid: (uid) => set({ uid }),
  setAvatar: async (color, initials) => {
    await AsyncStorage.multiSet([
      [AVATAR_COLOR_KEY, color],
      [AVATAR_INITIALS_KEY, initials],
    ]);
    set({ avatarColor: color, avatarInitials: initials });
  },
  setKeepAwake: (keepAwake) => set({ keepAwake }),
  setCommsDedup: async (commsDedup) => {
    await AsyncStorage.setItem(DEDUP_KEY, commsDedup ? '1' : '0');
    set({ commsDedup });
  },
  setGapAlertMeters: async (gapAlertMeters) => {
    await AsyncStorage.setItem(GAP_KEY, String(gapAlertMeters));
    set({ gapAlertMeters });
  },
  setTracking: (tracking) => set({ tracking }),
  setLastFix: (lastFix) => set({ lastFix }),
  setDisplayName: async (name) => {
    await AsyncStorage.setItem(NAME_KEY, name);
    set({ displayName: name });
  },
  setGroupId: async (groupId) => {
    if (groupId) await AsyncStorage.setItem(GROUP_KEY, groupId);
    else await AsyncStorage.removeItem(GROUP_KEY);
    set({ groupId });
  },
  reset: async () => {
    await AsyncStorage.multiRemove([NAME_KEY, GROUP_KEY, AVATAR_COLOR_KEY, AVATAR_INITIALS_KEY]);
    set({ displayName: null, groupId: null, avatarColor: null, avatarInitials: null });
  },
  hydrate: async () => {
    const [name, groupId, dedup, gap, avatarColor, avatarInitials] = await Promise.all([
      AsyncStorage.getItem(NAME_KEY),
      AsyncStorage.getItem(GROUP_KEY),
      AsyncStorage.getItem(DEDUP_KEY),
      AsyncStorage.getItem(GAP_KEY),
      AsyncStorage.getItem(AVATAR_COLOR_KEY),
      AsyncStorage.getItem(AVATAR_INITIALS_KEY),
    ]);
    const gapMeters = gap != null ? Number(gap) : NaN;
    set({
      displayName: name,
      groupId,
      commsDedup: dedup !== '0',
      gapAlertMeters: Number.isFinite(gapMeters) && gapMeters > 0 ? gapMeters : DEFAULT_GAP_ALERT_METERS,
      avatarColor,
      avatarInitials,
      hydrated: true,
    });
  },
}));
