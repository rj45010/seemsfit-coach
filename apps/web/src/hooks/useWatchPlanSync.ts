import { useEffect, useMemo } from 'react';
import { usePrograms } from '@/features/plans';
import { pushWatchPrograms, type WatchPlan, type WatchProgram } from '@/lib/watchBridge';
import type { Plan } from '@/lib/types';

/** Map a Firestore Plan (one day) to the compact shape the watch logs from. */
function toWatchDay(p: Plan): WatchPlan {
  return {
    id: p.id,
    title: p.title,
    day: p.day ?? '',
    category: p.category || 'Strength',
    exercises: (p.exercises ?? []).map((e) => ({
      name: e.name,
      sets: typeof e.sets === 'number' ? e.sets : 0,
      reps: String(e.reps ?? ''),
      supersetId: e.supersetId ?? null,
      loggedSets: (e.loggedSets ?? []).map((s) => ({
        weight: typeof s.weight === 'number' ? s.weight : parseFloat(String(s.weight)) || 0,
        reps: s.reps === 'F' ? -1 : typeof s.reps === 'number' ? s.reps : parseInt(String(s.reps), 10) || 0,
        rpe: s.rpe ?? null,
        bodyweight: !!s.bodyweight,
      })),
    })),
  };
}

/**
 * Pushes the user's programs (each with its days) to the paired Apple Watch whenever they
 * change, so the watch can browse Program → Day and log a session offline. Reuses the
 * existing usePrograms grouping — no extra Firebase reads. No-op off iOS.
 */
export function useWatchPlanSync() {
  const { programs } = usePrograms();
  const payload = useMemo<WatchProgram[]>(
    () =>
      programs
        .filter((g) => g.status !== 'archived')
        .map((g) => ({ id: g.id, title: g.title, days: g.days.map(toWatchDay) })),
    [programs],
  );
  useEffect(() => {
    if (!payload.length) return;
    pushWatchPrograms(payload);
  }, [payload]);
}
