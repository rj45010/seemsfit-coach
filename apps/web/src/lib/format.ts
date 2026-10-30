/** Display formatters — all tolerate undefined and render an em dash. */

const dash = '—';

export function num(v: number | undefined | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return dash;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const bpm = (v?: number | null) => (v == null ? dash : `${Math.round(v)}`);
export const ms = (v?: number | null) => (v == null ? dash : `${Math.round(v)}`); // hrv ms
export const kg = (v?: number | null) => (v == null ? dash : `${num(v, 1)}`);
export const km = (v?: number | null) => (v == null ? dash : `${num(v, 2)}`);
export const kcal = (v?: number | null) => (v == null ? dash : num(v));
export const pct = (v?: number | null) => (v == null ? dash : `${num(v, 1)}%`);

/** minutes -> "1h 24m" / "11m 40s" / "47m" — never rounds up (keeps real seconds) */
export function duration(min?: number | null): string {
  if (min == null || Number.isNaN(min)) return dash;
  const totalSec = Math.round(min * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** total sleep minutes -> "7h 12m" */
export const sleepHrs = (min?: number | null) => duration(min);

export function steps(v?: number | null): string {
  if (v == null) return dash;
  if (v >= 1000) return `${num(v / 1000, 1)}k`;
  return num(v);
}

/** delta with sign, e.g. +4 / -2.1 */
export function delta(v: number, digits = 0): string {
  const s = v > 0 ? '+' : '';
  return `${s}${num(v, digits)}`;
}
