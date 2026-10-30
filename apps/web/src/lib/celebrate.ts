import { useSyncExternalStore } from 'react';

// App-wide one-shot celebration (reuses the Fin/PR confetti overlay) so a goal
// completed during a background sync can blast from any screen.
export interface Celebration {
  big: string; // headline word(s)
  sub?: string; // small line beneath
}

let current: Celebration | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function celebrate(big: string, sub?: string): void {
  current = { big, sub };
  emit();
}
export function clearCelebration(): void {
  current = null;
  emit();
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
    () => current,
  );
}
