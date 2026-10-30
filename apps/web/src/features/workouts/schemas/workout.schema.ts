import { z } from 'zod';

export const WORKOUT_CATEGORIES = [
  'Strength',
  'Running',
  'Cycling',
  'Walking',
  'Hiking',
  'Swimming',
  'HIIT',
  'Yoga',
  'Core',
  'Other',
] as const;

export const FEELS = ['great', 'good', 'ok', 'rough'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One logged set (weight × reps, optional RPE / drop / bodyweight flags). */
export const exerciseSetEntrySchema = z.object({
  weight: z.union([z.string(), z.number()]),
  reps: z.union([z.number(), z.literal('F')]),
  isDrop: z.boolean(),
  rpe: z.number().min(1).max(10).optional(),
  bodyweight: z.boolean().optional(),
});

/** One exercise with its sets (strength sessions have several). */
export const exerciseSetsSchema = z.object({
  name: z.string().min(1),
  supersetId: z.string().nullable(),
  sets: z.array(exerciseSetEntrySchema),
});

/**
 * Canonical payload to LOG an activity (manual entry). Validated before write so a
 * malformed session can't reach Firestore. The AI `logWorkout` path carries a richer
 * shape (title/segments/route) and is validated separately; this covers the manual
 * form's fields.
 */
export const activityDraftSchema = z.object({
  category: z.enum(WORKOUT_CATEGORIES),
  sport: z.string().optional(),
  date: z.string().regex(DATE_RE).optional(),
  durationMin: z
    .number()
    .nonnegative()
    .max(24 * 60)
    .optional(),
  distanceKm: z.number().nonnegative().max(1000).optional(),
  calories: z.number().nonnegative().max(50000).optional(),
  effort: z.number().int().min(1).max(10).optional(),
  feel: z.enum(FEELS).optional(),
  notes: z.string().optional(),
  exerciseSets: z.array(exerciseSetsSchema).optional(),
});
export type ActivityDraft = z.infer<typeof activityDraftSchema>;

/** Fields you can add/edit on an existing workout (e.g. adding load to a watch import). */
export const workoutLoadPatchSchema = z.object({
  title: z.string().optional(),
  exerciseSets: z.array(exerciseSetsSchema).optional(),
  effort: z.number().int().min(1).max(10).optional(),
  feel: z.enum(FEELS).optional(),
  notes: z.string().optional(),
});
export type WorkoutLoadPatch = z.infer<typeof workoutLoadPatchSchema>;
