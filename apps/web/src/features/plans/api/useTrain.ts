import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { todayKey } from '@/lib/date';
import { updatePRsFromWorkout } from '@/lib/prs';
import { saveWorkoutToHealth } from '@/lib/healthWorkouts';
import { applyAction, type PlanInput } from '@/lib/jarvisActions';
import { useAuth } from '@/hooks/useAuth';
import { usePlans } from './usePlans';
import type { ExerciseSets, Plan, PlanExercise, Program } from '@/lib/types';

const DAY_ORDER: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

export interface ProgramGroup {
  id: string;
  title: string;
  goalType?: string;
  status: 'active' | 'archived';
  days: Plan[];
}

/** Optional program metadata docs (created by Jarvis). Empty for migrated data. */
function useProgramMeta() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['programs', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<Program[]> => {
      const base = `users/${user!.uid}`;
      const snap = await getDocs(query(collection(db, `${base}/programs`)));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);

      // Auto-expire temporary programs: anything past its expiresAt date is deleted
      // (with its sessions). Only programs the AI saved with expiresAt are affected.
      const today = todayKey();
      const expired = all.filter((p) => p.expiresAt && p.expiresAt < today);
      if (expired.length) {
        const batch = writeBatch(db);
        for (const p of expired) {
          const plansSnap = await getDocs(query(collection(db, `${base}/plans`), where('sourceId', '==', p.id)));
          plansSnap.forEach((d) => batch.delete(d.ref));
          batch.delete(doc(db, `${base}/programs/${p.id}`));
        }
        await batch.commit();
        qc.invalidateQueries({ queryKey: ['plans', user!.uid] });
      }
      return all.filter((p) => !(p.expiresAt && p.expiresAt < today));
    },
  });
}

/** Groups plans by sourceId into programs, enriched with any program metadata. */
export function usePrograms() {
  const { data: plans, isLoading } = usePlans();
  const { data: meta } = useProgramMeta();

  const programs = useMemo<ProgramGroup[]>(() => {
    const metaById = new Map((meta ?? []).map((m) => [m.id, m]));
    const byProgram = new Map<string, Plan[]>();
    for (const p of plans ?? []) {
      const key = p.sourceId || p.id;
      if (!byProgram.has(key)) byProgram.set(key, []);
      byProgram.get(key)!.push(p);
    }
    const out: ProgramGroup[] = [];
    for (const [id, days] of byProgram) {
      days.sort((a, b) => (DAY_ORDER[a.day] ?? 9) - (DAY_ORDER[b.day] ?? 9));
      const m = metaById.get(id);
      out.push({
        id,
        title: m?.title ?? days[0].title?.split('·')[0]?.split('—')[0]?.trim() ?? 'Program',
        goalType: m?.goalType,
        status: m?.status ?? 'active',
        days,
      });
    }
    // active first
    return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1));
  }, [plans, meta]);

  return { programs, isLoading };
}

/** Create a program manually (same Firestore write path as the AI's createProgram). */
export function useCreateProgram() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; goalType?: string; plans: PlanInput[] }) => {
      await applyAction(user!.uid, {
        kind: 'createProgram',
        title: input.title,
        goalType: input.goalType,
        summary: '',
        plans: input.plans,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans', user?.uid] });
      qc.invalidateQueries({ queryKey: ['programs', user?.uid] });
    },
  });
}

/** Persist structural edits to a plan's exercises (e.g. superset grouping). */
export function useUpdatePlanExercises() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, exercises }: { planId: string; exercises: PlanExercise[] }) => {
      await updateDoc(doc(db, `users/${user!.uid}/plans/${planId}`), { exercises, updatedAt: serverTimestamp() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans', user?.uid] });
      qc.invalidateQueries({ queryKey: ['plan', user?.uid] });
    },
  });
}

/** Create a logged workout from a planned session. */
export function useLogPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Plan) => {
      const exerciseSets = (plan.exercises ?? []).map((ex) => ({
        name: ex.exName || ex.name,
        supersetId: ex.supersetId ?? null,
        sets: Array.from({ length: Math.max(1, ex.sets || 1) }, () => ({
          weight: '',
          reps: typeof ex.reps === 'number' ? ex.reps : 0,
          isDrop: false,
        })),
      }));
      await addDoc(collection(db, `users/${user!.uid}/workouts`), {
        title: plan.title,
        category: plan.category || 'Strength',
        duration: plan.duration ?? null,
        calories: plan.calories ?? null,
        isManual: true,
        exerciseSets,
        createdAt: serverTimestamp(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts', user?.uid] }),
  });
}

/**
 * Log a planned session with the weights/reps the user actually did, then
 * remember those sets on the plan (`exercises[].loggedSets`) so the next time
 * the day is opened it pre-fills with the last-logged values. Mirrors the
 * mobile "log saved plan" flow.
 */
export function useLogPlanSets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      plan,
      exerciseSets,
    }: {
      plan: Plan;
      exerciseSets: Array<ExerciseSets & { skip?: boolean }>;
    }) => {
      // Keep only sets the user filled in for the logged workout record. Exercises
      // skipped for THIS session are left out of the logged workout entirely.
      const logged = exerciseSets
        .filter((e) => !e.skip)
        .map((e) => ({
          name: e.name,
          supersetId: e.supersetId ?? null,
          sets: e.sets.filter((s) => {
            const hasWeight = s.weight !== '' && s.weight != null;
            const hasReps = s.reps === 'F' || (typeof s.reps === 'number' && s.reps > 0);
            return hasWeight || hasReps;
          }),
        }));
      const workoutRef = await addDoc(collection(db, `users/${user!.uid}/workouts`), {
        title: plan.title,
        category: plan.category || 'Strength',
        duration: plan.duration ?? null,
        calories: plan.calories ?? null,
        isManual: true,
        exerciseSets: logged,
        sourcePlanId: plan.id, // link back to the plan so deleting this workout can revert its pre-fill
        createdAt: serverTimestamp(),
      });

      // Mirror to Apple Health so it shows in Apple Fitness; store the HK UUID so deleting
      // this workout in-app also deletes it from Health. Best-effort, never blocks the log.
      try {
        const end = Date.now();
        const durMin = typeof plan.duration === 'number' ? plan.duration : 0;
        const start = end - (durMin > 0 ? durMin : 45) * 60_000; // fallback ~45 min if untimed
        const uuid = await saveWorkoutToHealth({
          category: plan.category || 'Strength',
          start,
          end,
          calories: typeof plan.calories === 'number' ? plan.calories : undefined,
        });
        if (uuid) await updateDoc(workoutRef, { hkUuid: uuid });
      } catch {
        /* best-effort */
      }

      // Persist entered sets back onto the plan as defaults. A skipped exercise is
      // left exactly as it was (keeps its preloaded sets/reps & superset link) so
      // the schedule is unchanged for next time.
      const exercises = (plan.exercises ?? []).map((ex, i) => {
        const entry = exerciseSets[i];
        if (entry?.skip) return ex;
        const sets = entry?.sets ?? ex.loggedSets ?? [];
        return { ...ex, loggedSets: sets, sets: sets.length || ex.sets };
      });
      await updateDoc(doc(db, `users/${user!.uid}/plans/${plan.id}`), {
        exercises,
        updatedAt: serverTimestamp(),
      });

      // Auto-detect & update PRs from what was actually lifted.
      const newPRs = await updatePRsFromWorkout(user!.uid, logged as ExerciseSets[]);
      return { newPRs };
    },
    onSuccess: () => {
      for (const key of [
        'workouts',
        'workouts-inf',
        'workouts-period',
        'workouts-recent',
        'oneRepMax',
        'plans',
        'plan',
      ]) {
        qc.invalidateQueries({ queryKey: [key, user?.uid] });
      }
    },
  });
}
