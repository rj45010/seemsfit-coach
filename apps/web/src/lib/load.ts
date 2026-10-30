import { toDate } from './date';
import type { Workout } from './types';

/**
 * Training load via session-RPE (duration × effort) — a well-established metric.
 * Acute = last 7 days, chronic = 28-day weekly average, ACWR = acute/chronic
 * (the acute:chronic workload ratio; >1.5 flags spiking injury risk).
 */

export type LoadBand = 'low' | 'optimal' | 'high' | 'none';

export interface LoadStats {
  weekLoad: number; // acute (last 7d)
  acwr: number | null;
  band: LoadBand;
  byDay: Array<{ date: string; load: number }>; // last 7 days
}

const sessionLoad = (w: Workout): number => {
  const dur = w.duration ?? 0;
  if (!dur) return 0;
  // effort 1-10; default ~5 (moderate) when not recorded
  return dur * (w.effort ?? 5);
};

const dayKey = (w: Workout): string | null => {
  if (w.customDate) return w.customDate.slice(0, 10);
  const d = toDate(w.createdAt);
  return d ? d.toISOString().slice(0, 10) : null;
};

export function computeLoad(workouts: Workout[], asOf = new Date()): LoadStats {
  const now = asOf.getTime();
  const DAY = 86_400_000;

  let acute = 0; // last 7d
  let chronic28 = 0; // last 28d
  const dayMap = new Map<string, number>();

  for (const w of workouts) {
    const k = dayKey(w);
    if (!k) continue;
    const t = new Date(`${k}T12:00:00`).getTime();
    const ageDays = (now - t) / DAY;
    const load = sessionLoad(w);
    if (ageDays >= 0 && ageDays < 28) chronic28 += load;
    if (ageDays >= 0 && ageDays < 7) {
      acute += load;
      dayMap.set(k, (dayMap.get(k) ?? 0) + load);
    }
  }

  const chronicWeekly = chronic28 / 4;
  const acwr = chronicWeekly > 0 ? acute / chronicWeekly : null;
  let band: LoadBand = 'none';
  if (acwr != null) {
    band = acwr > 1.5 ? 'high' : acwr < 0.8 ? 'low' : 'optimal';
  }

  // last 7 days, oldest→newest
  const byDay: Array<{ date: string; load: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    byDay.push({ date: d, load: Math.round(dayMap.get(d) ?? 0) });
  }

  return { weekLoad: Math.round(acute), acwr: acwr != null ? Math.round(acwr * 100) / 100 : null, band, byDay };
}

export const BAND_LABEL: Record<LoadBand, string> = {
  low: 'Detraining',
  optimal: 'Optimal',
  high: 'Spiking — ease back',
  none: 'Building baseline',
};
