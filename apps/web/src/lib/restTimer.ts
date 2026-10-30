import { useSyncExternalStore } from 'react';
import { startRestActivity, updateRestActivity, endRestActivity, getRestActivityEndsAt } from './restLiveActivity';

// A single global rest countdown, started after you log a set. Always 2:00.
let duration = 120; // seconds — fixed, not persisted
let endsAt: number | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

// Auto-dismiss the iOS Live Activity when the countdown naturally reaches zero.
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDismiss(at: number) {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => { void endRestActivity(); dismissTimer = null; }, Math.max(0, at - Date.now()) + 500);
}

export function startRest(): void {
  endsAt = Date.now() + duration * 1000;
  void startRestActivity(endsAt); // Dynamic Island + Lock Screen (iOS only)
  scheduleDismiss(endsAt);
  emit();
}

/** ± seconds — adjusts the running countdown AND the session default. */
export function adjustRest(delta: number): void {
  duration = Math.max(15, duration + delta);
  if (endsAt != null) {
    endsAt = Math.max(Date.now(), endsAt + delta * 1000);
    void updateRestActivity(endsAt);
    scheduleDismiss(endsAt);
  }
  emit();
}

export function stopRest(): void {
  endsAt = null;
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  void endRestActivity();
  emit();
}

/**
 * Pull the end time back from the native Live Activity. The ±15s buttons on the iOS
 * Lock Screen adjust the activity natively (while the app is backgrounded), so on
 * return to the foreground we reconcile our countdown to match it.
 */
async function syncFromNative(): Promise<void> {
  if (endsAt == null) return; // only while a rest is running
  const nativeEndsAt = await getRestActivityEndsAt();
  if (nativeEndsAt == null) {
    // The activity was stopped from the Lock Screen / Dynamic Island — skip the rest.
    stopRest();
    return;
  }
  if (Math.abs(nativeEndsAt - endsAt) < 1000) return; // already in sync
  endsAt = nativeEndsAt;
  duration = Math.max(15, Math.round((endsAt - Date.now()) / 1000));
  scheduleDismiss(endsAt);
  emit();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncFromNative();
  });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** Reactive end timestamp (ms) or null when no rest is running. */
export function useRestEndsAt(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => endsAt,
    () => endsAt,
  );
}
