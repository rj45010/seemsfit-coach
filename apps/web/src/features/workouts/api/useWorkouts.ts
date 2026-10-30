import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { burst } from '@/lib/burst';
import { tapSuccess } from '@/lib/haptics';
import { updatePRsFromWorkout, revertPRsAfterDelete } from '@/lib/prs';
import { recordDeletedWorkout } from '@/lib/deletedWorkouts';
import { deleteWorkoutFromHealth } from '@/lib/healthWorkouts';
import { revertPlanPrefillAfterDelete } from '@/features/plans';
import { useAuth } from '@/hooks/useAuth';
import type { ExerciseSets, Workout, WorkoutCategory } from '@/lib/types';
import {
  activityDraftSchema,
  workoutLoadPatchSchema,
  type ActivityDraft,
  type WorkoutLoadPatch,
} from '../schemas/workout.schema';
import { workoutKeys } from './keys';

export type { ActivityDraft, WorkoutLoadPatch };

/** Manually log any activity — including a strength session with multiple exercises. */
export function useLogActivity() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ActivityDraft) => {
      const d = activityDraftSchema.parse(draft); // Zod at the edge
      const doc: Record<string, unknown> = {
        category: d.category,
        isManual: true,
        source: 'manual',
        // For today's date use the real current time; for a back-dated log we
        // only know the day, so anchor it at noon.
        createdAt:
          d.date && d.date !== new Date().toLocaleDateString('en-CA')
            ? Timestamp.fromDate(new Date(`${d.date}T12:00:00`))
            : serverTimestamp(),
      };
      if (d.date) doc.customDate = d.date;
      if (d.sport) doc.sport = d.sport;
      if (d.durationMin != null) doc.duration = d.durationMin;
      if (d.distanceKm != null) doc.distance = d.distanceKm;
      if (d.calories != null) doc.calories = d.calories;
      if (d.effort != null) doc.effort = d.effort;
      if (d.feel) doc.feel = d.feel;
      if (d.notes) doc.notes = d.notes;
      if (d.exerciseSets?.length) doc.exerciseSets = d.exerciseSets;
      await addDoc(collection(db, `users/${user!.uid}/workouts`), doc);
      // Auto-detect PRs from what was actually lifted.
      if (d.exerciseSets?.length) {
        const newPRs = await updatePRsFromWorkout(user!.uid, d.exerciseSets);
        return { newPRs };
      }
      return { newPRs: [] as string[] };
    },
    onSuccess: () => {
      burst();
      tapSuccess();
      for (const key of ['workouts', 'workouts-inf', 'workouts-period', 'workouts-recent', 'oneRepMax']) {
        qc.invalidateQueries({ queryKey: [key, user?.uid] });
      }
    },
  });
}

/**
 * Add load / details to an EXISTING workout — typically an Apple-Health workout the
 * watch recorded (`ahk_*`), which arrives with only category/duration/calories. Writes
 * with merge:true so a later HealthKit re-sync (which only owns the metric fields)
 * never clobbers the sets/effort/notes the user enters here. Detects PRs from the sets.
 */
export function useUpdateWorkout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: WorkoutLoadPatch }) => {
      const p = workoutLoadPatchSchema.parse(patch);
      const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (p.title != null) data.title = p.title;
      if (p.exerciseSets != null) data.exerciseSets = p.exerciseSets;
      if (p.effort != null) data.effort = p.effort;
      if (p.feel != null) data.feel = p.feel;
      if (p.notes != null) data.notes = p.notes;
      await setDoc(doc(db, `users/${user!.uid}/workouts/${id}`), data, { merge: true });
      if (p.exerciseSets?.length) {
        const newPRs = await updatePRsFromWorkout(user!.uid, p.exerciseSets);
        return { newPRs };
      }
      return { newPRs: [] as string[] };
    },
    onSuccess: () => {
      for (const key of ['workouts', 'workouts-inf', 'workouts-period', 'workouts-recent', 'workout', 'oneRepMax']) {
        qc.invalidateQueries({ queryKey: [key, user?.uid] });
      }
    },
  });
}

/** Delete a logged workout and refresh the history lists. */
export function useDeleteWorkout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const uid = user!.uid;
      // Read the doc first: we need its sets (to revert PRs), its plan link (to revert
      // pre-fill), and its Health UUID (to delete from Apple Health).
      const snap = await getDoc(doc(db, `users/${uid}/workouts/${id}`));
      const data = snap.data() ?? {};
      const exerciseSets = data.exerciseSets as ExerciseSets[] | undefined;
      const sourcePlanId = data.sourcePlanId as string | undefined;
      const hkUuid = data.hkUuid as string | undefined;

      // If we wrote this workout to Apple Health, delete it there too (best-effort).
      if (hkUuid) {
        try {
          await deleteWorkoutFromHealth(hkUuid);
        } catch {
          /* best-effort */
        }
      }

      await deleteDoc(doc(db, `users/${uid}/workouts/${id}`));
      // Tombstone it so the watch / HealthKit importers never re-create this id.
      await recordDeletedWorkout(uid, id);

      // Revert any PR this session had set (recompute from remaining workouts).
      if (exerciseSets?.length) {
        try {
          await revertPRsAfterDelete(uid, exerciseSets);
        } catch {
          /* non-fatal */
        }
      }
      // Revert the source plan's pre-fill to the previous session (or its defaults).
      if (sourcePlanId) {
        try {
          await revertPlanPrefillAfterDelete(uid, sourcePlanId, id);
        } catch {
          /* non-fatal */
        }
      }
    },
    onSuccess: () => {
      for (const key of ['workouts', 'workouts-inf', 'workouts-period', 'workouts-recent', 'oneRepMax', 'plans', 'plan']) {
        qc.invalidateQueries({ queryKey: [key, user?.uid] });
      }
    },
  });
}

export function useWorkouts(max = 100) {
  const { user } = useAuth();
  return useQuery({
    queryKey: workoutKeys.list(user?.uid, max),
    enabled: !!user,
    queryFn: async (): Promise<Workout[]> => {
      const q = query(collection(db, `users/${user!.uid}/workouts`), orderBy('createdAt', 'desc'), fbLimit(max));
      const snap = await getDocs(q);
      // Reads are lenient casts (not Zod-validated): workout docs are highly
      // heterogeneous (manual / watch / HAE / migrated, with route/segments), so a
      // strict schema would risk dropping real historical sessions.
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workout);
    },
  });
}

const PAGE = 40;

/**
 * Cursor-paginated workout history. Loads PAGE at a time (newest first); call
 * fetchNextPage to pull older batches. Optional category filter is applied
 * server-side. Cost per page is constant regardless of total history size.
 */
export function useWorkoutsInfinite(cats: WorkoutCategory[] | null, enabled = true) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: workoutKeys.infinite(user?.uid, cats),
    enabled: !!user && enabled,
    initialPageParam: null as QueryDocumentSnapshot | null,
    queryFn: async ({ pageParam }) => {
      const constraints: QueryConstraint[] = [];
      if (cats && cats.length) constraints.push(where('category', 'in', cats));
      constraints.push(orderBy('createdAt', 'desc'), fbLimit(PAGE));
      if (pageParam) constraints.push(startAfter(pageParam));
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/workouts`), ...constraints));
      return {
        workouts: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workout),
        last: snap.docs[snap.docs.length - 1] ?? null,
        count: snap.docs.length,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.count === PAGE ? lastPage.last : undefined),
  });
}

/**
 * All workouts within a year (and optional month), filtered by category server-side.
 * Bounded result set (a year of training), so no pagination needed.
 */
export function useWorkoutsPeriod(cats: WorkoutCategory[] | null, year: number | null, month: number | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: workoutKeys.period(user?.uid, cats, year, month),
    enabled: !!user && year != null,
    queryFn: async (): Promise<Workout[]> => {
      const start = new Date(year!, month ?? 0, 1);
      const end = month != null ? new Date(year!, month + 1, 1) : new Date(year! + 1, 0, 1);
      const constraints: QueryConstraint[] = [];
      if (cats && cats.length) constraints.push(where('category', 'in', cats));
      constraints.push(
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<', Timestamp.fromDate(end)),
        orderBy('createdAt', 'desc'),
        fbLimit(1000),
      );
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/workouts`), ...constraints));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workout);
    },
  });
}

/** All workouts in the last N days (for training-load / ACWR). */
export function useRecentWorkouts(days = 28) {
  const { user } = useAuth();
  return useQuery({
    queryKey: workoutKeys.recent(user?.uid, days),
    enabled: !!user,
    queryFn: async (): Promise<Workout[]> => {
      const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
      const q = query(
        collection(db, `users/${user!.uid}/workouts`),
        where('createdAt', '>=', since),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workout);
    },
  });
}

export function useWorkout(id: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: workoutKeys.one(user?.uid, id),
    enabled: !!user && !!id,
    // Open instantly: if the tapped workout is already in a cached list (history/recent/infinite),
    // show it immediately and refetch fresh in the background — no network wait for the detail.
    initialData: (): Workout | undefined => {
      if (!id) return undefined;
      for (const [, data] of qc.getQueriesData<unknown>({})) {
        let list: Workout[] | undefined;
        if (Array.isArray(data)) list = data as Workout[];
        else if (data && typeof data === 'object' && 'pages' in data) {
          list = (data as { pages: Workout[][] }).pages?.flat?.();
        }
        const hit = list?.find?.((w) => w?.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
    initialDataUpdatedAt: 0, // treat the seed as stale so fresh data still loads behind it
    queryFn: async (): Promise<Workout | null> => {
      const ref = doc(db, `users/${user!.uid}/workouts/${id}`);
      const snap = await getDoc(ref);
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Workout) : null;
    },
  });
}
