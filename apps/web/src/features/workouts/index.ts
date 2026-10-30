// Public API for the workouts feature. Import workouts data via this barrel.
// (Slice A = data layer; components move in a later slice.)

// Data hooks
export {
  useLogActivity,
  useUpdateWorkout,
  useDeleteWorkout,
  useWorkouts,
  useWorkoutsInfinite,
  useWorkoutsPeriod,
  useRecentWorkouts,
  useWorkout,
} from './api/useWorkouts';
export { useOneRepMax } from './api/useOneRepMax';
export { useReconcileStrengthWorkouts } from './api/useReconcileWorkouts';
export { planStrengthMerges } from './lib/mergeWorkouts';
export { workoutKeys } from './api/keys';

// Schemas (shared validation) + constants
export {
  activityDraftSchema,
  workoutLoadPatchSchema,
  exerciseSetsSchema,
  exerciseSetEntrySchema,
  WORKOUT_CATEGORIES,
  FEELS,
} from './schemas/workout.schema';

// Types
export type {
  ActivityDraft,
  WorkoutLoadPatch,
  Workout,
  WorkoutCategory,
  ExerciseSets,
  ExerciseSetEntry,
  Segment,
  ActivityFormat,
  OneRepMax,
} from './types';
