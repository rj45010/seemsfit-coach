import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LEGAL_VERSION } from '@/content/legal';
import { useAuth } from './useAuth';

/**
 * Terms & Privacy acceptance, stored per user at users/{uid}/meta/terms.
 * The app is gated (TermsGate) until the user has accepted the CURRENT
 * LEGAL_VERSION — bumping that constant re-prompts everyone on next launch.
 */
const ref = (uid: string) => doc(db, `users/${uid}/meta/terms`);

export function useTermsStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['terms', user?.uid],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async (): Promise<{ accepted: boolean; acceptedVersion: string | null }> => {
      const snap = await getDoc(ref(user!.uid));
      const v = snap.exists() ? (snap.data().acceptedVersion as string | undefined) : undefined;
      return { accepted: v === LEGAL_VERSION, acceptedVersion: v ?? null };
    },
  });
}

export function useAcceptTerms() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await setDoc(
        ref(user!.uid),
        { acceptedVersion: LEGAL_VERSION, acceptedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terms', user?.uid] }),
  });
}
