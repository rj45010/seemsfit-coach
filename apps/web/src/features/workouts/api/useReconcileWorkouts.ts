import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { recordDeletedWorkout } from '@/lib/deletedWorkouts';
import { useAuth } from '@/hooks/useAuth';
import { planStrengthMerges } from '../lib/mergeWorkouts';
import { useRecentWorkouts } from './useWorkouts';

/**
 * Auto-merge duplicate strength sessions logged on BOTH a tracked source (Apple Watch / Apple
 * Health) and the phone (e.g. the watch recorded HR/calories, but you typed the weights/reps on the
 * phone). Keeps the phone log's weights, grafts the tracked session's metrics in, removes the tracked
 * doc, and tombstones its id so a later Health/watch sync never re-creates it.
 *
 * Runs once per session once workouts have loaded — client-side under the user's own auth, so it
 * cleans up existing duplicates on next open and every future one. No-op when there's nothing to
 * merge (and idempotent: a merged pair leaves only the phone doc, so it never re-fires). Self-fetches
 * recent workouts so it can be mounted app-wide (not just on the tab that happens to load them).
 */
export function useReconcileStrengthWorkouts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: workouts } = useRecentWorkouts(14);
  const done = useRef(false);

  useEffect(() => {
    if (!user || !workouts || done.current) return;
    const ops = planStrengthMerges(workouts);
    if (!ops.length) return;
    done.current = true;

    (async () => {
      let merged = 0;
      for (const op of ops) {
        try {
          await setDoc(doc(db, `users/${user.uid}/workouts/${op.keepId}`), op.patch, { merge: true });
          await deleteDoc(doc(db, `users/${user.uid}/workouts/${op.dropId}`));
          // Tombstone the dropped id so the HealthKit / watch importer never re-creates it
          // (deterministic ids `wkt_*` / `ahk_*`; the ±30-min overlap guard alone can miss it
          // when the weights are typed well after the session).
          await recordDeletedWorkout(user.uid, op.dropId);
          merged++;
        } catch {
          done.current = false; // let a later render retry if a write failed
        }
      }
      if (merged) {
        qc.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('workout'),
        });
      }
    })();
  }, [user, workouts, qc]);
}
