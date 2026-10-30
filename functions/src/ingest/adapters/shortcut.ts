import type { Adapter, NormalizedDaily, NormalizedWorkout } from './types.js';
import { toNum } from './types.js';

/**
 * iOS Shortcut "SeemsFit — Push Vitals" sends a flat dictionary:
 * { date, restingHr, hrv, steps, activeEnergyKcal, sleepMin, vo2Max, weightKg, walkingHrAvg }
 */
export const shortcutAdapter: Adapter = {
  normalizeDaily(payload: unknown): NormalizedDaily | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const date = typeof p.date === 'string' ? p.date : undefined;
    if (!date) return null;

    const hrv = toNum(p.hrv);
    const sleepMin = toNum(p.sleepMin);

    const daily: NormalizedDaily = {
      date,
      source: 'shortcut',
      restingHr: toNum(p.restingHr),
      hrv: hrv != null ? { avg: hrv } : undefined,
      steps: toNum(p.steps),
      activeEnergyKcal: toNum(p.activeEnergyKcal),
      sleep: sleepMin != null ? { totalMin: sleepMin } : undefined,
      vo2Max: toNum(p.vo2Max),
      weightKg: toNum(p.weightKg),
      walkingHrAvg: toNum(p.walkingHrAvg),
      spo2: toNum(p.spo2),
      respiratoryRate: toNum(p.respiratoryRate),
      raw: payload,
    };
    return daily;
  },

  normalizeWorkout(payload: unknown): NormalizedWorkout | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const category = typeof p.type === 'string' ? p.type : (p.category as string) || 'Other';
    return {
      title: typeof p.title === 'string' ? p.title : undefined,
      category,
      duration: toNum(p.duration),
      distance: toNum(p.distance),
      calories: toNum(p.calories),
      avgHr: toNum(p.avgHr),
      maxHr: toNum(p.maxHr),
      customDate: typeof p.date === 'string' ? p.date : undefined,
      isManual: false,
      raw: payload,
    };
  },
};
