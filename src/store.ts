// Local app state. displayName and the active groupId are persisted to
// AsyncStorage so relaunching mid-ride drops you straight back into the group.
// uid comes from anonymous auth.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NAME_KEY = 'biketrack.displayName';
const GROUP_KEY = 'biketrack.groupId';
const DEDUP_KEY = 'biketrack.commsDedup';

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
  setUid: (uid: string | null) => void;
  setKeepAwake: (keepAwake: boolean) => void;
  setCommsDedup: (commsDedup: boolean) => Promise<void>;
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
  setUid: (uid) => set({ uid }),
  setKeepAwake: (keepAwake) => set({ keepAwake }),
  setCommsDedup: async (commsDedup) => {
    await AsyncStorage.setItem(DEDUP_KEY, commsDedup ? '1' : '0');
    set({ commsDedup });
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
    await AsyncStorage.multiRemove([NAME_KEY, GROUP_KEY]);
    set({ displayName: null, groupId: null });
  },
  hydrate: async () => {
    const [name, groupId, dedup] = await Promise.all([
      AsyncStorage.getItem(NAME_KEY),
      AsyncStorage.getItem(GROUP_KEY),
      AsyncStorage.getItem(DEDUP_KEY),
    ]);
    set({ displayName: name, groupId, commsDedup: dedup !== '0', hydrated: true });
  },
}));
