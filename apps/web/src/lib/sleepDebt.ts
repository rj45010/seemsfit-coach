import type { DailyMetrics } from './types';
import { combinedSleepMin } from './sleep';

export interface SleepDebt {
  debtMin: number; // sleep owed over the window, in minutes (>= 0)
  nights: number; // nights with data counted
  targetMin: number;
  confident: boolean; // >= 3 nights of data — else don't show a misleading number
}

const NIGHTS = 7;
const MAX_PAYBACK_PER_NIGHT = 60; // one long lie-in can't wipe a whole rough week

/** A day's total sleep = Apple Watch night + any manually-logged nap, de-duplicated
 *  (a separate nap adds, a re-logged night doesn't). Null when the day has no data. */
const nightMinutes = (m: DailyMetrics): number | null => combinedSleepMin(m);

/**
 * Rolling sleep debt over the last 7 nights that have data: Σ(target − slept).
 * Pure DURATION — quality lives in the recovery score, never double-counted here.
 * Manually-logged naps count toward a night's total. A surplus night pays debt
 * down but is capped per night so it can't erase a week of deficit. Floors at 0.
 * Nights with no data are skipped (never counted as 0h, which would fake huge debt).
 */
export function sleepDebt(metrics: DailyMetrics[], targetMin = 480): SleepDebt | null {
  const nights = metrics
    .filter((m) => nightMinutes(m) != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, NIGHTS);
  if (!nights.length) return null;

  let debt = 0;
  for (const m of nights) {
    const delta = targetMin - nightMinutes(m)!; // +ve = short, -ve = surplus
    debt += delta < 0 ? Math.max(delta, -MAX_PAYBACK_PER_NIGHT) : delta;
  }
  return {
    debtMin: Math.max(0, Math.round(debt)),
    nights: nights.length,
    targetMin,
    confident: nights.length >= 3,
  };
}
