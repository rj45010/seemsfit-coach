import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// Open sign-up: any Google account with a verified email may use the app.
// Data access is scoped per-user by Firestore Security Rules (request.auth.uid).
export function isAllowedEmail(email?: string | null): boolean {
  return !!email;
}

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

// On native, getAuth()'s default persistence probe can stall in WKWebView so the
// auth observer never fires — the app then hangs in a fake "resolving" state.
// initializeAuth with explicit persistence makes onAuthStateChanged fire reliably.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  : getAuth(app);
// Firestore's default streaming (WebChannel) transport hangs inside Capacitor's
// WKWebView, so on native we force long-polling; on web we let it auto-detect.
//
// Cache: on WEB, persistentLocalCache (IndexedDB) keeps data on disk so a reopened
// app shows last-known data instantly. On NATIVE we MUST NOT use it — WKWebView
// closes IndexedDB transactions when they yield to the event loop, which trips the
// Firestore SDK's internal assertion b815 ("delete range without an in-progress
// transaction") and makes writes (Vyom "apply", meal/sleep logging) fail. memory
// cache sidesteps IndexedDB entirely; the app already refetches on open.
export const db = initializeFirestore(app, {
  ...(Capacitor.isNativePlatform()
    ? { experimentalForceLongPolling: true }
    : { experimentalAutoDetectLongPolling: true }),
  localCache: Capacitor.isNativePlatform()
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
});
export const storage = getStorage(app);

export class NotAuthorizedError extends Error {
  constructor() {
    super('NOT_AUTHORIZED');
    this.name = 'NotAuthorizedError';
  }
}

export async function signInWithGoogle() {
  let user;
  if (Capacitor.isNativePlatform()) {
    // WKWebView blocks signInWithPopup — drive the native Google SDK, then hand
    // the resulting ID token to the JS SDK so the rest of the app (Firestore,
    // useAuth) sees the same Firebase user. (seemsfit_mobile pattern.)
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('GOOGLE_NO_ID_TOKEN');
    const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    user = cred.user;
  } else {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    user = cred.user;
  }
  if (!isAllowedEmail(user.email)) {
    await signOut(auth);
    if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut().catch(() => {});
    throw new NotAuthorizedError();
  }
  return user;
}

export { signOut, onAuthStateChanged };
