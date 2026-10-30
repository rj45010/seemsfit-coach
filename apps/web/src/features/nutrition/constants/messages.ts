/** All user-facing copy + magic numbers for the nutrition feature (no magic strings in JSX). */
export const NUTRITION = {
  page: { eyebrow: 'Fuel', title: 'Nutrition' },
  tabs: { today: 'Today', plan: 'Plan' },
  actions: {
    logWithVyom: 'Log with Vyom',
    manual: 'Manual',
    add: 'Add',
    adding: 'Saving…',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete meal',
    deleting: 'Deleting…',
    setTargets: 'Set targets',
    targets: 'Targets',
    askMealPlan: 'Ask Vyom for a meal plan',
    log: 'Log',
  },
  form: {
    heading: 'Add a meal',
    namePlaceholder: 'Name (e.g. Chicken rice bowl)',
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    kcal: 'kcal',
    grams: 'g',
    pShort: 'P (g)',
    cShort: 'C (g)',
    fShort: 'F (g)',
  },
  targets: {
    heading: 'Daily targets',
    calories: 'Daily calories',
    protein: 'Daily protein',
    caloriesPlaceholder: 'Calories',
    proteinPlaceholder: 'Protein',
  },
  totals: { label: (n: number) => `Total · ${n} meals`, meals: 'meals' },
  empty: {
    noMeals: { title: 'No meals logged', hint: 'Snap a photo in Vyom or add one manually.' },
    noPlan: {
      title: 'No meal plan yet',
      hint: 'Ask Vyom to build one — it saves here with recipes and one-tap logging.',
    },
  },
  today: {
    eyebrow: 'Nutrition · today',
    none: 'You haven’t logged any meals today. Tap “Log a meal” to add one.',
  },
  trend: { heading: 'Calories · last 14 days' },
  errors: {
    nameRequired: 'Name is required',
    needCaloriesOrMacros: 'Enter calories or at least one macro',
    invalidNumber: 'Enter a valid number',
    saveFailed: 'Couldn’t save that meal. Please try again.',
  },
  jarvisSeeds: {
    logMeal: 'Log a meal: ',
    buildPlan: 'Build me a meal plan — ',
    adjustPlan: 'Adjust my meal plan — ',
  },
} as const;

/** Number-picker ranges + trend window (magic numbers extracted). */
export const NUTRITION_RANGES = {
  kcal: { min: 0, max: 2000, step: 10 },
  grams: { min: 0, max: 300, step: 5 },
  targetKcal: { min: 1000, max: 4000, step: 10 },
  targetPro: { min: 30, max: 400, step: 5 },
  trendDays: 14,
} as const;
