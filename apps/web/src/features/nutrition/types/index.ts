// Logged-meal payload types come from the Zod schema (single source of truth).
export type { MealDraft, MealFormValues, MealFormParsed } from '../schemas/meal.schema';

// MealEntry / MealPlan remain global domain types (used across the app); re-exported
// here so feature code imports them via the feature's public surface.
export type { MealEntry, MealPlan, MealPlanDay, PlannedMeal } from '@/lib/types';

export interface DayNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
}

export interface TrendDay {
  date: string;
  calories: number;
  protein: number;
}
