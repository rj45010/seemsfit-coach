import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from './firebase';
import { queryClient } from './queryClient';
import { todayKey, toDate } from './date';
import { recovery as computeRecovery } from './readiness';
import { combinedSleepMin } from './sleep';
import type { DailyMetrics, TimeLike } from './types';

/** A workout's date as 'yyyy-MM-dd' (prefers manual customDate, falls back to createdAt). */
function workoutDate(customDate: unknown, createdAt: TimeLike): string | null {
  if (typeof customDate === 'string' && customDate) return customDate.slice(0, 10);
  const d = toDate(createdAt);
  return d ? format(d, 'yyyy-MM-dd') : null;
}

/**
 * Builds Jarvis's context from Firestore, client-side (the user is signed in).
 * Capped per the token budget. Returns a compact JSON string.
 */
export async function buildClientContext(uid: string): Promise<string> {
  const base = `users/${uid}`;
  const mealsCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const [metricsSnap, workoutsSnap, goalsSnap, journalSnap, labsSnap, plansSnap, programsSnap, memSnap, mealsSnap, ormSnap, mealPlansSnap] = await Promise.all([
    getDocs(query(collection(db, `${base}/dailyMetrics`), orderBy('date', 'desc'), fbLimit(90))),
    getDocs(query(collection(db, `${base}/workouts`), orderBy('createdAt', 'desc'), fbLimit(10))),
    getDocs(query(collection(db, `${base}/goals`), where('status', '==', 'active'), fbLimit(10))),
    getDocs(query(collection(db, `${base}/journal`), orderBy('date', 'desc'), fbLimit(5))),
    getDocs(query(collection(db, `${base}/labs`), orderBy('reportDate', 'desc'), fbLimit(1))),
    getDocs(query(collection(db, `${base}/plans`))),
    getDocs(query(collection(db, `${base}/programs`))),
    getDoc(doc(db, `${base}/memory/profile`)),
    getDocs(query(collection(db, `${base}/meals`), where('date', '>=', mealsCutoff))),
    getDocs(query(collection(db, `${base}/oneRepMax`))),
    getDocs(query(collection(db, `${base}/mealPlans`))),
  ]);

  // 90 days of metrics: 14 go in full to last14d; all 90 feed weekly trends +
  // latest-vital lookup (so VO2/weight that update monthly are still found).
  const metrics = metricsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyMetrics);
  const today = metrics.find((m) => m.date === todayKey()) ?? null;

  // Computed signals so Jarvis can explain the exact numbers the user sees on Today.
  const recDay = metrics.find((m) => m.hrv?.avg != null) ?? null;
  const memory = memSnap.exists()
    ? ((memSnap.data().facts as Array<{ text: string }> | undefined) ?? []).map((f) => f.text)
    : [];
  const instructions = memSnap.exists() ? (memSnap.data().instructions as string) || '' : '';
  // Structured profile (baseline for programming/macros/norms). Derive age from birthDate.
  const rawProfile = (memSnap.exists() ? memSnap.data().profile : undefined) as Record<string, unknown> | undefined;
  let profile: Record<string, unknown> | null = null;
  if (rawProfile && Object.keys(rawProfile).length) {
    profile = { ...rawProfile };
    const bd = rawProfile.birthDate as string | undefined;
    if (bd) {
      const d = new Date(bd);
      const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000));
      if (age > 0 && age < 120) profile.age = age;
    }
  }

  // Nutrition: per-day totals over the recent window (today first).
  const mealRows = mealsSnap.docs.map((d) => d.data());
  const nutritionByDay = [...new Set(mealRows.map((m) => m.date as string))]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const day = mealRows.filter((m) => m.date === date);
      const sum = (k: string) => day.reduce((s, m) => s + ((m[k] as number) || 0), 0);
      return { date, calories: sum('calories'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), meals: day.length };
    });
  // Explicit TODAY-only totals so the model never sums calories across days when it reports the
  // running daily count after logging a meal. It must add the just-logged meal to THIS, not to the
  // multi-day `nutrition` array below.
  const tKey = todayKey();
  const todayMeals = mealRows.filter((m) => m.date === tKey);
  const sumToday = (k: string) => todayMeals.reduce((s, m) => s + ((m[k] as number) || 0), 0);
  const todayNutrition = {
    date: tKey,
    calories: sumToday('calories'),
    protein: sumToday('protein'),
    carbs: sumToday('carbs'),
    fat: sumToday('fat'),
    meals: todayMeals.length,
  };

  // Recovery (parity with the Today screen): physiology + today's self-report,
  // yesterday's training strain, and yesterday's fuel vs targets.
  const yKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const todayJournalDoc = journalSnap.docs.map((d) => d.data()).find((jj) => jj.date === todayKey());
  const priorStrainAU = workoutsSnap.docs
    .map((d) => d.data())
    .filter((w) => {
      const wd = w.customDate ? String(w.customDate).slice(0, 10) : toDate(w.createdAt)?.toISOString().slice(0, 10);
      return wd === yKey;
    })
    .reduce((s, w) => s + ((w.duration as number) ?? 0) * ((w.effort as number) ?? 5), 0);
  const yMeals = mealRows.filter((m) => m.date === yKey);
  const yNut = {
    calories: yMeals.reduce((s, m) => s + ((m.calories as number) || 0), 0),
    protein: yMeals.reduce((s, m) => s + ((m.protein as number) || 0), 0),
  };
  const goalRows = goalsSnap.docs.map((d) => d.data());
  const calTarget = goalRows.find((g) => g.metric === 'dailyCalories')?.target as number | undefined;
  const proTarget = goalRows.find((g) => g.metric === 'dailyProtein')?.target as number | undefined;
  const walkTarget = goalRows.find((g) => g.metric === 'dailyWalkKm')?.target as number | undefined;
  const waterTarget = goalRows.find((g) => g.metric === 'dailyWater')?.target as number | undefined;
  const recov = computeRecovery(recDay, metrics, {
    journal: todayJournalDoc
      ? { energy: todayJournalDoc.energy, soreness: todayJournalDoc.soreness, mood: todayJournalDoc.mood, stress: todayJournalDoc.stress, ill: todayJournalDoc.ill }
      : undefined,
    priorStrainAU,
    nutrition: calTarget || proTarget ? { calories: yNut.calories, protein: yNut.protein, calTarget, proTarget } : undefined,
  });

  // Most-recent NON-NULL value per vital (today is often partial) — these are the
  // exact numbers shown on the Today screen, so Jarvis never says "not stored".
  const latest = <T,>(f: (m: DailyMetrics) => T | undefined): T | undefined => {
    for (const m of metrics) {
      const v = f(m);
      if (v != null) return v;
    }
    return undefined;
  };
  const latestVitals = {
    restingHr: latest((m) => m.restingHr),
    hrv: latest((m) => m.hrv?.avg),
    vo2Max: latest((m) => m.vo2Max),
    weightKg: latest((m) => m.weightKg),
    bodyFatPct: latest((m) => m.bodyFatPct),
    bmi: latest((m) => m.bmi),
    muscleMassKg: latest((m) => m.muscleMassKg),
    skeletalMuscleKg: latest((m) => m.skeletalMuscleKg),
    visceralFat: latest((m) => m.visceralFat),
    spo2: latest((m) => m.spo2),
    respiratoryRate: latest((m) => m.respiratoryRate),
  };

  // Weekly-averaged trends over ~13 weeks (oldest→newest) so Jarvis sees direction,
  // not just today's value — compact (a dozen rows) to stay within token budget.
  const weeks = new Map<number, { week: string; w: number[]; hrv: number[]; rhr: number[]; vo2: number[] }>();
  const nowMs = Date.now();
  for (const m of metrics) {
    const t = new Date(`${m.date}T12:00:00`).getTime();
    const wi = Math.floor((nowMs - t) / (7 * 86_400_000));
    if (wi < 0 || wi > 12) continue;
    if (!weeks.has(wi)) weeks.set(wi, { week: m.date, w: [], hrv: [], rhr: [], vo2: [] });
    const b = weeks.get(wi)!;
    if (m.weightKg != null) b.w.push(m.weightKg);
    if (m.hrv?.avg != null) b.hrv.push(m.hrv.avg);
    if (m.restingHr != null) b.rhr.push(m.restingHr);
    if (m.vo2Max != null) b.vo2.push(m.vo2Max);
  }
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : undefined);
  const weeklyTrend = [...weeks.entries()]
    .sort((a, b) => b[0] - a[0]) // oldest week first
    .map(([, b]) => ({ weekOf: b.week, weightKg: avg(b.w), hrv: avg(b.hrv), restingHr: avg(b.rhr), vo2Max: avg(b.vo2) }));

  // Personal records: estimated 1RM per lift, with a compact progression trail.
  const prs = ormSnap.docs
    .map((d) => {
      const r = d.data();
      const hist = (Array.isArray(r.history) ? r.history : []) as Array<{ orm?: number; weight?: number; reps?: number; date?: string }>;
      const first = hist[0];
      const recent = hist.slice(-3).map((h) => ({ date: h.date, orm: h.orm, lift: `${h.weight}×${h.reps}` }));
      return {
        exercise: r.exerciseName as string,
        e1rm: r.orm as number,
        best: `${r.weight}×${r.reps}`,
        since: first ? { date: first.date, orm: first.orm } : null,
        recent,
      };
    })
    .sort((a, b) => (b.e1rm ?? 0) - (a.e1rm ?? 0))
    .slice(0, 14);

  const ctx = {
    asOf: format(new Date(), 'EEEE, d MMM yyyy, h:mm a'), // so Jarvis can resolve "Friday", "last week", etc.
    profile, // stable baseline: age (from birthDate), sex, height, training age, goals, equipment, diet
    longTermMemory: memory, // durable facts Jarvis chose to remember (injuries, prefs, context)
    latestVitals, // most-recent non-null vitals + body composition — same numbers shown in the app
    weeklyTrend, // ~13 weeks of weekly-averaged weight/hrv/restingHr/vo2Max (direction over time)
    prs, // estimated 1RM per lift + progression trail (for precise load programming)
    // The ONLY authoritative daily targets — the ones he set in the app. Use THESE
    // for protein/calorie goals, never a meal plan's goalProtein/goalKcal.
    dailyTargets: {
      protein: proTarget ?? null,
      calories: calTarget ?? null,
      walkKm: walkTarget ?? null,
      water: waterTarget ?? null,
    },
    todayNutrition, // TODAY's running totals ONLY — use for "so far today" calorie/macro counts
    nutrition: nutritionByDay, // last few days of calorie/macro totals (per-day; never sum across)
    // Saved meal plans (compact — recipes omitted to save tokens; Jarvis can regenerate them).
    mealPlans: mealPlansSnap.docs
      .map((d) => d.data())
      .filter((p) => p.status !== 'archived')
      .map((p) => ({
        title: p.title,
        goalKcal: p.goalKcal,
        goalProtein: p.goalProtein,
        days: (p.days as Array<{ name: string; meals: Array<{ name: string; calories: number; protein?: number; carbs?: number; fat?: number }> }> | undefined)?.map((day) => ({
          name: day.name,
          meals: (day.meals ?? []).map((m) => ({ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat })),
        })),
      })),
    recovery: recov ? { score: recov.score, band: recov.band, drivers: recov.drivers, confidence: recov.confidence } : null,
    today,
    last14d: metrics.slice(0, 14).map((m) => ({
      date: m.date,
      restingHr: m.restingHr,
      hrv: m.hrv?.avg,
      vo2Max: m.vo2Max,
      weightKg: m.weightKg,
      sleepMin: combinedSleepMin(m) ?? undefined, // watch night + any manual nap, de-duplicated
      steps: m.steps,
      distanceKm: m.distanceKm,
      activeEnergyKcal: m.activeEnergyKcal,
      exerciseMin: m.exerciseMin,
      waterGlasses: m.waterGlasses,
    })),
    recentWorkouts: workoutsSnap.docs.map((d) => {
      const w = d.data();
      const date = workoutDate(w.customDate, w.createdAt);
      return {
        id: d.id,
        date,
        weekday: date ? format(new Date(date), 'EEEE') : null,
        title: w.title ?? null,
        category: w.category,
        sport: w.sport ?? null,
        durationMin: w.duration,
        distanceKm: w.distance,
        calories: w.calories ?? null,
        effort: w.effort ?? null,
        feel: w.feel ?? null,
        notes: w.notes ?? null,
        // full strength detail so Jarvis can discuss exact sets/reps/weights
        exercises: (w.exerciseSets ?? []).map((e: { name: string; sets?: Array<{ weight: unknown; reps: unknown; isDrop?: boolean; rpe?: number; bodyweight?: boolean }> }) => ({
          name: e.name,
          sets: (e.sets ?? []).map((s) => `${s.bodyweight ? `BW(${s.weight}kg)` : s.weight ?? ''}x${s.reps ?? ''}${s.rpe != null ? ` @${s.rpe}` : ''}${s.isDrop ? ' (drop)' : ''}`),
        })),
      };
    }),
    goals: goalsSnap.docs.map((d) => {
      const g = d.data();
      return { id: d.id, title: g.title, target: g.target, current: g.current, unit: g.unit, targetDate: g.targetDate };
    }),
    recentJournal: journalSnap.docs.map((d) => {
      const j = d.data();
      return { date: j.date, mood: j.mood, energy: j.energy, soreness: j.soreness, notes: j.notes };
    }),
    latestLabMarkers: labsSnap.empty
      ? []
      : ((labsSnap.docs[0].data().markers as Array<Record<string, unknown>>) ?? []).slice(0, 25),
    // Programs (the named groups plans belong to via sourceId). The program NAME lives here,
    // not in day titles — so Jarvis renames a program by targeting this sourceId.
    programs: programsSnap.docs.map((d) => {
      const p = d.data();
      return { sourceId: d.id, title: p.title ?? null, status: p.status ?? 'active', goalType: p.goalType ?? null };
    }),
    // Plans with full exercises + last-logged weights, so Jarvis can edit precisely.
    plans: plansSnap.docs.map((d) => {
      const p = d.data();
      return {
        planId: d.id,
        sourceId: p.sourceId,
        title: p.title,
        day: p.day,
        category: p.category,
        exercises: (p.exercises ?? []).map((ex: { name?: string; exName?: string; sets?: unknown; reps?: unknown; supersetId?: string | null; loggedSets?: Array<{ weight: unknown; reps: unknown }> }) => ({
          name: ex.exName || ex.name,
          sets: ex.sets,
          reps: ex.reps,
          supersetId: ex.supersetId ?? null,
          lastLogged: (ex.loggedSets ?? []).map((s) => `${s.weight ?? ''}x${s.reps ?? ''}`),
        })),
      };
    }),
  };

  const prefix = instructions
    ? `STANDING INSTRUCTIONS FROM THE USER — always follow these, they override defaults:\n${instructions}\n\n`
    : '';
  return `${prefix}the user's current data (JSON):\n${JSON.stringify(ctx)}`;
}

/** React Query key for the cached full-context bundle. */
export const jarvisContextKey = (uid: string) => ['jarvis-context', uid] as const;

/**
 * Full context, but cached in React Query so several messages in one chat session
 * don't each re-read ~150 Firestore docs. Any Vyom write (applyAction) or a Health
 * import invalidates ['jarvis-context', uid] so the next turn rebuilds on fresh
 * data; otherwise it self-refreshes after the 60s default staleTime. Uses the app's
 * singleton client, so Chat's `qc.invalidateQueries` hits this exact cache.
 */
export function getClientContext(uid: string): Promise<string> {
  return queryClient.ensureQueryData({
    queryKey: jarvisContextKey(uid),
    queryFn: () => buildClientContext(uid),
  });
}

/**
 * Minimal context for general/definitional questions ("what is RPE?") — just
 * profile + standing instructions, one Firestore read, a fraction of the tokens.
 * Saves free-tier quota when their training/health data isn't needed.
 */
export async function buildSlimContext(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, `users/${uid}/memory/profile`));
  const d = snap.exists() ? snap.data() : {};
  const instructions = (d.instructions as string) || '';
  const rawProfile = d.profile as Record<string, unknown> | undefined;
  let profile: Record<string, unknown> | null = null;
  if (rawProfile && Object.keys(rawProfile).length) {
    profile = { ...rawProfile };
    const bd = rawProfile.birthDate as string | undefined;
    if (bd) {
      const age = Math.floor((Date.now() - new Date(bd).getTime()) / (365.25 * 86_400_000));
      if (age > 0 && age < 120) profile.age = age;
    }
  }
  const prefix = instructions
    ? `STANDING INSTRUCTIONS FROM THE USER — always follow these, they override defaults:\n${instructions}\n\n`
    : '';
  const ctx = {
    asOf: format(new Date(), 'EEEE, d MMM yyyy, h:mm a'),
    profile,
    note: 'General question — their detailed training/health data was intentionally NOT loaded (saves quota). If you need a specific logged number, ask them to rephrase referencing himself (e.g. "how is my VO2 Max").',
  };
  return `${prefix}User (general question — minimal context):\n${JSON.stringify(ctx)}`;
}
