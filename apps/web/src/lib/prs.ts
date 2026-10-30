import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { todayKey } from './date';
import type { ExerciseSets } from './types';

/** Estimated 1RM (Epley). */
export const epley = (weight: number, reps: number) => weight * (1 + reps / 30);

const keyFor = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Best estimated 1RM from a set list (0 if none valid). */
function bestOrm(sets: ExerciseSets['sets'] | undefined): { orm: number; weight: number; reps: number } {
  let out = { orm: 0, weight: 0, reps: 0 };
  for (const s of sets ?? []) {
    const w = typeof s.weight === 'number' ? s.weight : parseFloat(String(s.weight));
    const r = typeof s.reps === 'number' ? s.reps : s.reps === 'F' ? 0 : parseInt(String(s.reps), 10);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
    const orm = epley(w, r);
    if (orm > out.orm) out = { orm, weight: w, reps: r };
  }
  return out;
}

/**
 * After a strength session is logged, bump oneRepMax for any exercise whose
 * estimated 1RM beat the stored best. Returns the names that set new PRs.
 */
export async function updatePRsFromWorkout(uid: string, exerciseSets?: ExerciseSets[]): Promise<string[]> {
  if (!exerciseSets?.length) return [];

  // best estimated 1RM per exercise from this session
  const best = new Map<string, { name: string; weight: number; reps: number; orm: number }>();
  for (const ex of exerciseSets) {
    if (!ex?.name) continue;
    for (const s of ex.sets ?? []) {
      const w = typeof s.weight === 'number' ? s.weight : parseFloat(String(s.weight));
      const r = typeof s.reps === 'number' ? s.reps : s.reps === 'F' ? 0 : parseInt(String(s.reps), 10);
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
      const orm = epley(w, r);
      const k = keyFor(ex.name);
      const cur = best.get(k);
      if (!cur || orm > cur.orm) best.set(k, { name: ex.name, weight: w, reps: r, orm });
    }
  }
  if (!best.size) return [];

  const snap = await getDocs(collection(db, `users/${uid}/oneRepMax`));
  const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const batch = writeBatch(db);
  const newPRs: string[] = [];

  for (const [k, b] of best) {
    const prev = existing.get(k);
    const prevOrm = (prev?.orm as number) ?? 0;
    if (b.orm > prevOrm + 0.5) {
      const orm = Math.round(b.orm * 10) / 10;
      const history = Array.isArray(prev?.history) ? (prev!.history as unknown[]) : [];
      batch.set(
        doc(db, `users/${uid}/oneRepMax/${k}`),
        {
          exerciseName: b.name,
          weight: b.weight,
          reps: b.reps,
          orm,
          history: [...history, { weight: b.weight, reps: b.reps, orm, date: todayKey() }].slice(-50),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      newPRs.push(b.name);
    }
  }
  if (newPRs.length) await batch.commit();
  return newPRs;
}

/**
 * After a workout is DELETED, revert any 1RM PRs it had set. For each exercise in
 * the deleted session that held (or tied) the stored best, recompute the best from
 * ALL remaining workouts and rewrite (or delete) its oneRepMax doc. Cheap when the
 * deleted workout wasn't a PR (no remaining-scan needed). Returns reverted names.
 */
export async function revertPRsAfterDelete(uid: string, deletedSets?: ExerciseSets[]): Promise<string[]> {
  if (!deletedSets?.length) return [];
  const nameByKey = new Map<string, string>();
  const deletedBest = new Map<string, number>();
  for (const ex of deletedSets) {
    if (!ex?.name) continue;
    const k = keyFor(ex.name);
    nameByKey.set(k, ex.name);
    const b = bestOrm(ex.sets).orm;
    if (b > (deletedBest.get(k) ?? 0)) deletedBest.set(k, b);
  }
  if (!deletedBest.size) return [];

  const ormSnap = await getDocs(collection(db, `users/${uid}/oneRepMax`));
  const existing = new Map(ormSnap.docs.map((d) => [d.id, d.data()]));
  // Only exercises whose stored PR was set/tied by the deleted workout need a recompute.
  const affected = [...deletedBest]
    .filter(([k, orm]) => orm >= ((existing.get(k)?.orm as number) ?? 0) - 0.5)
    .map(([k]) => k);
  if (!affected.length) return [];

  // Recompute the best per affected exercise from every remaining workout.
  const affectedSet = new Set(affected);
  const woSnap = await getDocs(collection(db, `users/${uid}/workouts`));
  const remainingBest = new Map<string, { orm: number; weight: number; reps: number }>();
  for (const d of woSnap.docs) {
    const es = (d.data().exerciseSets as ExerciseSets[] | undefined) ?? [];
    for (const ex of es) {
      if (!ex?.name) continue;
      const k = keyFor(ex.name);
      if (!affectedSet.has(k)) continue;
      const b = bestOrm(ex.sets);
      if (b.orm > (remainingBest.get(k)?.orm ?? 0)) remainingBest.set(k, b);
    }
  }

  const batch = writeBatch(db);
  const reverted: string[] = [];
  for (const k of affected) {
    const ref = doc(db, `users/${uid}/oneRepMax/${k}`);
    const b = remainingBest.get(k);
    const storedOrm = (existing.get(k)?.orm as number) ?? 0;
    if (!b || b.orm <= 0) {
      batch.delete(ref); // no remaining sets for this lift → no PR
      reverted.push(nameByKey.get(k) ?? k);
    } else {
      const newOrm = Math.round(b.orm * 10) / 10;
      if (newOrm < storedOrm - 0.5) {
        const prevHistory = Array.isArray(existing.get(k)?.history)
          ? (existing.get(k)!.history as Array<{ orm?: number; weight?: number; reps?: number; date?: string }>)
          : [];
        // Drop entries above the new best, then make sure the new current best is
        // represented so the doc's `orm` and its history stay consistent.
        const trimmed = prevHistory.filter((h) => (h?.orm ?? 0) <= newOrm + 0.5);
        const hasCurrent = trimmed.some((h) => Math.abs((h?.orm ?? 0) - newOrm) <= 0.5);
        const history = hasCurrent
          ? trimmed
          : [...trimmed, { weight: b.weight, reps: b.reps, orm: newOrm, date: todayKey() }].slice(-50);
        batch.set(ref, { weight: b.weight, reps: b.reps, orm: newOrm, history, updatedAt: serverTimestamp() }, { merge: true });
        reverted.push(nameByKey.get(k) ?? k);
      }
    }
  }
  if (reverted.length) await batch.commit();
  return reverted;
}
