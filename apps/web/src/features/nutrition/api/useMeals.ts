import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { burst } from '@/lib/burst';
import { tapSuccess } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { useSyncGoals } from '@/hooks/useGoals';
import { toDate } from '@/lib/date';
import { mealDraftSchema, mealEntrySchema, type MealDraft } from '../schemas/meal.schema';
import type { DayNutrition, MealEntry, TrendDay } from '../types';
import { mealKeys } from './keys';

/** Validate a raw Firestore doc at the edge; drop (and warn) if it doesn't fit the schema. */
function parseMeal(raw: unknown): MealEntry | null {
  const res = mealEntrySchema.safeParse(raw);
  if (res.success) return res.data as MealEntry;
  if (import.meta.env.DEV) console.warn('[nutrition] dropped malformed meal doc', res.error.issues);
  return null;
}

/** Meals for one day (sorted by time in JS — avoids a composite index). */
export function useMealsForDate(dateKey: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: mealKeys.day(user?.uid, dateKey),
    enabled: !!user && !!dateKey,
    queryFn: async (): Promise<MealEntry[]> => {
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/meals`), where('date', '==', dateKey)));
      return snap.docs
        .map((d) => parseMeal({ id: d.id, ...d.data() }))
        .filter((m): m is MealEntry => m != null)
        .sort((a, b) => (toDate(a.createdAt)?.getTime() ?? 0) - (toDate(b.createdAt)?.getTime() ?? 0));
    },
  });
}

/** Log a meal (manual or plan-derived). The draft is validated against the shared schema. */
export function useMealMutation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const syncGoals = useSyncGoals();
  return useMutation({
    mutationFn: async (draft: MealDraft) => {
      const m = mealDraftSchema.parse(draft); // Zod at the edge, same schema as the AI path
      const date = m.date ?? new Date().toISOString().slice(0, 10);
      // Firestore rejects `undefined` field values, so omit blank macros before writing.
      const clean = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
      await addDoc(collection(db, `users/${user!.uid}/meals`), {
        ...clean,
        date,
        estimated: false,
        source: 'manual',
        createdAt: serverTimestamp(),
      });
      return date;
    },
    onSuccess: (date) => {
      burst();
      tapSuccess();
      qc.invalidateQueries({ queryKey: mealKeys.day(user?.uid, date) });
      qc.invalidateQueries({ queryKey: ['meals-trend', user?.uid] });
      void syncGoals(); // refresh dailyProtein/dailyCalories progress
    },
  });
}

export function useDeleteMeal(dateKey: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `users/${user!.uid}/meals/${id}`));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mealKeys.day(user?.uid, dateKey) });
      qc.invalidateQueries({ queryKey: ['meals-trend', user?.uid] });
    },
  });
}

/** Per-day calories/protein over the last `days` days (for the trend chart). */
export function useNutritionTrend(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: mealKeys.trend(user?.uid, days),
    enabled: !!user,
    queryFn: async (): Promise<TrendDay[]> => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));
      const cutoffKey = cutoff.toISOString().slice(0, 10);
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/meals`), where('date', '>=', cutoffKey)));
      const byDay = new Map<string, TrendDay>();
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        byDay.set(k, { date: k, calories: 0, protein: 0 });
      }
      snap.docs.forEach((docSnap) => {
        const m = parseMeal({ id: docSnap.id, ...docSnap.data() });
        if (!m) return;
        const row = byDay.get(m.date);
        if (row) {
          row.calories += m.calories || 0;
          row.protein += m.protein || 0;
        }
      });
      return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

/** Summed totals for a day's meals. */
export function useDayNutrition(dateKey: string): { totals: DayNutrition; meals: MealEntry[]; isLoading: boolean } {
  const { data, isLoading } = useMealsForDate(dateKey);
  const totals = useMemo<DayNutrition>(() => {
    const meals = data ?? [];
    return {
      calories: meals.reduce((s, m) => s + (m.calories || 0), 0),
      protein: meals.reduce((s, m) => s + (m.protein || 0), 0),
      carbs: meals.reduce((s, m) => s + (m.carbs || 0), 0),
      fat: meals.reduce((s, m) => s + (m.fat || 0), 0),
      count: meals.length,
    };
  }, [data]);
  return { totals, meals: data ?? [], isLoading };
}
