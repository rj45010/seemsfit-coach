import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { todayKey } from '@/lib/date';
import { generateInsight } from '@/lib/insightGen';
import type { DailyMetrics, Insight } from '@/lib/types';

/** Generate today's insight via the Worker and cache it in insights/{today}. */
export function useGenerateInsight() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await generateInsight(user!.uid);
      if (!res) throw new Error('insight_failed');
      await setDoc(
        doc(db, `users/${user!.uid}/insights/${todayKey()}`),
        { date: todayKey(), ...res.insight, inputsHash: res.inputsHash, generatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insight-today', user?.uid] }),
  });
}

/** Manually log weight (+ optional body fat) into a day's metrics. */
export function useLogWeight() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      weightKg,
      bodyFatPct,
      date,
    }: {
      weightKg: number;
      bodyFatPct?: number;
      date?: string;
    }) => {
      const d = date ?? todayKey();
      const patch: Record<string, unknown> = { date, weightKg, updatedAt: serverTimestamp() };
      patch.date = d;
      if (bodyFatPct != null) patch.bodyFatPct = bodyFatPct;
      await setDoc(doc(db, `users/${user!.uid}/dailyMetrics/${d}`), patch, { merge: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metrics', user?.uid] });
      qc.invalidateQueries({ queryKey: ['metrics-today', user?.uid] });
    },
  });
}

/** Set today's water intake (glasses). Optimistic so +/- feels instant. */
export function useSetWater() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = todayKey();
  return useMutation({
    mutationFn: async (glasses: number) => {
      await setDoc(
        doc(db, `users/${user!.uid}/dailyMetrics/${today}`),
        { date: today, waterGlasses: glasses, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    onMutate: async (glasses) => {
      const key = ['metrics-today', user?.uid];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DailyMetrics | null>(key);
      qc.setQueryData<DailyMetrics | null>(key, (old) =>
        ({ ...(old ?? { id: today, date: today }), waterGlasses: glasses }) as DailyMetrics);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['metrics-today', user?.uid] });
      qc.invalidateQueries({ queryKey: ['metrics', user?.uid] });
    },
  });
}

/** Most recent N daily metric docs, newest first. */
export function useMetricsRange(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['metrics', user?.uid, days],
    enabled: !!user,
    queryFn: async (): Promise<DailyMetrics[]> => {
      const q = query(
        collection(db, `users/${user!.uid}/dailyMetrics`),
        orderBy('date', 'desc'),
        fbLimit(days),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyMetrics);
    },
  });
}

export function useTodayMetrics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['metrics-today', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<DailyMetrics | null> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/dailyMetrics/${todayKey()}`));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyMetrics) : null;
    },
  });
}

export function useTodayInsight() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['insight-today', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<Insight | null> => {
      const snap = await getDoc(doc(db, `users/${user!.uid}/insights/${todayKey()}`));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Insight) : null;
    },
  });
}
