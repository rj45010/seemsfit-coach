import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import type { JournalEntry } from '@/lib/types';

/** Journal docs are keyed by YYYY-MM-DD (one per day). */
export function useJournalEntry(dateKey: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['journal', user?.uid, dateKey],
    enabled: !!user && !!dateKey,
    queryFn: async (): Promise<JournalEntry | null> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/journal/${dateKey}`));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as JournalEntry) : null;
    },
  });
}

export function useJournalMutation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<JournalEntry, 'id'>) => {
      await setDoc(
        doc(db, `users/${user!.uid}/journal/${entry.date}`),
        { ...entry, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onSuccess: (_d, entry) =>
      qc.invalidateQueries({ queryKey: ['journal', user?.uid, entry.date] }),
  });
}
