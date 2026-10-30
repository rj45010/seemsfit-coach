import { useSyncExternalStore } from 'react';

// A one-shot "dust burst" celebration for small positive actions (logged a meal, saved a workout).
// Distinct from the bigger goal `celebrate()` confetti — this is the quick gold shimmer. Any screen
// can fire it; the BurstOverlay (mounted app-wide) plays it. A monotonic token drives replays.
let token = 0;
const subs = new Set<() => void>();

export function burst(): void {
  token += 1;
  subs.forEach((s) => s());
}

export function useBurstToken(): number {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => token,
    () => token,
  );
}
