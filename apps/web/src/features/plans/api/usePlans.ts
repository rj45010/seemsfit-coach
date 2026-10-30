import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Plan } from '@/lib/types';
import { planKeys } from './keys';

export function usePlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: planKeys.plans(user?.uid),
    enabled: !!user,
    queryFn: async (): Promise<Plan[]> => {
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/plans`)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Plan);
    },
  });
}

export function usePlan(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: planKeys.plan(user?.uid, id),
    enabled: !!user && !!id,
    queryFn: async (): Promise<Plan | null> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/plans/${id}`));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Plan) : null;
    },
  });
}
