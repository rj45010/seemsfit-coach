import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Phone-owned HealthKit workout writes/deletes (native; Capgo's plugin can't do these).
 * Lets SeemsFit sessions appear in Apple Fitness and keeps deletion in sync both ways.
 * See App/HealthWorkoutsBridge.swift.
 */
interface HealthWorkoutsPlugin {
  requestShare(): Promise<{ ok: boolean }>;
  saveWorkout(o: { category: string; start: number; end: number; calories?: number; distanceKm?: number }): Promise<{ uuid?: string }>;
  deleteWorkout(o: { uuid: string }): Promise<{ ok: boolean }>;
  deletedSince(): Promise<{ uuids: string[] }>;
}

const HW = registerPlugin<HealthWorkoutsPlugin>('HealthWorkouts');
const onIOS = () => Capacitor.getPlatform() === 'ios';

/** Ask for workout share (write/delete) access. Safe to call repeatedly. */
export async function requestWorkoutShare(): Promise<void> {
  if (!onIOS()) return;
  try { await HW.requestShare(); } catch { /* denied — writes just no-op */ }
}

/** Write a finished workout to Apple Health; returns its HK UUID (to store on our doc). */
export async function saveWorkoutToHealth(o: {
  category: string; start: number; end: number; calories?: number; distanceKm?: number;
}): Promise<string | undefined> {
  if (!onIOS()) return undefined;
  try {
    const r = await HW.saveWorkout(o);
    return r.uuid || undefined;
  } catch {
    return undefined;
  }
}

/** Delete a workout we wrote to Apple Health, by its HK UUID. */
export async function deleteWorkoutFromHealth(uuid: string): Promise<void> {
  if (!onIOS() || !uuid) return;
  try { await HW.deleteWorkout({ uuid }); } catch { /* best-effort */ }
}

/** UUIDs of workouts deleted from Apple Health since the last call (empty on first run). */
export async function deletedWorkoutUuidsSince(): Promise<string[]> {
  if (!onIOS()) return [];
  try {
    const r = await HW.deletedSince();
    return r.uuids ?? [];
  } catch {
    return [];
  }
}
