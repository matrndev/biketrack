// Anonymous auth: no login UX, but every device gets a stable Firebase UID that
// persists across relaunches (react-native-firebase caches the session).
import { signInAnonymously, onAuthStateChanged } from '@react-native-firebase/auth';
import { auth } from './firebase';

/** Signs in anonymously if needed and resolves with the stable device UID. */
export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/** Subscribe to auth changes; callback gets the uid or null. Returns unsubscribe. */
export function subscribeAuth(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => cb(user?.uid ?? null));
}
