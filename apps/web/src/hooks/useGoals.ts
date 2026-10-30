import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { syncGoalProgress } from '@/lib/goalProgress';
import { celebrate } from '@/lib/celebrate';
import type { Goal } from '@/lib/types';

/** Recompute goal progress from logged data; celebrate any just completed. Call after logs. */
export function useSyncGoals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!user) return;
    try {
      const done = await syncGoalProgress(user.uid);
      qc.invalidateQueries({ queryKey: ['goals', user.uid] });
      if (done.length) celebrate('Goal!', `Completed · ${done.join(', ')}`);
    } catch {
      /* non-fatal */
    }
  }, [user, qc]);
}

export function useGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['goals', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<Goal[]> => {
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/goals`)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
    },
  });
}

export function useGoalMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['goals', user?.uid] });

  const create = useMutation({
    mutationFn: async (g: Omit<Goal, 'id'>) => {
      const ref = await addDoc(collection(db, `users/${user!.uid}/goals`), {
        ...g,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Goal> & { id: string }) => {
      await updateDoc(doc(db, `users/${user!.uid}/goals/${id}`), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `users/${user!.uid}/goals/${id}`));
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
