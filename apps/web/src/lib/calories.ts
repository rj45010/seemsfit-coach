import type { WorkoutCategory } from './types';

/**
 * Our own workout-calorie model — replaces Apple's activeEnergy so the number is consistent
 * across phone and watch, and explainable. Two blended branches:
 *
 *   1. HEART-RATE (preferred): Keytel et al. (2005), a peer-reviewed regression that estimates
 *      energy expenditure from HR + age + weight + sex. Summed per HR sample.
 *   2. MET × RPE (fallback, no HR): a compendium-style MET per activity, scaled by perceived
 *      effort (RPE), × weight × duration — for logged sets/sessions with no HR stream.
 *
 * Both branches return GROSS energy burned DURING the activity (kcal), so they're consistent.
 * Ported 1:1 to Swift on the watch (live HR sessions) — keep the two in sync.
 */

export type Sex = 'male' | 'female' | 'other';

export interface CalorieProfile {
  weightKg: number;
  ageYears: number;
  sex: Sex;
}

/** Base MET per broad activity bucket (moderate effort ≈ RPE 5). */
const BASE_MET: Record<WorkoutCategory, number> = {
  Strength: 5.0,
  Running: 9.0,
  Cycling: 7.0,
  Walking: 3.5,
  Hiking: 6.0,
  Swimming: 7.0,
  HIIT: 8.0,
  Yoga: 3.0,
  Core: 3.8,
  Other: 5.0,
};

/** Whole years from a YYYY-MM-DD birth date (used to derive age for the formula). */
export function ageFromBirthDate(birthDate: string | undefined, now = new Date()): number {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 30; // sane default
  const b = new Date(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return Math.max(10, Math.min(100, age));
}

/** Keytel (2005) kcal/min at a given heart rate. `other` averages the male/female regressions. */
export function keytelKcalPerMin(hr: number, p: CalorieProfile): number {
  const { weightKg: w, ageYears: a } = p;
  const male = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184;
  const female = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184;
  const v = p.sex === 'male' ? male : p.sex === 'female' ? female : (male + female) / 2;
  return Math.max(0, v); // HR near rest can go negative in the regression — floor at 0
}

/**
 * Sum Keytel over a workout's HR samples. Each sample is a bpm reading covering `minutes`
 * (per-minute samples → minutes = 1; a 10 s cadence → minutes = 1/6).
 */
export function caloriesFromHR(samples: { bpm: number; minutes: number }[], p: CalorieProfile): number {
  return samples.reduce((sum, s) => sum + keytelKcalPerMin(s.bpm, p) * s.minutes, 0);
}

/** RPE (1–10) scales the base MET: RPE 5 = base, ~+8%/point, clamped to a sane band. */
export function metForActivity(category: WorkoutCategory, rpe = 5): number {
  const factor = Math.max(0.6, Math.min(1.6, 0.6 + rpe * 0.08));
  return (BASE_MET[category] ?? BASE_MET.Other) * factor;
}

/** MET × RPE fallback → kcal for a session with no HR stream. */
export function caloriesFromMET(
  category: WorkoutCategory,
  rpe: number | undefined,
  durationMin: number,
  p: CalorieProfile,
): number {
  const met = metForActivity(category, rpe ?? 5);
  return (met * 3.5 * p.weightKg) / 200 * Math.max(0, durationMin);
}

/**
 * Estimate a workout's calories: HR (Keytel) when samples exist, else MET × RPE. Whole kcal.
 */
export function estimateWorkoutCalories(input: {
  category: WorkoutCategory;
  rpe?: number;
  durationMin: number;
  hrSamples?: { bpm: number; minutes: number }[];
  profile: CalorieProfile;
}): number {
  const kcal = input.hrSamples && input.hrSamples.length
    ? caloriesFromHR(input.hrSamples, input.profile)
    : caloriesFromMET(input.category, input.rpe, input.durationMin, input.profile);
  return Math.round(kcal);
}

/**
 * Back-compat MET estimate for a manually-logged session (no HR). Returns undefined when we
 * lack the inputs to make a sensible guess. Kept for ActivityForm; delegates to the model above.
 */
export function estimateCalories(opts: {
  category: WorkoutCategory;
  durationMin?: number;
  rpe?: number;
  weightKg?: number | null;
  ageYears?: number;
  sex?: Sex;
}): number | undefined {
  const { category, durationMin, rpe, weightKg } = opts;
  if (!durationMin || durationMin <= 0 || !weightKg || weightKg <= 0) return undefined;
  return Math.round(
    caloriesFromMET(category, rpe, durationMin, {
      weightKg,
      ageYears: opts.ageYears ?? 30,
      sex: opts.sex ?? 'other',
    }),
  );
}
