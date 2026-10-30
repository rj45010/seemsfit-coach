// Public API for the nutrition feature. Import nutrition ONLY from here.

// Data hooks
export { useMealsForDate, useMealMutation, useDeleteMeal, useNutritionTrend, useDayNutrition } from './api/useMeals';
export { useMealPlans, useDeleteMealPlan } from './api/useMealPlans';

// Components
export { MealForm } from './components/MealForm';
export { MealRow } from './components/MealRow';
export { MealPlanView } from './components/MealPlanView';

// Schema (shared with the AI logMeal path) + constants
export { mealDraftSchema, mealFormSchema, toMealDraft, MEAL_TYPES } from './schemas/meal.schema';
export { NUTRITION, NUTRITION_RANGES } from './constants/messages';

// Types
export type { MealDraft, MealEntry, DayNutrition, TrendDay, MealPlan, PlannedMeal } from './types';
