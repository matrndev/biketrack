// Local app state. displayName and the active groupId are persisted to
// AsyncStorage so relaunching mid-ride drops you straight back into the group.
// uid comes from anonymous auth.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NAME_KEY = 'biketrack.displayName';
const GROUP_KEY = 'biketrack.groupId';

type State = {
  uid: string | null;
  displayName: string | null;
  groupId: string | null;
  hydrated: boolean;
  setUid: (uid: string | null) => void;
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
  setUid: (uid) => set({ uid }),
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
    const [name, groupId] = await Promise.all([
      AsyncStorage.getItem(NAME_KEY),
      AsyncStorage.getItem(GROUP_KEY),
    ]);
    set({ displayName: name, groupId, hydrated: true });
  },
}));
