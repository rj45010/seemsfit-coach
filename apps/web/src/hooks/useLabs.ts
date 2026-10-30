import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import type { Lab } from '@/lib/types';

export function useLabs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['labs', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<Lab[]> => {
      const q = query(
        collection(db, `users/${user!.uid}/labs`),
        orderBy('reportDate', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lab);
    },
  });
}

export function useLab(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lab', user?.uid, id],
    enabled: !!user && !!id,
    queryFn: async (): Promise<Lab | null> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/labs/${id}`));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Lab) : null;
    },
  });
}
