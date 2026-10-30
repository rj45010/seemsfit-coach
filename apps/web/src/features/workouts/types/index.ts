// Log-payload types come from the Zod schema (single source of truth).
export type { ActivityDraft, WorkoutLoadPatch } from '../schemas/workout.schema';

// Global domain types re-exported via the feature's public surface.
export type {
  Workout,
  WorkoutCategory,
  ExerciseSets,
  ExerciseSetEntry,
  Segment,
  ActivityFormat,
  OneRepMax,
} from '@/lib/types';
