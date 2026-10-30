import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

/**
 * A persistent record of workout doc-ids the user has deleted, so the watch / HealthKit
 * importers never re-create them. Both importers write deterministic ids (`wkt_*`, `ahk_*`),
 * so once an id is tombstoned a re-drain or re-sync simply skips it. Re-logging a genuinely
 * new session gets a fresh id (a later timestamp / new HK UUID), so it's never blocked.
 */
const ref = (uid: string) => doc(db, `users/${uid}/meta/deletedWorkouts`);

/** Remember that a workout id was deleted. */
export async function recordDeletedWorkout(uid: string, id: string): Promise<void> {
  try {
    await setDoc(ref(uid), { ids: arrayUnion(id) }, { merge: true });
  } catch {
    /* best-effort */
  }
}

/** The set of deleted workout ids (so importers can skip them). */
export async function getDeletedWorkoutIds(uid: string): Promise<Set<string>> {
  try {
    const snap = await getDoc(ref(uid));
    return new Set(((snap.data()?.ids as string[] | undefined) ?? []));
  } catch {
    return new Set();
  }
}
