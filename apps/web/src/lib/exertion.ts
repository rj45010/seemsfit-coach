/**
 * "Exertion" — a 0–100 daily exertion score.
 * We don't have continuous HR (time-in-HR-zone scoring needs it), so this
 * approximates the day's cardiovascular + training load from Apple's active
 * energy + exercise minutes plus logged-workout effort (Σ duration × RPE), via a
 * saturating curve. The 0–100 bound is our own; the underlying
 * session-RPE math is standard sports science.
 */
export interface Exertion {
  value: number; // 0–100
  label: string;
  color: string;
}

// On-theme exertion ramp (green → yellow → orange → red), no blue.
function meta(v: number): { label: string; color: string } {
  if (v < 38) return { label: 'Light', color: 'var(--color-mint)' };
  if (v < 57) return { label: 'Moderate', color: 'var(--color-butter)' };
  if (v < 76) return { label: 'Strenuous', color: 'var(--color-peach)' };
  return { label: 'All-out', color: 'var(--color-pink)' };
}

export function dayExertion(
  today: { activeEnergyKcal?: number; exerciseMin?: number } | null,
  workoutAU: number,
): Exertion {
  const ae = today?.activeEnergyKcal ?? 0;
  const ex = today?.exerciseMin ?? 0;
  const raw = ae * 0.6 + ex * 10 + workoutAU; // proxy exertion units
  const value = Math.round(Math.min(100, 100 * (1 - Math.exp(-raw / 700))));
  return { value, ...meta(value) };
}
