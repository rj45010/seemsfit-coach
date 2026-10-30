import { FieldValue } from 'firebase-admin/firestore';
import { workoutsCol } from '../shared/firestoreAdmin.js';
import type { NormalizedWorkout } from './adapters/types.js';

export async function writeWorkout(uid: string, w: NormalizedWorkout): Promise<string> {
  const doc: Record<string, unknown> = {
    category: w.category,
    isManual: w.isManual,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (w.title) doc.title = w.title;
  if (w.duration != null) doc.duration = w.duration;
  if (w.distance != null) doc.distance = w.distance;
  if (w.calories != null) doc.calories = w.calories;
  if (w.avgHr != null) doc.avgHr = w.avgHr;
  if (w.maxHr != null) doc.maxHr = w.maxHr;
  if (w.customDate) doc.customDate = w.customDate;

  const ref = await workoutsCol(uid).add(doc);
  return `workouts/${ref.id}`;
}
