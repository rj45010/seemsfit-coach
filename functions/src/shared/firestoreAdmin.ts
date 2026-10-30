import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();

/** Doc/collection path helpers, scoped to the single allowed user. */
export const userDoc = (uid: string) => db.doc(`users/${uid}`);
export const dailyMetricsDoc = (uid: string, date: string) =>
  db.doc(`users/${uid}/dailyMetrics/${date}`);
export const workoutsCol = (uid: string) => db.collection(`users/${uid}/workouts`);
export const labDoc = (uid: string, id: string) => db.doc(`users/${uid}/labs/${id}`);
export const plansCol = (uid: string) => db.collection(`users/${uid}/plans`);
export const insightDoc = (uid: string, date: string) =>
  db.doc(`users/${uid}/insights/${date}`);
export const chatsCol = (uid: string) => db.collection(`users/${uid}/chats`);
