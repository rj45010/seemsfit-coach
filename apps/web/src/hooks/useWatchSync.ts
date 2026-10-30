import { useEffect } from 'react';
import { pushWatchContext, type WatchContext } from '@/lib/watchBridge';

/**
 * Pushes the home's already-computed Recovery/Strain/Sleep/steps to the paired Apple
 * Watch whenever they change. Reuses values Today.tsx already derives — no new queries,
 * no Firebase reads. The watch glance then mirrors exactly what the phone shows.
 */
export function useWatchSync(ctx: WatchContext) {
  const { recovery, strain, sleepMin, steps, weightKg, ageYears, sex } = ctx;
  useEffect(() => {
    // Only push once we actually have something to show.
    if (recovery == null && strain == null && sleepMin == null && steps == null && weightKg == null) return;
    pushWatchContext({ recovery, strain, sleepMin, steps, weightKg, ageYears, sex });
  }, [recovery, strain, sleepMin, steps, weightKg, ageYears, sex]);
}
