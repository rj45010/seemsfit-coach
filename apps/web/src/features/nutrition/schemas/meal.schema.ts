import { z } from 'zod';
import { NUTRITION } from '../constants/messages';

/** Meal categories. */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Canonical payload to LOG a meal. Single source of truth shared by BOTH paths:
 * the manual form (free tier, via `mealFormSchema`) and the AI `logMeal` action
 * (paid tier). Anything writing a meal validates against this first.
 */
export const mealDraftSchema = z.object({
  name: z.string().trim().min(1, NUTRITION.errors.nameRequired).max(200),
  calories: z.number().int().nonnegative().max(20000),
  protein: z.number().nonnegative().max(2000).optional(),
  carbs: z.number().nonnegative().max(2000).optional(),
  fat: z.number().nonnegative().max(2000).optional(),
  // Resilient to odd AI output: an out-of-enum mealType degrades to undefined
  // rather than throwing and failing the whole logMeal write.
  mealType: z.enum(MEAL_TYPES).optional().catch(undefined),
  date: z.string().regex(DATE_RE).optional(),
});
export type MealDraft = z.infer<typeof mealDraftSchema>;

/** A meal document read back from Firestore — validated at the edge before use. */
export const mealEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  name: z.string(),
  calories: z.number(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  items: z.array(z.object({ name: z.string(), calories: z.number().optional() })).optional(),
  estimated: z.boolean().optional(),
  source: z.enum(['jarvis', 'manual', 'plan']).optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

/**
 * A numeric text input: string in (blank allowed), `number | undefined` out. Keeps
 * the RHF field values as plain strings while validating + coercing via Zod.
 */
const numericField = (max: number, integer = false) =>
  z
    .string()
    .trim()
    .refine(
      (s) =>
        s === '' ||
        (!Number.isNaN(Number(s)) && Number(s) >= 0 && Number(s) <= max && (!integer || Number.isInteger(Number(s)))),
      {
        message: NUTRITION.errors.invalidNumber,
      },
    )
    .transform((s) => (s === '' ? undefined : Number(s)));

/**
 * Form-facing schema for the manual meal form. Inputs arrive as strings; blanks
 * become undefined. At least one of calories/macros is required; calories are
 * derived from macros at submit time when left blank.
 */
export const mealFormSchema = z
  .object({
    name: z.string().trim().min(1, NUTRITION.errors.nameRequired).max(200),
    calories: numericField(20000, true),
    protein: numericField(2000),
    carbs: numericField(2000),
    fat: numericField(2000),
  })
  .refine((v) => v.calories != null || v.protein != null || v.carbs != null || v.fat != null, {
    message: NUTRITION.errors.needCaloriesOrMacros,
    path: ['calories'],
  });

export type MealFormValues = z.input<typeof mealFormSchema>; // all-string field values
export type MealFormParsed = z.output<typeof mealFormSchema>; // coerced numbers

/** Kcal per gram for deriving calories from macros when the user leaves it blank. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Turn validated form values into a canonical MealDraft (deriving calories if blank). */
export function toMealDraft(v: MealFormParsed, date: string): MealDraft {
  const calories =
    v.calories ??
    Math.round(
      (v.protein ?? 0) * KCAL_PER_G.protein + (v.carbs ?? 0) * KCAL_PER_G.carbs + (v.fat ?? 0) * KCAL_PER_G.fat,
    );
  return mealDraftSchema.parse({
    name: v.name.trim(),
    calories,
    protein: v.protein,
    carbs: v.carbs,
    fat: v.fat,
    date,
  });
}
