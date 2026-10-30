import type { WorkoutCategory } from '@/lib/types';

/**
 * React Query key factory for workouts. Shapes are kept identical to the legacy
 * hooks so existing cross-invalidations (watch sync, plan logging, PRs) keep matching.
 */
export const workoutKeys = {
  list: (uid: string | undefined, max: number) => ['workouts', uid, max] as const,
  infinite: (uid: string | undefined, cats: WorkoutCategory[] | null) =>
    ['workouts-inf', uid, cats?.join(',') ?? 'all'] as const,
  period: (uid: string | undefined, cats: WorkoutCategory[] | null, year: number | null, month: number | null) =>
    ['workouts-period', uid, cats?.join(',') ?? 'all', year, month] as const,
  recent: (uid: string | undefined, days: number) => ['workouts-recent', uid, days] as const,
  one: (uid: string | undefined, id: string | undefined) => ['workout', uid, id] as const,
  oneRepMax: (uid: string | undefined) => ['oneRepMax', uid] as const,
};
