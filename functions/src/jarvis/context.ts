import { createHash } from 'node:crypto';
import { db } from '../shared/firestoreAdmin.js';

interface BuiltContext {
  today: Record<string, unknown> | null;
  last14d: Array<Record<string, unknown>>;
  recentWorkouts: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  recentJournal: Array<Record<string, unknown>>;
  latestLabMarkers: Array<Record<string, unknown>>;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Reads Firestore and builds a capped, JSON-serializable context for Jarvis. */
export async function buildContext(uid: string): Promise<BuiltContext> {
  const base = `users/${uid}`;

  const [metricsSnap, workoutsSnap, goalsSnap, journalSnap, labsSnap] = await Promise.all([
    db.collection(`${base}/dailyMetrics`).orderBy('date', 'desc').limit(14).get(),
    db.collection(`${base}/workouts`).orderBy('createdAt', 'desc').limit(10).get(),
    db.collection(`${base}/goals`).where('status', '==', 'active').limit(10).get(),
    db.collection(`${base}/journal`).orderBy('date', 'desc').limit(5).get(),
    db.collection(`${base}/labs`).orderBy('reportDate', 'desc').limit(1).get(),
  ]);

  const metrics = metricsSnap.docs.map((d) => d.data());
  const today = metrics.find((m) => m.date === todayKey()) ?? null;

  const last14d = metrics.map((m) => ({
    date: m.date,
    restingHr: m.restingHr,
    hrv: m.hrv?.avg,
    sleepMin: m.sleep?.totalMin,
    steps: m.steps,
  }));

  const recentWorkouts = workoutsSnap.docs.map((d) => {
    const w = d.data();
    return {
      date: w.customDate ?? w.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10),
      category: w.category,
      durationMin: w.duration,
      distanceKm: w.distance,
      avgHr: w.avgHr,
    };
  });

  const goals = goalsSnap.docs.map((d) => {
    const g = d.data();
    return {
      title: g.title,
      target: g.target,
      current: g.current,
      unit: g.unit,
      targetDate: g.targetDate,
    };
  });

  const recentJournal = journalSnap.docs.map((d) => {
    const j = d.data();
    return { date: j.date, mood: j.mood, energy: j.energy, soreness: j.soreness, notes: j.notes };
  });

  const latestLabMarkers = labsSnap.empty
    ? []
    : ((labsSnap.docs[0].data().markers as Array<Record<string, unknown>>) ?? [])
        .slice(0, 25)
        .map((m) => ({
          name: m.name,
          value: m.value,
          unit: m.unit,
          flag: m.flag,
          refLow: m.refLow,
          refHigh: m.refHigh,
        }));

  return { today, last14d, recentWorkouts, goals, recentJournal, latestLabMarkers };
}

export function contextToText(ctx: BuiltContext): string {
  return `Here is the user's current data (JSON):\n${JSON.stringify(ctx)}`;
}

export function hashContext(ctx: BuiltContext): string {
  return createHash('sha1').update(JSON.stringify(ctx)).digest('hex');
}
