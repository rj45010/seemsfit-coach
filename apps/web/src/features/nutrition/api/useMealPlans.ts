import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { MealPlan } from '../types';
import { mealKeys } from './keys';

/** Saved meal plans (active first), built by Vyom. */
export function useMealPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: mealKeys.plans(user?.uid),
    enabled: !!user,
    queryFn: async (): Promise<MealPlan[]> => {
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/mealPlans`)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MealPlan).filter((p) => p.status !== 'archived');
    },
  });
}

export function useDeleteMealPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `users/${user!.uid}/mealPlans/${id}`));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.plans(user?.uid) }),
  });
}
