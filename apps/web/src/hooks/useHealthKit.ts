import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { useAuth } from './useAuth';
import { useSyncGoals } from './useGoals';
import { healthKitSupported, requestHealthAccess, syncHealthKit } from '@/lib/healthkit';
import { requestWorkoutShare } from '@/lib/healthWorkouts';

/** Invalidate everything a Health sync can touch so the UI repaints. */
function useRefreshAfterSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const syncGoals = useSyncGoals();
  return useCallback(() => {
    if (!user) return;
    qc.invalidateQueries({ queryKey: ['metrics-today', user.uid] });
    qc.invalidateQueries({ queryKey: ['metrics', user.uid] });
    qc.invalidateQueries({ queryKey: ['workouts', user.uid] });
    qc.invalidateQueries({ queryKey: ['workouts-recent', user.uid] });
    qc.invalidateQueries({ queryKey: ['workouts-inf', user.uid] });
    void syncGoals();
  }, [qc, user, syncGoals]);
}

/**
 * Keeps today's metrics + workouts in sync with Apple HealthKit on iOS: requests
 * access once, syncs on mount, and re-syncs on every foreground. No-op on web.
 */
export function useHealthKitSync() {
  const { user } = useAuth();
  const refresh = useRefreshAfterSync();
  const asked = useRef(false);

  useEffect(() => {
    if (!user || !healthKitSupported()) return;
    let cancelled = false;

    const run = async () => {
      if (!asked.current) {
        asked.current = true;
        try { await requestHealthAccess(); } catch { /* Capgo read auth may throw — don't block share */ }
      }
      // Decoupled + idempotent: ensures the write/delete prompt fires even if the read request
      // above failed, and re-attempts each foreground until the user has been asked.
      await requestWorkoutShare();
      try {
        const r = await syncHealthKit(user.uid);
        if (!cancelled && (r.metricsWrote || r.workoutsAdded > 0 || (r.workoutsRemoved ?? 0) > 0)) refresh();
      } catch {
        /* HealthKit unavailable/denied — Today falls back to last complete day. */
      }
    };

    run();
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) run();
    });
    return () => {
      cancelled = true;
      handle.then((h) => h.remove());
    };
  }, [user, refresh]);
}

/**
 * Returns a one-shot sync callback for pull-to-refresh. Re-prompts for access
 * (in case it was never granted), syncs, and refreshes the UI. Safe on web (no-op).
 */
export function useHealthSyncNow() {
  const { user } = useAuth();
  const refresh = useRefreshAfterSync();
  return useCallback(async () => {
    if (!user || !healthKitSupported()) return;
    try {
      await requestHealthAccess();
      await requestWorkoutShare();
      const r = await syncHealthKit(user.uid);
      if (r.metricsWrote || r.workoutsAdded > 0 || (r.workoutsRemoved ?? 0) > 0) refresh();
    } catch {
      /* ignore — pull-to-refresh still invalidates queries */
    }
  }, [user, refresh]);
}
