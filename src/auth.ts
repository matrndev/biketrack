// Anonymous auth: no login UX, but every device gets a stable Firebase UID that
// persists across relaunches (react-native-firebase caches the session).
import { signInAnonymously, onAuthStateChanged, signOut } from '@react-native-firebase/auth';
import { auth } from './firebase';

/** Signs in anonymously if needed and resolves with the stable device UID. */
export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/**
 * Discard this device's anonymous identity and mint a fresh one. The old UID is
 * unrecoverable — we try to delete the account so it doesn't linger orphaned in
 * Firebase, falling back to a plain sign-out if deletion is refused.
 */
export async function resetIdentity(): Promise<string> {
  try {
    await auth.currentUser?.delete();
  } catch {
    await signOut(auth);
  }
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/** Subscribe to auth changes; callback gets the uid or null. Returns unsubscribe. */
export function subscribeAuth(cb: (uid: string | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => cb(user?.uid ?? null));
}
