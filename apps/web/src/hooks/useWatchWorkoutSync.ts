import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updatePRsFromWorkout } from '@/lib/prs';
import { drainPendingWatchWorkouts, onWatchWorkout, type WatchWorkoutPayload } from '@/lib/watchBridge';
import { saveWorkoutToHealth } from '@/lib/healthWorkouts';
import { dateKey } from '@/lib/date';
import { getDeletedWorkoutIds } from '@/lib/deletedWorkouts';
import { useAuth } from './useAuth';
import type { ExerciseSets, ExerciseSetEntry, WorkoutCategory, Plan } from '@/lib/types';

const CATEGORIES = new Set<WorkoutCategory>([
  'Strength', 'Running', 'Cycling', 'Walking', 'Hiking', 'Swimming', 'HIIT', 'Yoga', 'Core', 'Other',
]);

/** ISO start → "20250627T143045" for a deterministic, idempotent doc id. */
function compactStamp(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15);
}

function toExerciseSets(payload: WatchWorkoutPayload): ExerciseSets[] {
  return payload.exercises
    .map((ex) => ({
      name: ex.name,
      supersetId: ex.supersetId != null ? String(ex.supersetId) : null,
      sets: ex.sets.map((s): ExerciseSetEntry => ({
        weight: s.weight,
        reps: s.reps === -1 ? 'F' : s.reps,
        isDrop: s.isDrop,
        ...(s.bodyweight ? { bodyweight: true } : {}),
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
      })),
    }))
    .filter((e) => e.name && e.sets.length);
}

/**
 * Writes one watch-recorded workout to Firestore. Deterministic `wkt_<stamp>` id makes
 * re-drains idempotent. source:'watch' is a non-appleHealth doc, so the HealthKit sync's
 * ±30-min dedup skips creating a duplicate `ahk_*` for the same session.
 */
async function commitWatchWorkout(uid: string, p: WatchWorkoutPayload, deleted: Set<string>) {
  const id = `wkt_${compactStamp(p.startDate)}`;
  if (deleted.has(id)) return; // user deleted this workout — never recreate it

  const category = (CATEGORIES.has(p.category as WorkoutCategory) ? p.category : 'Other') as WorkoutCategory;
  const exerciseSets = toExerciseSets(p);
  const rpes = exerciseSets.flatMap((e) => e.sets.map((s) => s.rpe).filter((r): r is number => r != null));
  const effort = rpes.length ? Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length) : undefined;

  const data: Record<string, unknown> = {
    category,
    source: 'watch',
    duration: Math.round(p.durationSec / 60) || undefined,
    customDate: dateKey(new Date(p.startDate * 1000)),
    createdAt: Timestamp.fromDate(new Date(p.startDate * 1000)),
    updatedAt: serverTimestamp(),
  };
  if (p.activeEnergyKcal > 0) data.calories = Math.round(p.activeEnergyKcal);
  if (p.distanceMeters > 0) data.distance = Math.round((p.distanceMeters / 1000) * 100) / 100;
  if (p.avgHr > 0) data.avgHr = Math.round(p.avgHr);
  if (effort != null) data.effort = effort;
  if (exerciseSets.length) data.exerciseSets = exerciseSets;

  await setDoc(doc(db, `users/${uid}/workouts/${id}`), data, { merge: true });
  if (exerciseSets.length) await updatePRsFromWorkout(uid, exerciseSets);

  // Mirror the session into Apple Health so it shows in Apple Fitness. The PHONE writes it
  // (so the phone owns it and can delete it later). Idempotent: skip if a re-drain already
  // wrote it. Best-effort — never block the saved doc.
  try {
    const existing = await getDoc(doc(db, `users/${uid}/workouts/${id}`));
    if (!existing.data()?.hkUuid) {
      const uuid = await saveWorkoutToHealth({
        category,
        start: p.startDate * 1000,
        end: p.endDate * 1000,
        calories: p.activeEnergyKcal > 0 ? Math.round(p.activeEnergyKcal) : undefined,
        distanceKm: p.distanceMeters > 0 ? p.distanceMeters / 1000 : undefined,
      });
      if (uuid) await setDoc(doc(db, `users/${uid}/workouts/${id}`), { hkUuid: uuid }, { merge: true });
    }
  } catch { /* best-effort */ }

  // Best-effort: write what was lifted back onto the plan as next time's pre-fill, mirroring
  // the phone's own logger. Wrapped so a failure here can never affect the saved workout.
  if (p.planId && exerciseSets.length) {
    try { await updatePlanSeedFromWatch(uid, p.planId, exerciseSets); } catch { /* seed is best-effort */ }
  }
}

/**
 * Update a plan's `loggedSets` (the watch/phone pre-fill seed) from a watch-logged session.
 * Only exercises actually performed are touched — an exercise skipped on the watch never
 * reaches this payload, so it keeps its previous seed, exactly like the phone's logger.
 */
async function updatePlanSeedFromWatch(uid: string, planId: string, exerciseSets: ExerciseSets[]) {
  const ref = doc(db, `users/${uid}/plans/${planId}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const plan = snap.data() as Plan;
  const byName = new Map(exerciseSets.map((e) => [e.name.trim().toLowerCase(), e.sets]));
  let changed = false;
  const exercises = (plan.exercises ?? []).map((ex) => {
    const sets = byName.get(String(ex.name).trim().toLowerCase());
    if (!sets || !sets.length) return ex; // not performed (skipped/absent) -> unchanged
    changed = true;
    return { ...ex, loggedSets: sets, sets: sets.length || ex.sets };
  });
  if (changed) await updateDoc(ref, { exercises, updatedAt: serverTimestamp() });
}

/**
 * Drains workouts the Apple Watch recorded (queued natively while the app was closed)
 * and commits them to Firestore — on mount, when a live "watchWorkout" ping arrives,
 * and whenever `trigger` changes (e.g. app returns to foreground).
 */
export function useWatchWorkoutSync(trigger?: unknown) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const drain = useCallback(async () => {
    if (!user) return;
    const pending = await drainPendingWatchWorkouts();
    if (!pending.length) return;
    const deleted = await getDeletedWorkoutIds(user.uid);
    for (const p of pending) {
      try { await commitWatchWorkout(user.uid, p, deleted); } catch { /* keep going on a bad payload */ }
    }
    for (const key of ['workouts', 'workouts-inf', 'workouts-period', 'workouts-recent', 'oneRepMax']) {
      qc.invalidateQueries({ queryKey: [key, user.uid] });
    }
  }, [user, qc]);

  useEffect(() => { void drain(); }, [drain, trigger]);
  useEffect(() => onWatchWorkout(() => { void drain(); }), [drain]);
}
