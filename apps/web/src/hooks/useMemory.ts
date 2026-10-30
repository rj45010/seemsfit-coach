import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { arrayRemove, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

export interface MemoryFact {
  text: string;
  at?: string;
}
/** Stable baseline Jarvis uses to personalise every answer (programming, macros, norms). */
export interface UserProfile {
  birthDate?: string; // YYYY-MM-DD — age derived from this so it never goes stale
  sex?: 'male' | 'female' | 'other';
  heightCm?: number;
  trainingAge?: string; // e.g. "5 years lifting, 2 running"
  goals?: string; // primary goals in his words
  equipment?: string; // e.g. "full commercial gym + dumbbells at home"
  diet?: string; // prefs/allergies, e.g. "vegetarian, no whey"
}
export interface MemoryProfile {
  instructions: string; // user's standing instructions, applied to every reply
  facts: MemoryFact[]; // durable facts Jarvis has remembered
  profile: UserProfile; // structured baseline
}

export function useMemory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['memory', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<MemoryProfile> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/memory/profile`));
      const d = snap.exists() ? snap.data() : {};
      return {
        instructions: (d.instructions as string) ?? '',
        facts: (d.facts as MemoryFact[]) ?? [],
        profile: (d.profile as UserProfile) ?? {},
      };
    },
  });
}

export function useSaveProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      await setDoc(
        doc(db, `users/${user!.uid}/memory/profile`),
        { profile, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory', user?.uid] }),
  });
}

export function useSaveInstructions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (instructions: string) => {
      await setDoc(
        doc(db, `users/${user!.uid}/memory/profile`),
        { instructions, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory', user?.uid] }),
  });
}

export function useForgetFact() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fact: MemoryFact) => {
      await updateDoc(doc(db, `users/${user!.uid}/memory/profile`), { facts: arrayRemove(fact) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory', user?.uid] }),
  });
}
