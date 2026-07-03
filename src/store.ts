// Local app state. displayName is persisted to AsyncStorage so we don't re-ask
// on every launch. uid comes from anonymous auth; groupId is a stub for M1.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NAME_KEY = 'biketrack.displayName';

type State = {
  uid: string | null;
  displayName: string | null;
  groupId: string | null;
  hydrated: boolean;
  setUid: (uid: string | null) => void;
  setDisplayName: (name: string) => Promise<void>;
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
  hydrate: async () => {
    const name = await AsyncStorage.getItem(NAME_KEY);
    set({ displayName: name, hydrated: true });
  },
}));
