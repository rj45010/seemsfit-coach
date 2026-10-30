import { FieldValue } from 'firebase-admin/firestore';
import { dailyMetricsDoc } from '../shared/firestoreAdmin.js';
import type { NormalizedDaily } from './adapters/types.js';

/** Strip undefined so merge writes don't clobber existing fields with nulls. */
function clean<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export async function writeDaily(uid: string, daily: NormalizedDaily): Promise<string> {
  const ref = dailyMetricsDoc(uid, daily.date);
  await ref.set({ ...clean(daily), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return `dailyMetrics/${daily.date}`;
}
