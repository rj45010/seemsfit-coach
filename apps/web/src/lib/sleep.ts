import type { DailyMetrics } from './types';

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : null);

/**
 * A manual entry's [start, end] in epoch ms, from ISO `start`/`end`, or derived from
 * a "HH:MM" `bedtime` + `totalMin` on the day. Null when there isn't enough to place it.
 */
function manualInterval(m: DailyMetrics): [number, number] | null {
  const man = m.manualSleep;
  if (!man) return null;
  let start = man.start ? ms(man.start) : null;
  if (start == null && man.bedtime && /^\d{1,2}:\d{2}$/.test(man.bedtime)) {
    start = new Date(`${m.date}T${man.bedtime.padStart(5, '0')}:00`).getTime();
  }
  if (start == null) return null;
  const end = man.end ? ms(man.end) : man.totalMin != null ? start + man.totalMin * 60_000 : null;
  if (end == null || end <= start) return null;
  return [start, end];
}

/** Minutes of interval `a` that fall OUTSIDE interval `b` (a minus the overlap). */
function minutesOutside(a: [number, number], b: [number, number]): number {
  const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  return Math.round((a[1] - a[0] - overlap) / 60_000);
}

/**
 * The day's asleep minutes, combining the Apple Watch night with any manual log
 * WITHOUT double-counting. The watch `totalMin` is "time asleep" and is authoritative
 * for its own window. A manual entry is:
 *  - the night itself when the watch wasn't worn (no watch sleep) → use it;
 *  - on a watch night, only the part of the manual range that falls OUTSIDE the watch's
 *    sleep window is added (clip-to-gaps): a separate nap adds fully, an exact re-log
 *    adds nothing, a partial overlap adds only the non-overlapping minutes;
 *  - a manual entry with no usable time, on a watch night → can't be compared, so it's
 *    assumed a duplicate and skipped (never erased).
 */
export function combinedSleepMin(m: DailyMetrics | null | undefined): number | null {
  if (!m) return null;
  const watch = m.sleep?.totalMin ?? null;
  const man = m.manualSleep?.totalMin ?? null;
  if (watch == null && man == null) return null;
  if (watch == null) return man; // no watch night → manual is the night
  if (man == null) return watch; // watch only

  // Both present. A manual entry WITH a known time is treated as a real nap; one with
  // no time is ambiguous on a watch night, so we assume it's a duplicate and keep watch.
  const mi = manualInterval(m);
  if (mi == null) return watch; // no manual time → can't distinguish a re-log → watch wins

  // If the watch night has a window, clip the nap to the gaps outside it (a re-log of
  // the same night adds 0). If the watch night has NO window (older/HAE imports), we
  // can't clip, so add the full nap rather than silently dropping it.
  const ws = ms(m.sleep?.start);
  const we = ms(m.sleep?.end);
  if (ws == null || we == null) return watch + man;
  return watch + minutesOutside(mi, [ws, we]);
}
