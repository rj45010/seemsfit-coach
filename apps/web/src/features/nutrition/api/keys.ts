/**
 * React Query key factory for nutrition. Key shapes are kept identical to the
 * legacy hooks so existing invalidations elsewhere (e.g. jarvis meal logging)
 * keep matching.
 */
export const mealKeys = {
  day: (uid: string | undefined, date: string) => ['meals', uid, date] as const,
  trend: (uid: string | undefined, days: number) => ['meals-trend', uid, days] as const,
  plans: (uid: string | undefined) => ['mealPlans', uid] as const,
};
