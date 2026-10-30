import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/date';
import type { ExerciseSets, Plan } from '@/lib/types';

/**
 * After a plan-logged workout is DELETED, revert that plan's per-exercise pre-fill
 * (`exercises[].loggedSets`) to the most recent REMAINING session of the same plan.
 * Remaining sessions are matched by `sourcePlanId` OR the plan's title, so older
 * sessions (logged before sourcePlanId existed) are still found. If a genuine prior
 * session exists → revert to it; if NONE remain → clear the pre-fill back to the
 * plan's unlogged state (so the deleted session's weights don't linger).
 */
export async function revertPlanPrefillAfterDelete(uid: string, planId: string, deletedWorkoutId: string): Promise<void> {
  const base = `users/${uid}`;
  const planRef = doc(db, `${base}/plans/${planId}`);
  const planSnap = await getDoc(planRef);
  if (!planSnap.exists()) return;
  const plan = planSnap.data() as Plan;

  // All this plan's logged sessions: by sourcePlanId (new) and by title (older ones).
  const byId = await getDocs(query(collection(db, `${base}/workouts`), where('sourcePlanId', '==', planId)));
  const byTitle = plan.title
    ? await getDocs(query(collection(db, `${base}/workouts`), where('title', '==', plan.title)))
    : null;
  // Title-match is only a back-compat bridge for LEGACY sessions (no sourcePlanId).
  // Sessions logged through the current path carry sourcePlanId, so matching them by
  // title too would let two plans sharing a title contaminate each other's pre-fill.
  const titleOnly = (byTitle?.docs ?? []).filter((d) => !d.data().sourcePlanId);
  const seen = new Set<string>();
  const remaining = [...byId.docs, ...titleOnly]
    .filter((d) => d.id !== deletedWorkoutId && !seen.has(d.id) && seen.add(d.id))
    .map((d) => d.data())
    .filter((d) => Array.isArray(d.exerciseSets) && (d.exerciseSets as unknown[]).length > 0)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
  const prevSets = (remaining[0]?.exerciseSets as ExerciseSets[] | undefined) ?? null;

  const exercises = (plan.exercises ?? []).map((ex) => {
    if (!prevSets) return { ...ex, loggedSets: [] }; // no prior session at all → back to unlogged
    const src = prevSets.find((e) => e.name === (ex.exName || ex.name));
    if (!src) return ex; // in the plan but not in the prior session (e.g. skipped) → keep its pre-fill
    return { ...ex, loggedSets: src.sets, sets: src.sets.length || ex.sets };
  });

  await updateDoc(planRef, { exercises, updatedAt: serverTimestamp() });
}
