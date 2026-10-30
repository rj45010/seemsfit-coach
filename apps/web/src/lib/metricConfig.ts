import type { DailyMetrics } from './types';

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  digits: number;
  accent: 'pink' | 'mint' | 'lavender' | 'butter' | 'peach' | 'sky';
  /** stroke colour for the line */
  stroke: string;
  /** Plain-language explanation of what the metric measures. */
  desc: string;
  /** Which way is the healthy direction — drives the good/bad read-out. */
  dir: 'up' | 'down' | 'neutral';
  get: (m: DailyMetrics) => number | undefined;
}

export const METRICS: MetricDef[] = [
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm', digits: 0, accent: 'pink', stroke: 'var(--color-sys-pink)', dir: 'down', desc: 'Your heart rate at complete rest. A lower resting HR usually points to better cardiovascular fitness and recovery.', get: (m) => m.restingHr },
  { key: 'hrv', label: 'HRV', unit: 'ms', digits: 0, accent: 'mint', stroke: 'var(--color-sys-green)', dir: 'up', desc: 'Heart-rate variability — how much your heartbeat varies. Higher generally means your body is well recovered and handling stress well.', get: (m) => m.hrv?.avg },
  { key: 'sleep', label: 'Sleep', unit: 'h', digits: 1, accent: 'lavender', stroke: 'var(--color-sys-indigo)', dir: 'up', desc: 'Hours of sleep per night. Most people do best with a steady 7–9 hours.', get: (m) => (m.sleep?.totalMin != null ? m.sleep.totalMin / 60 : undefined) },
  { key: 'steps', label: 'Steps', unit: '', digits: 0, accent: 'sky', stroke: 'var(--color-sys-blue)', dir: 'up', desc: 'Steps taken each day — a simple gauge of how active you are. More movement is generally better.', get: (m) => m.steps },
  { key: 'vo2Max', label: 'VO₂ Max', unit: '', digits: 1, accent: 'butter', stroke: 'var(--color-sys-orange)', dir: 'up', desc: 'An estimate of your aerobic fitness — how well your body uses oxygen. Higher means a stronger engine.', get: (m) => m.vo2Max },
  { key: 'weightKg', label: 'Weight', unit: 'kg', digits: 1, accent: 'peach', stroke: 'var(--color-sys-orange)', dir: 'neutral', desc: 'Body weight. Whether up or down is good depends entirely on your current goal.', get: (m) => m.weightKg },
  { key: 'bodyFatPct', label: 'Body Fat', unit: '%', digits: 1, accent: 'butter', stroke: 'var(--color-sys-orange)', dir: 'down', desc: 'Share of your body made up of fat. Lower usually means leaner, though very low isn’t the goal.', get: (m) => m.bodyFatPct },
  { key: 'bmi', label: 'BMI', unit: '', digits: 1, accent: 'peach', stroke: 'var(--color-sys-orange)', dir: 'neutral', desc: 'Body mass index from height and weight — a rough size gauge; muscle can push it high.', get: (m) => m.bmi },
  { key: 'muscleMassKg', label: 'Muscle', unit: 'kg', digits: 1, accent: 'mint', stroke: 'var(--color-sys-green)', dir: 'up', desc: 'Muscle mass from a body-composition (InBody) report. More is generally better.', get: (m) => m.muscleMassKg },
  { key: 'visceralFat', label: 'Visceral Fat', unit: '', digits: 0, accent: 'pink', stroke: 'var(--color-sys-pink)', dir: 'down', desc: 'Fat around your organs. Lower is healthier; high levels raise metabolic risk.', get: (m) => m.visceralFat },
];

export const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
];
