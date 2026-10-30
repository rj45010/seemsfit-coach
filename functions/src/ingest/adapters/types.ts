export interface NormalizedDaily {
  date: string;
  source: 'shortcut' | 'hae';
  restingHr?: number;
  hrv?: { avg: number; samples?: Array<{ t: string; v: number }> };
  steps?: number;
  activeEnergyKcal?: number;
  sleep?: { totalMin: number; stages?: { deep: number; rem: number; core: number; awake: number } };
  vo2Max?: number;
  weightKg?: number;
  bodyFatPct?: number;
  walkingHrAvg?: number;
  spo2?: number;
  respiratoryRate?: number;
  raw: unknown;
}

export interface NormalizedWorkout {
  title?: string;
  category: string;
  duration?: number;
  distance?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  customDate?: string;
  isManual: boolean;
  raw: unknown;
}

export interface Adapter {
  normalizeDaily(payload: unknown): NormalizedDaily | null;
  normalizeWorkout?(payload: unknown): NormalizedWorkout | null;
}

/** Parse a number that may arrive as a string, with optional unit suffix. */
export function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
