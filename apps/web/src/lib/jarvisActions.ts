import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { fmtDate, todayKey } from './date';
import { db } from './firebase';
import { mealDraftSchema } from '@/features/nutrition';
import { updatePRsFromWorkout } from './prs';
import type { ExerciseSetEntry, ExerciseSets, GoalCategory, PlanExercise, Rating, WorkoutCategory } from './types';

export interface ExerciseInput {
  name: string;
  exName?: string;
  sets: number;
  reps: number | string;
  supersetId?: string | null;
}
export interface PlanInput {
  title: string;
  day: string;
  category: string;
  duration: number;
  calories?: number;
  exercises?: ExerciseInput[];
}

interface SegmentInput {
  order: number;
  kind: 'run' | 'station' | 'rest';
  label?: string;
  distanceM?: number;
  durationSec?: number;
  reps?: number;
  weightKg?: number;
  pace?: string;
}

interface WorkoutInput {
  category: WorkoutCategory;
  title?: string;
  sport?: string; // any sport: "Cricket", "Padel"…
  date?: string; // yyyy-MM-dd, defaults to today
  durationMin?: number;
  distanceKm?: number;
  calories?: number;
  pace?: string;
  notes?: string;
  effort?: number; // RPE 1-10
  feel?: 'great' | 'good' | 'ok' | 'rough';
  format?: 'standard' | 'intervals' | 'hyrox' | 'circuit' | 'emom' | 'amrap';
  segments?: SegmentInput[]; // intervals / HYROX stations / circuit rounds
  // strength sessions
  exerciseSets?: Array<{
    name: string;
    sets: Array<{ weight: string | number; reps: number | 'F'; isDrop?: boolean; rpe?: number; bodyweight?: boolean }>;
  }>;
}

interface JournalInput {
  date?: string; // yyyy-MM-dd, defaults to today
  mood?: Rating;
  energy?: Rating;
  soreness?: Rating;
  stress?: Rating;
  sleepQuality?: Rating;
  notes?: string;
}

/** Surgical edits to a plan's exercise list — untouched exercises keep their loggedSets. */
export type ExerciseOp =
  | { op: 'add'; exercise: ExerciseInput }
  | { op: 'remove'; name: string }
  | { op: 'replace'; name: string; exercise: ExerciseInput }
  | { op: 'update'; name: string; sets?: number; reps?: number | string };

export type ProposedAction =
  | { kind: 'createProgram'; title: string; goalType?: string; summary: string; plans: PlanInput[]; expiresAt?: string }
  | {
      kind: 'updatePlan';
      planId: string;
      summary: string;
      patch?: Partial<Pick<PlanInput, 'title' | 'day' | 'category' | 'duration'>>;
      exerciseOps?: ExerciseOp[];
    }
  | { kind: 'archiveProgram'; sourceId: string; summary: string }
  | { kind: 'deleteProgram'; sourceId: string; summary: string }
  | {
      kind: 'updateProgram';
      sourceId: string;
      summary: string;
      patch: { title?: string; goalType?: string; status?: 'active' | 'archived' };
    }
  | {
      kind: 'createGoal';
      summary: string;
      goal: {
        title: string;
        category: GoalCategory;
        metric: string;
        target: number;
        current?: number;
        unit: string;
        targetDate?: string;
      };
    }
  | { kind: 'logWorkout'; summary: string; workout: WorkoutInput }
  | { kind: 'logJournal'; summary: string; entry: JournalInput }
  | { kind: 'logWeight'; summary: string; weightKg: number; bodyFatPct?: number; date?: string }
  | { kind: 'logSleep'; summary: string; totalMin: number; date?: string; bedtime?: string; quality?: number; start?: string; end?: string }
  | { kind: 'remember'; summary: string; fact: string }
  | {
      kind: 'logMeal';
      summary: string;
      meal: {
        date?: string;
        mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
        name: string;
        calories: number;
        protein?: number;
        carbs?: number;
        fat?: number;
        items?: Array<{ name: string; calories?: number }>;
      };
    }
  | {
      kind: 'logBody';
      summary: string;
      date?: string;
      weightKg?: number;
      bodyFatPct?: number;
      bmi?: number;
      muscleMassKg?: number;
      skeletalMuscleKg?: number;
      visceralFat?: number;
    }
  | {
      kind: 'logLab';
      summary: string;
      lab: {
        reportDate: string;
        lab?: string;
        jarvisSummary?: string;
        markers: Array<{
          name: string;
          value: number;
          unit: string;
          refLow?: number | null;
          refHigh?: number | null;
          flag: 'normal' | 'low' | 'high' | 'critical';
        }>;
      };
    }
  | {
      kind: 'createMealPlan';
      summary: string;
      plan: {
        title: string;
        goalKcal?: number;
        goalProtein?: number;
        note?: string;
        days: Array<{
          name: string;
          meals: Array<{
            name: string;
            time?: string;
            calories: number;
            protein?: number;
            carbs?: number;
            fat?: number;
            recipe?: string;
          }>;
        }>;
      };
    }
  | {
      // Set/update a daily target (upserts the goal by metric — no duplicates)
      kind: 'setTarget';
      summary: string;
      metric: 'dailyProtein' | 'dailyCalories' | 'dailyWalkKm' | 'dailyWater' | string;
      target: number;
      unit: string;
      title?: string;
    }
  | {
      // Rewrite today's home-screen daily summary
      kind: 'setInsight';
      summary: string;
      insight: { headline: string; body: string; recommendations?: string[] };
    };

/** Jarvis appends proposed-action JSON after this marker; never shown to the user. */
export const PROPOSAL_SENTINEL = '===PROPOSALS===';

const VALID_KINDS = new Set([
  'createProgram',
  'updatePlan',
  'archiveProgram',
  'deleteProgram',
  'updateProgram',
  'createGoal',
  'logWorkout',
  'logJournal',
  'logWeight',
  'logSleep',
  'logBody',
  'logLab',
  'remember',
  'logMeal',
  'createMealPlan',
  'setTarget',
  'setInsight',
]);

/**
 * Salvage a logMeal action when the model wrote a meal-log confirmation in prose
 * but forgot the ===PROPOSALS=== block (an intermittent model-compliance miss).
 * Parses calories + macros from the reply and uses the user's message for the
 * name, so the log can still happen instead of forcing a resend. Returns null
 * if it can't find calories (then the caller keeps the "didn't save" warning).
 */
export function salvageMealProposal(
  reply: string,
  userMessage: string,
): Extract<ProposedAction, { kind: 'logMeal' }> | null {
  const numBefore = (re: RegExp): number | undefined => {
    const m = reply.match(re);
    if (!m) return undefined;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };
  const calories = numBefore(/([\d,]+(?:\.\d+)?)\s*kcal\b/i);
  if (calories == null || calories <= 0) return null;

  const protein = numBefore(/([\d.]+)\s*g\s*protein\b/i);
  const carbs = numBefore(/([\d.]+)\s*g\s*carbs?\b/i);
  const fat = numBefore(/([\d.]+)\s*g\s*fat\b/i);

  const name =
    userMessage.replace(/^\s*log\s*(?:a\s*)?meal\s*:?\s*/i, '').trim() || 'Meal';

  return {
    kind: 'logMeal',
    summary: `Log meal · ${name} (~${Math.round(calories)} kcal)`,
    meal: {
      name,
      calories: Math.round(calories),
      ...(protein != null ? { protein } : {}),
      ...(carbs != null ? { carbs } : {}),
      ...(fat != null ? { fat } : {}),
    },
  };
}

/** Split a Jarvis reply into prose + validated proposed actions. */
export function extractProposals(text: string): { reply: string; proposals: ProposedAction[] } {
  const idx = text.indexOf(PROPOSAL_SENTINEL);
  if (idx === -1) return { reply: text.trim(), proposals: [] };
  const reply = text.slice(0, idx).trim();
  const json = text.slice(idx + PROPOSAL_SENTINEL.length).trim();
  try {
    const parsed = JSON.parse(json);
    const arr = (Array.isArray(parsed) ? parsed : [parsed]) as ProposedAction[];
    const proposals = arr.filter(
      (a) => a && typeof a === 'object' && VALID_KINDS.has((a as { kind?: string }).kind ?? ''),
    );
    return { reply, proposals };
  } catch {
    return { reply, proposals: [] };
  }
}

const toPlanExercise = (e: ExerciseInput): PlanExercise => ({
  name: e.name,
  exName: e.exName ?? e.name,
  sets: e.sets,
  reps: e.reps,
  done: false,
  supersetId: e.supersetId ?? null,
  loggedSets: [],
});
const toPlanExercises = (ex: ExerciseInput[] = []): PlanExercise[] => ex.map(toPlanExercise);

const nameMatches = (ex: PlanExercise, name: string) => {
  const n = name.trim().toLowerCase();
  return ex.name?.toLowerCase() === n || ex.exName?.toLowerCase() === n;
};

/** Apply exercise ops to a plan's list, preserving loggedSets on untouched/updated exercises. */
function applyExerciseOps(current: PlanExercise[], ops: ExerciseOp[]): PlanExercise[] {
  let list = [...current];
  for (const op of ops) {
    if (op.op === 'add') {
      list.push(toPlanExercise(op.exercise));
    } else if (op.op === 'remove') {
      list = list.filter((ex) => !nameMatches(ex, op.name));
    } else if (op.op === 'replace') {
      list = list.map((ex) => (nameMatches(ex, op.name) ? toPlanExercise(op.exercise) : ex));
    } else if (op.op === 'update') {
      list = list.map((ex) =>
        nameMatches(ex, op.name)
          ? { ...ex, sets: op.sets ?? ex.sets, reps: op.reps ?? ex.reps } // keep loggedSets
          : ex,
      );
    }
  }
  return list;
}

/** One-line human summary for the proposal card. */
export function actionLabel(a: ProposedAction): string {
  switch (a.kind) {
    case 'createProgram':
      return `New program · ${a.title} (${a.plans.length} sessions)${a.expiresAt ? ` · expires ${fmtDate(a.expiresAt, 'd MMMM, yyyy')}` : ''}`;
    case 'updatePlan':
      return 'Update session';
    case 'archiveProgram':
      return 'Archive program';
    case 'deleteProgram':
      return 'Delete program';
    case 'updateProgram':
      return a.patch.title ? `Rename program · ${a.patch.title}` : 'Update program';
    case 'createGoal':
      return `New goal · ${a.goal.title}`;
    case 'logWorkout':
      return `Log workout · ${a.workout.title || a.workout.category}`;
    case 'logJournal':
      return 'Log journal entry';
    case 'logWeight':
      return `Log weight · ${a.weightKg}kg`;
    case 'logSleep':
      return `Log sleep · ${Math.floor(a.totalMin / 60)}h ${a.totalMin % 60}m`;
    case 'logBody':
      return 'Save body composition';
    case 'remember':
      return 'Remember this';
    case 'logLab':
      return `Save lab report · ${a.lab.markers.length} markers`;
    case 'logMeal':
      return `Log meal · ${a.meal.name} (~${a.meal.calories} kcal)`;
    case 'createMealPlan':
      return `Save meal plan · ${a.plan.title}`;
    case 'setTarget':
      return `Set target · ${a.title ?? a.metric} = ${a.target}${a.unit}`;
    case 'setInsight':
      return `Update home summary · ${a.insight.headline}`;
  }
}

/** Apply a proposed action to Firestore, under the user's own auth. */
export async function applyAction(uid: string, a: ProposedAction): Promise<void> {
  const base = `users/${uid}`;
  switch (a.kind) {
    case 'createProgram': {
      const programRef = doc(collection(db, `${base}/programs`));
      const batch = writeBatch(db);
      batch.set(programRef, {
        title: a.title,
        goalType: a.goalType ?? 'hybrid',
        status: 'active',
        ...(a.expiresAt ? { expiresAt: a.expiresAt } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      for (const p of a.plans) {
        const planRef = doc(collection(db, `${base}/plans`));
        batch.set(planRef, {
          title: p.title,
          day: p.day,
          category: p.category,
          duration: p.duration,
          calories: p.calories ?? null,
          exercises: toPlanExercises(p.exercises),
          sourceId: programRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return;
    }
    case 'updatePlan': {
      const ref = doc(db, `${base}/plans/${a.planId}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('plan_not_found');
      const current = (snap.data().exercises ?? []) as PlanExercise[];
      const exercises = a.exerciseOps?.length ? applyExerciseOps(current, a.exerciseOps) : current;
      await updateDoc(ref, {
        ...(a.patch ?? {}),
        exercises,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    case 'archiveProgram': {
      await setDoc(
        doc(db, `${base}/programs/${a.sourceId}`),
        { status: 'archived', updatedAt: serverTimestamp() },
        { merge: true },
      );
      return;
    }
    case 'deleteProgram': {
      // Hard delete: remove the program meta doc AND every plan that links to it
      // (createProgram stamps each plan with sourceId = program id).
      const batch = writeBatch(db);
      const plansSnap = await getDocs(
        query(collection(db, `${base}/plans`), where('sourceId', '==', a.sourceId)),
      );
      plansSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, `${base}/programs/${a.sourceId}`));
      await batch.commit();
      return;
    }
    case 'updateProgram': {
      // The program NAME lives on this meta doc — never inside a day's title.
      // Merge-create so it works whether or not a meta doc already exists.
      await setDoc(
        doc(db, `${base}/programs/${a.sourceId}`),
        { ...a.patch, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return;
    }
    case 'createGoal': {
      await addDoc(collection(db, `${base}/goals`), {
        ...a.goal,
        status: 'active',
        startDate: todayKey(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    case 'logWorkout': {
      const w = a.workout;
      // Date the session: explicit date -> that day; else now.
      const createdAt = w.date ? Timestamp.fromDate(new Date(`${w.date}T12:00:00`)) : serverTimestamp();
      const exerciseSets = (w.exerciseSets ?? []).map((e) => ({
        name: e.name,
        supersetId: null,
        sets: (e.sets ?? []).map((s) => ({
          weight: s.weight ?? '',
          reps: s.reps ?? 0,
          isDrop: s.isDrop ?? false,
          ...(s.rpe != null ? { rpe: s.rpe } : {}),
          ...(s.bodyweight ? { bodyweight: true } : {}),
        })),
      }));
      const docData: Record<string, unknown> = {
        category: w.category,
        isManual: true,
        source: 'jarvis',
        createdAt,
      };
      if (w.title) docData.title = w.title;
      if (w.sport) docData.sport = w.sport;
      if (w.date) docData.customDate = w.date;
      if (w.durationMin != null) docData.duration = w.durationMin;
      if (w.distanceKm != null) docData.distance = w.distanceKm;
      if (w.calories != null) docData.calories = w.calories;
      if (w.pace) docData.pace = w.pace;
      if (w.notes) docData.notes = w.notes;
      if (w.effort != null) docData.effort = w.effort;
      if (w.feel) docData.feel = w.feel;
      if (w.format) docData.format = w.format;
      if (w.segments?.length) docData.segments = w.segments;
      if (exerciseSets.length) docData.exerciseSets = exerciseSets;
      await addDoc(collection(db, `${base}/workouts`), docData);
      if (exerciseSets.length) {
        await updatePRsFromWorkout(uid, exerciseSets as ExerciseSets[]);
        // Mirror the logged sets onto matching exercises in that day's plan(s) so
        // Today's progression suggestions reflect what he just did via Jarvis.
        const wkDate = w.date ? new Date(`${w.date}T12:00:00`) : new Date();
        const weekday = wkDate.toLocaleDateString('en-US', { weekday: 'long' });
        const plansSnap = await getDocs(collection(db, `${base}/plans`));
        if (!plansSnap.empty) {
          const byName = new Map(exerciseSets.map((e) => [e.name.trim().toLowerCase(), e.sets]));
          const batch = writeBatch(db);
          let touched = false;
          for (const pd of plansSnap.docs) {
            const isTrainedDay = (pd.data().day as string) === weekday;
            const exs = (pd.data().exercises ?? []) as PlanExercise[];
            let changed = false;
            const next = exs.map((ex) => {
              const sets = byName.get((ex.exName ?? ex.name ?? '').trim().toLowerCase()) ?? byName.get((ex.name ?? '').trim().toLowerCase());
              if (sets?.length) {
                changed = true;
                // loggedSets = last performance, written wherever this lift appears so EVERY
                // day's suggestion reflects it; only flag "done" on the day he actually trained.
                return { ...ex, loggedSets: sets as ExerciseSetEntry[], done: isTrainedDay ? true : ex.done };
              }
              return ex;
            });
            if (changed) {
              batch.update(pd.ref, { exercises: next, updatedAt: serverTimestamp() });
              touched = true;
            }
          }
          if (touched) await batch.commit();
        }
      }
      return;
    }
    case 'logJournal': {
      const date = a.entry.date ?? todayKey();
      await setDoc(
        doc(db, `${base}/journal/${date}`),
        { ...a.entry, date, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return;
    }
    case 'logWeight': {
      const date = a.date ?? todayKey();
      const patch: Record<string, unknown> = { date, weightKg: a.weightKg, updatedAt: serverTimestamp() };
      if (a.bodyFatPct != null) patch.bodyFatPct = a.bodyFatPct;
      await setDoc(doc(db, `${base}/dailyMetrics/${date}`), patch, { merge: true });
      return;
    }
    case 'logSleep': {
      const date = a.date ?? todayKey();
      // Stored under `manualSleep` (separate from Apple Watch `sleep`) so it never
      // clobbers watch data — recovery only uses it when the watch wasn't worn.
      const manual: Record<string, unknown> = { totalMin: a.totalMin };
      if (a.quality != null) manual.quality = a.quality;
      if (a.bedtime) manual.bedtime = a.bedtime;
      // ISO start/end let a nap the watch missed ADD to the day without double-counting
      // a re-logged night (see combinedSleepMin).
      if (a.start) manual.start = a.start;
      if (a.end) manual.end = a.end;
      await setDoc(
        doc(db, `${base}/dailyMetrics/${date}`),
        { date, manualSleep: manual, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return;
    }
    case 'remember': {
      await setDoc(
        doc(db, `${base}/memory/profile`),
        { facts: arrayUnion({ text: a.fact, at: todayKey() }), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return;
    }
    case 'logBody': {
      const date = a.date ?? todayKey();
      const patch: Record<string, unknown> = { date, updatedAt: serverTimestamp() };
      for (const f of ['weightKg', 'bodyFatPct', 'bmi', 'muscleMassKg', 'skeletalMuscleKg', 'visceralFat'] as const) {
        if (a[f] != null) patch[f] = a[f];
      }
      await setDoc(doc(db, `${base}/dailyMetrics/${date}`), patch, { merge: true });
      return;
    }
    case 'logLab': {
      await addDoc(collection(db, `${base}/labs`), {
        uploadedAt: serverTimestamp(),
        reportDate: a.lab.reportDate,
        lab: a.lab.lab ?? '',
        status: 'reviewed',
        markers: a.lab.markers,
        jarvisSummary: a.lab.jarvisSummary ?? '',
        pdfStoragePath: '', // free route: markers stored, PDF not kept
      });
      return;
    }
    case 'logMeal': {
      // Normalize the model's date: only trust a well-formed YYYY-MM-DD, else today.
      const date = a.meal.date && /^\d{4}-\d{2}-\d{2}$/.test(a.meal.date) ? a.meal.date : todayKey();
      // Hard math guard: calories MUST reconcile with macros (4/4/9 kcal/g).
      // If all macros are present and the stated calories disagree by >20%
      // (or are missing/zero), trust the macro math — meal logs can't be wrong.
      const { protein, carbs, fat } = a.meal;
      const meal = { ...a.meal };
      if (protein != null && carbs != null && fat != null) {
        const fromMacros = Math.round(protein * 4 + carbs * 4 + fat * 9);
        const stated = meal.calories;
        if (!stated || stated <= 0 || Math.abs(stated - fromMacros) / fromMacros > 0.2) {
          meal.calories = fromMacros;
        }
      }
      // Zod at the edge: validate the AI-produced meal against the SAME schema the
      // manual form uses, so both paths write identically-valid data. `items` (the
      // AI-only breakdown) isn't part of the draft, so it's preserved separately.
      const core = mealDraftSchema.parse({
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        mealType: meal.mealType,
        date,
      });
      // Firestore rejects `undefined` — drop blank macros, and only include items when present.
      const clean = Object.fromEntries(Object.entries(core).filter(([, v]) => v !== undefined));
      await addDoc(collection(db, `${base}/meals`), {
        ...clean,
        ...(meal.items ? { items: meal.items } : {}),
        estimated: true,
        source: 'jarvis',
        createdAt: serverTimestamp(),
      });
      return;
    }
    case 'createMealPlan': {
      await addDoc(collection(db, `${base}/mealPlans`), {
        ...a.plan,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    case 'setTarget': {
      // Upsert the goal by metric so targets update in place (no duplicates).
      const snap = await getDocs(query(collection(db, `${base}/goals`), where('metric', '==', a.metric)));
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { target: a.target, unit: a.unit, status: 'active', updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, `${base}/goals`), {
          title: a.title ?? a.metric,
          category: 'habit',
          metric: a.metric,
          target: a.target,
          unit: a.unit,
          startDate: todayKey(),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return;
    }
    case 'setInsight': {
      await setDoc(
        doc(db, `${base}/insights/${todayKey()}`),
        {
          date: todayKey(),
          headline: a.insight.headline,
          body: a.insight.body,
          recommendations: a.insight.recommendations ?? [],
          generatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }
  }
}
