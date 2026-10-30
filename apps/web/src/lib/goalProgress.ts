import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { todayKey } from './date';

/**
 * Recomputes `current` for typed goals from logged data, marks any that hit their
 * target as done, and returns the titles of goals just completed (for a celebration).
 * Typed metrics:
 *   runLongestKm | rideLongestKm | swimLongestKm  → longest single session of that type
 *   e1rm:<exercise-slug>                          → best estimated 1RM for that lift
 *   bodyWeightKg                                  → latest logged weight (done within 0.5kg)
 * Untyped goals are left for manual updating.
 */
const DIST_CAT: Record<string, string> = {
  runLongestKm: 'Running',
  rideLongestKm: 'Cycling',
  swimLongestKm: 'Swimming',
};

// Daily targets set in the Nutrition tab / via Jarvis. current = TODAY's logged
// value; they recur each day, so they never auto-complete.
const DAILY = new Set(['dailyProtein', 'dailyCalories', 'dailyWater', 'dailyWalkKm']);

export async function syncGoalProgress(uid: string): Promise<string[]> {
  const base = `users/${uid}`;
  const gSnap = await getDocs(query(collection(db, `${base}/goals`), where('status', '==', 'active')));
  if (gSnap.empty) return [];

  const metrics = gSnap.docs.map((d) => (d.data().metric as string) || '');
  const needDist = metrics.some((m) => m in DIST_CAT);
  const needStr = metrics.some((m) => m.startsWith('e1rm:'));
  const needWt = metrics.some((m) => m === 'bodyWeightKg');
  const needDaily = metrics.some((m) => DAILY.has(m));

  const maxDist: Record<string, number> = {};
  if (needDist) {
    const wSnap = await getDocs(query(collection(db, `${base}/workouts`), orderBy('createdAt', 'desc'), fbLimit(300)));
    for (const w of wSnap.docs.map((d) => d.data())) {
      const cat = w.category as string;
      const dist = Number(w.distance) || 0;
      if (dist > 0) maxDist[cat] = Math.max(maxDist[cat] || 0, dist);
    }
  }

  const orm = new Map<string, number>();
  if (needStr) {
    const oSnap = await getDocs(collection(db, `${base}/oneRepMax`));
    for (const d of oSnap.docs) orm.set(d.id, Number(d.data().orm) || 0);
  }

  let latestWeight: number | undefined;
  if (needWt) {
    const mSnap = await getDocs(query(collection(db, `${base}/dailyMetrics`), orderBy('date', 'desc'), fbLimit(60)));
    for (const d of mSnap.docs) {
      const w = d.data().weightKg;
      if (w != null) {
        latestWeight = Number(w);
        break;
      }
    }
  }

  // Today's totals for the daily targets (protein/calories from meals; water + walk km from today's metrics).
  let dProtein = 0, dCalories = 0, dWater = 0, dWalkKm = 0;
  if (needDaily) {
    const tk = todayKey();
    const meals = await getDocs(query(collection(db, `${base}/meals`), where('date', '==', tk)));
    for (const m of meals.docs.map((d) => d.data())) {
      dCalories += Number(m.calories) || 0;
      dProtein += Number(m.protein) || 0;
    }
    const dm = await getDoc(doc(db, `${base}/dailyMetrics/${tk}`));
    if (dm.exists()) {
      dWater = Number(dm.data().waterGlasses) || 0;
      dWalkKm = Number(dm.data().distanceKm) || 0;
    }
  }

  const batch = writeBatch(db);
  const completed: string[] = [];
  let changed = false;

  for (const gd of gSnap.docs) {
    const g = gd.data();
    const metric = (g.metric as string) || '';
    const target = Number(g.target) || 0;
    const prev = Number(g.current) || 0;
    let current = prev;
    let reached = false;

    if (metric in DIST_CAT) {
      current = Math.round(Math.max(prev, maxDist[DIST_CAT[metric]] || 0) * 100) / 100;
      reached = target > 0 && current >= target;
    } else if (metric.startsWith('e1rm:')) {
      const v = orm.get(metric.slice(5));
      if (v != null) current = Math.round(v * 10) / 10;
      reached = target > 0 && current >= target;
    } else if (metric === 'bodyWeightKg') {
      if (latestWeight != null) current = latestWeight;
      reached = latestWeight != null && Math.abs(latestWeight - target) <= 0.5;
    } else if (metric === 'dailyProtein') {
      current = Math.round(dProtein); // recurring — never auto-completes
    } else if (metric === 'dailyCalories') {
      current = Math.round(dCalories);
    } else if (metric === 'dailyWater') {
      current = dWater;
    } else if (metric === 'dailyWalkKm') {
      current = Math.round(dWalkKm * 100) / 100;
    } else {
      continue; // untyped — manual
    }

    const update: Record<string, unknown> = {};
    if (current !== prev) update.current = current;
    if (reached && g.status !== 'done') {
      update.status = 'done';
      update.completedAt = serverTimestamp();
      completed.push((g.title as string) || 'Goal');
    }
    if (Object.keys(update).length) {
      update.updatedAt = serverTimestamp();
      batch.update(gd.ref, update);
      changed = true;
    }
  }

  if (changed) await batch.commit();
  return completed;
}
