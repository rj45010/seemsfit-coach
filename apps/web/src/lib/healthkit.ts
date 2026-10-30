import { Capacitor } from '@capacitor/core';
import { Health, type HealthDataType, type WorkoutType } from '@capgo/capacitor-health';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { readVO2Max } from './vo2max';
import { deletedWorkoutUuidsSince } from './healthWorkouts';
import { todayKey, toDate } from './date';
import { getDeletedWorkoutIds, recordDeletedWorkout } from './deletedWorkouts';
import type { WorkoutCategory } from './types';

/**
 * Live Apple HealthKit sync (iOS / Capacitor only). Reads today's activity +
 * vitals straight from HealthKit and merges them into dailyMetrics/{today} with
 * source 'appleHealth' — the same schema the HAE zip importer writes, so the
 * Today screen, recovery and strain all light up for TODAY without a manual
 * export. No-op on web (the web build keeps working unchanged).
 *
 * Merge semantics ({ merge: true }) mean this never clobbers manual logs, water,
 * or a richer HAE import — it only fills the live fields it owns.
 */

const READ_TYPES: HealthDataType[] = [
  'steps',
  'calories', // active energy
  'exerciseTime',
  'distance',
  'flightsClimbed',
  'restingHeartRate',
  'heartRateVariability',
  'respiratoryRate',
  'oxygenSaturation',
  'weight',
  'bodyFat',
  'sleep',
  'workouts',
];

/** Map HealthKit workout types → our coarse workout categories. */
const WORKOUT_CATEGORY: Partial<Record<WorkoutType, WorkoutCategory>> = {
  running: 'Running',
  runningTreadmill: 'Running',
  walking: 'Walking',
  hiking: 'Hiking',
  cycling: 'Cycling',
  bikingStationary: 'Cycling',
  swimming: 'Swimming',
  swimmingPool: 'Swimming',
  swimmingOpenWater: 'Swimming',
  traditionalStrengthTraining: 'Strength',
  functionalStrengthTraining: 'Strength',
  strengthTraining: 'Strength',
  weightlifting: 'Strength',
  highIntensityIntervalTraining: 'HIIT',
  yoga: 'Yoga',
  coreTraining: 'Core',
};
const mapCategory = (t: WorkoutType): WorkoutCategory => WORKOUT_CATEGORY[t] ?? 'Other';

const KCAL_PER = 1; // calories type already reports kilocalories on iOS

export function healthKitSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** Prompt once for read access. Safe to call repeatedly (iOS only shows it once). */
export async function requestHealthAccess(): Promise<boolean> {
  if (!healthKitSupported()) return false;
  const avail = await Health.isAvailable();
  if (!avail.available) return false;
  await Health.requestAuthorization({ read: READ_TYPES });
  return true;
}

const drop = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Sum an aggregated metric across today (one 'day' bucket). */
async function sumToday(dataType: HealthDataType): Promise<number | undefined> {
  try {
    const res = await Health.queryAggregated({
      dataType,
      startDate: startOfTodayISO(),
      endDate: new Date().toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });
    const v = res.samples.reduce((s, b) => s + (b.value ?? 0), 0);
    return res.samples.length ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Most recent single sample value for a vital (last reading, any time today/recent). */
async function latest(dataType: HealthDataType, sinceMs = 7 * 86_400_000): Promise<number | undefined> {
  try {
    const res = await Health.readSamples({
      dataType,
      startDate: new Date(Date.now() - sinceMs).toISOString(),
      endDate: new Date().toISOString(),
      limit: 1,
      ascending: false,
    });
    return res.samples[0]?.value;
  } catch {
    return undefined;
  }
}

type SleepSample = { startDate: string; endDate: string; sleepState?: string };
type SleepStages = { deep: number; rem: number; core: number; awake: number };

/**
 * Minutes covered by the UNION of these samples' intervals. Multiple sources
 * (watch stages + an "asleep" summary, phone, third-party apps) report
 * overlapping intervals for the SAME night — summing double-counts, so we merge
 * overlaps and total only the covered time.
 */
function unionMinutes(samples: SleepSample[]): number {
  const intervals = samples
    .map((s) => [new Date(s.startDate).getTime(), new Date(s.endDate).getTime()] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  if (!intervals.length) return 0;
  let totalMs = 0;
  let [curStart, curEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else { totalMs += curEnd - curStart; curStart = s; curEnd = e; }
  }
  totalMs += curEnd - curStart;
  return Math.round(totalMs / 60_000);
}

// Asleep samples ≥ 3h apart belong to different nights, so we cluster by gap and
// pick ONE session — the main night — never summing across nights.
const SESSION_GAP_MS = 3 * 3600_000;
// A real night is at least this long; below it we treat a session as a nap/fragment.
const MAIN_SLEEP_MIN = 180; // 3h

interface SleepCluster { start: number; end: number; samples: SleepSample[] }

/**
 * Split sleep samples into per-night clusters (gap > 3h starts a new night), each
 * carrying its own start/end and the stage+awake samples that fall inside it.
 */
function clusterSessions(samples: SleepSample[]): SleepCluster[] {
  const asleep = samples
    .filter((x) => x.sleepState && ['deep', 'rem', 'light', 'asleep'].includes(x.sleepState))
    .map((x) => ({ s: new Date(x.startDate).getTime(), e: new Date(x.endDate).getTime() }))
    .filter((i) => i.e > i.s)
    .sort((a, b) => a.s - b.s);
  if (!asleep.length) return [];

  // Build [start,end] windows, breaking on a > 3h gap between asleep intervals.
  const windows: Array<{ start: number; end: number }> = [];
  let start = asleep[0].s;
  let end = asleep[0].e;
  for (let i = 1; i < asleep.length; i++) {
    if (asleep[i].s - end > SESSION_GAP_MS) {
      windows.push({ start, end });
      start = asleep[i].s;
    }
    end = Math.max(end, asleep[i].e);
  }
  windows.push({ start, end });

  // Attach every sample (stages + awake) that falls inside each window (small margin
  // for boundary stage samples that begin a touch before the asleep cluster).
  return windows.map((w) => ({
    start: w.start,
    end: w.end,
    samples: samples.filter((x) => {
      const t = new Date(x.startDate).getTime();
      return t >= w.start - 30 * 60_000 && t <= w.end;
    }),
  }));
}

/** Apple "Time Asleep" for a cluster = union of staged sleep (deep+rem+core), or the
 *  broad 'asleep' block when no stages exist. Excludes Awake, matching the Health app. */
function clusterAsleepMin(c: SleepCluster): number {
  const of = (...states: string[]) => c.samples.filter((x) => x.sleepState && states.includes(x.sleepState));
  const staged = of('deep', 'rem', 'light');
  return staged.length ? unionMinutes(staged) : unionMinutes(of('asleep'));
}

/**
 * The main night's sleep — de-duplicated total + per-stage breakdown, plus the
 * bed-time/wake timestamps, picking ONE session so a shifting read window or a
 * daytime nap can't replace the real night. We choose the MOST RECENT session that's
 * a genuine night (≥ 3h); if none qualifies, the longest session in the window.
 * Returns undefined if no sleep recorded.
 */
async function lastNightSleep(): Promise<{ totalMin: number; stages: SleepStages; start?: string; end?: string } | undefined> {
  try {
    const res = await Health.readSamples({
      dataType: 'sleep',
      startDate: new Date(Date.now() - 40 * 3600_000).toISOString(), // wide enough to hold last night all day
      endDate: new Date().toISOString(),
      limit: 800,
      ascending: true,
    });
    const clusters = clusterSessions(res.samples as SleepSample[]);
    if (!clusters.length) return undefined;

    // Most recent genuine night (≥3h), else the single longest session in the window.
    const withMin = clusters.map((c) => ({ c, min: clusterAsleepMin(c) }));
    const recentNight = [...withMin].reverse().find((x) => x.min >= MAIN_SLEEP_MIN);
    const chosen = recentNight ?? withMin.reduce((a, b) => (b.min > a.min ? b : a));
    if (chosen.min <= 0) return undefined;

    const of = (...states: string[]) => chosen.c.samples.filter((x) => x.sleepState && states.includes(x.sleepState));
    const stages: SleepStages = {
      deep: unionMinutes(of('deep')),
      rem: unionMinutes(of('rem')),
      core: unionMinutes(of('light')),
      awake: unionMinutes(of('awake')),
    };
    return {
      totalMin: chosen.min,
      stages,
      start: new Date(chosen.c.start).toISOString(),
      end: new Date(chosen.c.end).toISOString(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Read today's HealthKit data and merge into dailyMetrics/{today}.
 * Returns true if a write happened. Silent no-op on web / when unavailable.
 */
export async function syncTodayFromHealthKit(uid: string): Promise<boolean> {
  if (!healthKitSupported()) return false;
  const avail = await Health.isAvailable();
  if (!avail.available) return false;

  const [
    steps,
    activeKcal,
    exerciseMin,
    distanceM,
    flights,
    restingHr,
    hrv,
    respiratoryRate,
    spo2,
    weightKg,
    bodyFatRaw,
    sleep,
    vo2Max,
  ] = await Promise.all([
    sumToday('steps'),
    sumToday('calories'),
    sumToday('exerciseTime'),
    sumToday('distance'),
    sumToday('flightsClimbed'),
    latest('restingHeartRate'),
    latest('heartRateVariability'),
    latest('respiratoryRate'),
    latest('oxygenSaturation'),
    latest('weight'),
    latest('bodyFat'),
    lastNightSleep(),
    readVO2Max(), // native read — Capgo doesn't expose vo2Max
  ]);

  const date = todayKey();
  const patch = drop({
    date,
    source: 'appleHealth',
    steps: steps != null ? Math.round(steps) : undefined,
    activeEnergyKcal: activeKcal != null ? Math.round(activeKcal * KCAL_PER) : undefined,
    exerciseMin: exerciseMin != null ? Math.round(exerciseMin) : undefined,
    distanceKm: distanceM != null ? Math.round((distanceM / 1000) * 100) / 100 : undefined,
    flightsClimbed: flights != null ? Math.round(flights) : undefined,
    restingHr: restingHr != null ? Math.round(restingHr) : undefined,
    respiratoryRate: respiratoryRate != null ? Math.round(respiratoryRate * 10) / 10 : undefined,
    // oxygenSaturation comes back 0–1 (fraction) or already a percent depending on
    // the source; normalise to a percent.
    spo2: spo2 != null ? Math.round((spo2 <= 1 ? spo2 * 100 : spo2) * 10) / 10 : undefined,
    weightKg: weightKg != null ? Math.round(weightKg * 10) / 10 : undefined,
    // bodyFat fraction (0–1) → percent.
    bodyFatPct: bodyFatRaw != null ? Math.round((bodyFatRaw <= 1 ? bodyFatRaw * 100 : bodyFatRaw) * 10) / 10 : undefined,
    vo2Max: vo2Max != null ? Math.round(vo2Max * 10) / 10 : undefined,
  }) as Record<string, unknown>;

  if (hrv != null) patch.hrv = { avg: Math.round(hrv) };

  // Sleep is attributed to the date Apple Health records it under — the WAKE date
  // (when the night ended), which can differ from today. Stored there, it persists
  // permanently and is only ever replaced by a newer reading for that same night.
  // Sleep is attributed to the WAKE date (when the night ended), which can differ from
  // today. We KEEP any manual entry — double-counting is prevented at read time
  // (combinedSleepMin), so a manual nap the watch missed still adds, while a re-logged
  // night doesn't duplicate.
  const wakeDate = sleep?.end ? sleep.end.slice(0, 10) : date;
  if (sleep && wakeDate === date) patch.sleep = sleep;
  patch.updatedAt = Timestamp.now();

  let wrote = false;
  if (sleep && wakeDate !== date) {
    await setDoc(
      doc(db, `users/${uid}/dailyMetrics/${wakeDate}`),
      drop({ date: wakeDate, source: 'appleHealth', sleep, updatedAt: Timestamp.now() }),
      { merge: true },
    );
    wrote = true;
  }

  // Nothing but bookkeeping keys → skip the today write (but a separate sleep doc may have written).
  const dataKeys = Object.keys(patch).filter((k) => !['date', 'source', 'updatedAt'].includes(k));
  if (!dataKeys.length) return wrote;

  await setDoc(doc(db, `users/${uid}/dailyMetrics/${date}`), patch, { merge: true });
  return true;
}

const compactStamp = (iso: string) => iso.slice(0, 19).replace(/[-:T]/g, '');

/**
 * Import today's Apple Health workouts as Workout docs (source 'appleHealth').
 * Deterministic IDs make repeated syncs idempotent; we skip any that overlap an
 * existing manual/jarvis log of the same category (within 30 min) so a watch
 * workout doesn't duplicate something already logged by hand. Returns # added.
 */
export async function syncTodayWorkouts(uid: string): Promise<number> {
  if (!healthKitSupported()) return 0;
  let res;
  try {
    res = await Health.queryWorkouts({
      startDate: startOfTodayISO(),
      endDate: new Date().toISOString(),
      limit: 50,
    });
  } catch {
    return 0;
  }
  if (!res.workouts?.length) return 0;

  // Recent existing workouts, to avoid duplicating a hand-logged session.
  const snap = await getDocs(
    query(collection(db, `users/${uid}/workouts`), orderBy('createdAt', 'desc'), fbLimit(30)),
  );
  const existing = snap.docs.map((d) => {
    const w = d.data() as { category?: string; source?: string; customDate?: string; createdAt?: unknown };
    const ms = w.customDate ? new Date(w.customDate).getTime() : (toDate(w.createdAt as never)?.getTime() ?? 0);
    return { id: d.id, category: w.category, source: w.source, ms };
  });

  const deleted = await getDeletedWorkoutIds(uid);

  let added = 0;
  for (const w of res.workouts) {
    // Skip workouts recorded by our own SeemsFit app/watch — those arrive (and are deletable)
    // via the watch→phone payload (`wkt_*`). Re-importing them here recreates deleted workouts.
    // Prefix match covers the watch app and any test sessions saved to Health while #6 was on.
    if (w.sourceId?.startsWith('com.seemsfithealth')) continue;

    const category = mapCategory(w.workoutType);
    const startMs = new Date(w.startDate).getTime();
    const id = `ahk_${w.platformId ?? compactStamp(w.startDate)}`;
    if (deleted.has(id)) continue; // user deleted this — never recreate it

    // Skip if a non-appleHealth log of the same category overlaps (±30 min).
    const overlap = existing.some(
      (e) => e.id !== id && e.source !== 'appleHealth' && e.category === category && Math.abs(e.ms - startMs) < 30 * 60_000,
    );
    if (overlap) continue;

    const docData = drop({
      category,
      duration: Math.round(w.duration / 60),
      calories: w.totalEnergyBurned != null ? Math.round(w.totalEnergyBurned) : undefined,
      distance: w.totalDistance != null ? Math.round((w.totalDistance / 1000) * 100) / 100 : undefined,
      source: 'appleHealth',
      customDate: todayKey(),
      createdAt: Timestamp.fromDate(new Date(w.startDate)),
    }) as Record<string, unknown>;

    await setDoc(doc(db, `users/${uid}/workouts/${id}`), docData, { merge: true });
    added++;
  }
  return added;
}

/**
 * Mirror Apple-Health workout deletions into our data: for each workout deleted from Health
 * since the last check, remove the matching Firestore doc and tombstone its id so it never
 * re-imports. Matches both imported workouts (`ahk_<uuid>`) and ones we wrote (doc field
 * `hkUuid`). Returns how many docs were removed.
 */
async function reconcileHealthDeletions(uid: string): Promise<number> {
  const uuids = await deletedWorkoutUuidsSince();
  if (!uuids.length) return 0;

  let removed = 0;
  for (const uuid of uuids) {
    const ids = new Set<string>([`ahk_${uuid}`]); // imported copies are keyed by HK UUID
    try {
      const snap = await getDocs(
        query(collection(db, `users/${uid}/workouts`), where('hkUuid', '==', uuid), fbLimit(5)),
      );
      snap.docs.forEach((d) => ids.add(d.id));
    } catch { /* hkUuid index/field may be absent — the ahk_ id still covers imports */ }

    for (const id of ids) {
      try {
        await deleteDoc(doc(db, `users/${uid}/workouts/${id}`));
        await recordDeletedWorkout(uid, id); // stays deleted — never re-logs on a future sync
        removed++;
      } catch { /* ignore a missing doc */ }
    }
  }
  return removed;
}

export interface HealthSyncResult {
  ok: boolean;
  metricsWrote: boolean;
  workoutsAdded: number;
  workoutsRemoved?: number;
  error?: string;
}

/** Full sync: today's metrics + workouts. Surfaces a result for the UI. */
export async function syncHealthKit(uid: string): Promise<HealthSyncResult> {
  if (!healthKitSupported()) return { ok: false, metricsWrote: false, workoutsAdded: 0, error: 'unsupported' };
  try {
    const avail = await Health.isAvailable();
    if (!avail.available) return { ok: false, metricsWrote: false, workoutsAdded: 0, error: 'unavailable' };
    // Reconcile deletions FIRST, so a workout the user removed from Apple Fitness is tombstoned
    // before the importer runs in the same pass and can't be re-added.
    const workoutsRemoved = await reconcileHealthDeletions(uid);
    const [metricsWrote, workoutsAdded] = await Promise.all([
      syncTodayFromHealthKit(uid),
      syncTodayWorkouts(uid),
    ]);
    return { ok: true, metricsWrote, workoutsAdded, workoutsRemoved };
  } catch (e) {
    return { ok: false, metricsWrote: false, workoutsAdded: 0, error: (e as Error)?.message ?? 'error' };
  }
}
