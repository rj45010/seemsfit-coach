import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** The snapshot the watch glance displays. All optional — the watch shows "—" for gaps. */
export interface WatchContext {
  recovery?: number; // 0-100
  strain?: number; // 0-21
  sleepMin?: number; // total sleep minutes
  steps?: number;
  // Calorie-model inputs, vended so the watch computes our kcal (Keytel) on live sessions.
  weightKg?: number;
  ageYears?: number;
  sex?: 'male' | 'female' | 'other';
}

/** A set logged on the watch. reps === -1 means "to failure" (F). weight is kg. */
export interface WatchLoggedSet {
  weight: number;
  reps: number;
  rpe?: number | null;
  isDrop: boolean;
  bodyweight: boolean;
}
export interface WatchLoggedExercise {
  name: string;
  supersetId: number | null;
  sets: WatchLoggedSet[];
}
/** A finished workout the watch recorded, as queued natively for the app to commit. */
export interface WatchWorkoutPayload {
  category: string;
  planId?: string; // the plan/day this came from, so we can update its pre-fill seed
  startDate: number; // epoch seconds
  endDate: number;
  durationSec: number;
  activeEnergyKcal: number;
  distanceMeters: number;
  avgHr: number;
  exercises: WatchLoggedExercise[];
}

/** A workout plan/program sent to the watch so it can show & log it offline. */
export interface WatchPlanSet {
  weight: number;
  reps: number; // -1 = "to failure" (F)
  rpe?: number | null;
  bodyweight: boolean;
}
export interface WatchPlanExercise {
  name: string;
  sets: number; // planned number of sets
  reps: string; // planned reps (may be a range like "8-12")
  supersetId: string | null;
  loggedSets: WatchPlanSet[]; // last time's loads, to pre-fill the wheels
}
/** One day of a program (a Plan on the phone). */
export interface WatchPlan {
  id: string;
  title: string;
  day: string; // weekday
  category: string;
  exercises: WatchPlanExercise[];
}
/** A named program grouping several day-plans. */
export interface WatchProgram {
  id: string;
  title: string;
  days: WatchPlan[];
}

/** Auth the watch needs to call the Jarvis worker + write meals via Firestore REST. */
export interface WatchAuth {
  token: string; // Firebase ID token (~1h)
  uid: string;
  projectId: string;
  jarvisUrl: string;
}

interface WatchBridgePlugin {
  pushContext(ctx: WatchContext): Promise<{ ok: boolean; reason?: string }>;
  pushPlans(opts: { plansJson: string }): Promise<{ ok: boolean; reason?: string }>;
  setAuth(opts: WatchAuth): Promise<{ ok: boolean; reason?: string }>;
  isAvailable(): Promise<{ available: boolean }>;
  drainPendingWorkouts(): Promise<{ workouts: WatchWorkoutPayload[] }>;
  addListener(eventName: 'watchWorkout', listener: () => void): Promise<PluginListenerHandle>;
}

// Native-only plugin (iOS App target). On web/Android this resolves to a stub.
const WatchBridge = registerPlugin<WatchBridgePlugin>('WatchBridge');

/**
 * Push today's computed scores to the paired Apple Watch. No-ops off iOS so callers
 * never have to branch. Failures are swallowed (the watch simply keeps its last value).
 */
export async function pushWatchContext(ctx: WatchContext): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await WatchBridge.pushContext(ctx);
  } catch {
    // No watch paired / not reachable — harmless.
  }
}

/** Vend a fresh Firebase ID token (+ ids) to the watch so it can talk to Jarvis directly. */
export async function pushWatchAuth(a: WatchAuth): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await WatchBridge.setAuth(a);
  } catch {
    // No watch paired / not reachable — harmless.
  }
}

/** Push the user's programs (each with its days) to the watch (JSON; no-op off iOS). */
export async function pushWatchPrograms(programs: WatchProgram[]): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await WatchBridge.pushPlans({ plansJson: JSON.stringify(programs) });
  } catch {
    // No watch paired / not reachable — harmless.
  }
}

/** Pull (and clear) any workouts the watch sent while the app was closed. */
export async function drainPendingWatchWorkouts(): Promise<WatchWorkoutPayload[]> {
  if (Capacitor.getPlatform() !== 'ios') return [];
  try {
    const { workouts } = await WatchBridge.drainPendingWorkouts();
    return workouts ?? [];
  } catch {
    return [];
  }
}

/** Subscribe to live "a watch workout just arrived" pings (app already open). */
export function onWatchWorkout(cb: () => void): () => void {
  if (Capacitor.getPlatform() !== 'ios') return () => {};
  const handle = WatchBridge.addListener('watchWorkout', cb);
  return () => { void handle.then((h) => h.remove()); };
}
