import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { OneRepMax } from '@/lib/types';
import { workoutKeys } from './keys';

/** Personal records (estimated 1RM per exercise), best first. */
export function useOneRepMax() {
  const { user } = useAuth();
  return useQuery({
    queryKey: workoutKeys.oneRepMax(user?.uid),
    enabled: !!user,
    queryFn: async (): Promise<OneRepMax[]> => {
      const snap = await getDocs(query(collection(db, `users/${user!.uid}/oneRepMax`)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OneRepMax).sort((a, b) => (b.orm ?? 0) - (a.orm ?? 0));
    },
  });
}
