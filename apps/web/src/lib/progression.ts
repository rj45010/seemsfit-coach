import type { ExerciseSetEntry, PlanExercise } from './types';

export interface ExSuggestion {
  name: string;
  last: string | null; // e.g. "100kg × 6 @8" or "BW × 10"
  text: string; // the prescription
  kind: 'up' | 'rep' | 'hold' | 'log';
}

/** Sensible load step for a given working weight (kg). */
function step(w: number): number {
  if (w < 10) return 0.5;
  if (w < 20) return 1;
  if (w < 40) return 2;
  return 2.5;
}

/** The heaviest usable set from a logged session (the working/top set). */
function topSet(sets?: ExerciseSetEntry[]) {
  if (!sets?.length) return null;
  let best: { w: number; reps: number | 'F'; rpe?: number; bodyweight?: boolean } | null = null;
  for (const s of sets) {
    const w = typeof s.weight === 'number' ? s.weight : parseFloat(String(s.weight));
    if (!isFinite(w)) continue;
    if (!best || w > best.w) best = { w, reps: s.reps, rpe: s.rpe, bodyweight: s.bodyweight };
  }
  return best;
}

/** Today's readiness, used to gate load progression (low recovery / spent strain → hold). */
export interface Readiness {
  recoveryScore?: number; // 0–100
  strainValue?: number; // 0–100, today's accumulated exertion so far
  targetStrain?: number; // 0–100, today's recommended exertion budget (from recovery)
}

/**
 * Autoregulated next-step suggestion for one exercise, from its last logged sets and the
 * RPE you recorded — then gated by today's recovery and how much of your recommended strain
 * budget you've already used. RPE = how hard it felt:
 *   ≤7 → add load · 7.5–8 → push · 8.5–9 → repeat to own it · ≥9.5/F → hold/deload.
 *
 * The strain gate is RELATIVE to today's recommended target (derived from recovery), not a
 * fixed number: if you still have headroom (strain < target) a "push" stands; once you've
 * reached the target you hold; well past it (or very low recovery) you deload. So at 8 of a
 * ~13 target it still says push, but at 14 of 13 it tells you to back off.
 */
export function suggestExercise(ex: PlanExercise, readiness?: Readiness): ExSuggestion {
  const base = baseSuggest(ex);

  const rec = readiness?.recoveryScore;
  const str = readiness?.strainValue;
  const target = readiness?.targetStrain;
  const lowRecovery = rec != null && rec < 50;

  // Reached today's recommended exertion budget? (Falls back to a fixed 67 if we have no target.)
  const overBudget = str != null && (target != null ? str >= target : str >= 67);
  const wellOver = str != null && (target != null ? str >= target + 14 : str >= 76);
  if (!lowRecovery && !overBudget) return base; // headroom remains → progress as normal

  const veryLow = wellOver || (rec != null && rec < 40); // overcooked / "recover"
  const why = overBudget && target != null && str != null
    ? (lowRecovery
        ? `recovery is low and you're at ${Math.round(str)} of ~${target} target strain`
        : `you're at ${Math.round(str)} of ~${target} target strain today`)
    : lowRecovery && overBudget ? 'recovery is low and strain is high'
    : lowRecovery ? 'recovery is low today' : 'strain is high today';

  // Very low readiness → prescribe a concrete ≥10% deload, rounded DOWN to a loadable step.
  const top = topSet(ex.loggedSets);
  if (veryLow && top && !top.bodyweight && isFinite(top.w) && top.w > 0) {
    const lower = deload(top.w, 0.1);
    if (lower < top.w) {
      const repsNum = top.reps === 'F' ? 0 : top.reps;
      const pct = Math.round(((top.w - lower) / top.w) * 100);
      return { name: base.name, last: base.last, kind: 'hold', text: `Go lighter: ${top.w} → ${lower}kg × ${repsNum} — ${why}; deload ~${pct}% today.` };
    }
  }

  // Otherwise just don't escalate load — hold steady (or ease off a touch).
  if ((base.kind === 'up' || base.kind === 'rep') && base.last) {
    const at = base.last.replace(/ @.*$/, ''); // drop the RPE tag → "100kg × 6" / "BW × 10"
    return { name: base.name, last: base.last, kind: 'hold', text: `Hold ${at} — ${why}; keep load steady or go a touch lighter.` };
  }
  return base;
}

/**
 * Deload a weight by at least `pct`, rounded DOWN to the weight's loadable step so the
 * result is a real, achievable load that's never lighter than the target reduction.
 * e.g. deload(60, 0.1) → 60·0.9 = 54 → floor to 2.5 → 52.5 (a true −12.5%, ≥ the 10% asked).
 */
function deload(w: number, pct: number): number {
  const s = step(w);
  const target = w * (1 - pct);
  const lower = Math.floor(target / s) * s;
  return Math.round(lower * 100) / 100; // strip any float artifact
}

function baseSuggest(ex: PlanExercise): ExSuggestion {
  const name = ex.exName || ex.name;
  const top = topSet(ex.loggedSets);

  if (!top) {
    return { name, last: null, text: 'No history yet — log it with RPE and I’ll progress you.', kind: 'log' };
  }

  const r = top.reps === 'F' ? 'F' : top.reps;
  const last = top.bodyweight ? `BW × ${r}` : `${top.w}kg × ${r}${top.rpe != null ? ` @${top.rpe}` : ''}`;
  const repsNum = top.reps === 'F' ? 0 : top.reps;

  // Bodyweight → progress by reps
  if (top.bodyweight) {
    if (top.rpe != null && top.rpe >= 9.5) return { name, last, text: `Hold at ${repsNum} reps — near max.`, kind: 'hold' };
    return { name, last, text: `Add a rep: aim BW × ${repsNum + 1}.`, kind: 'rep' };
  }

  // Failure or maxed → consolidate / deload
  if (top.reps === 'F' || (top.rpe != null && top.rpe >= 9.5)) {
    return { name, last, text: `Hold ${top.w}kg × ${repsNum} — it was near-max; deload ~10% if it stalls.`, kind: 'hold' };
  }

  // No RPE logged — can't autoregulate confidently
  if (top.rpe == null) {
    return { name, last, text: `Repeat ${top.w}kg × ${repsNum} and log your RPE so I can progress you.`, kind: 'log' };
  }

  const inc = step(top.w);
  if (top.rpe <= 7) {
    return { name, last, text: `Add load: ${top.w} → ${top.w + inc}kg × ${repsNum} (last felt RPE ${top.rpe}).`, kind: 'up' };
  }
  if (top.rpe <= 8) {
    return { name, last, text: `Push: ${top.w + inc}kg × ${repsNum}, or ${top.w}kg × ${repsNum + 1}.`, kind: 'up' };
  }
  // 8.5–9
  return { name, last, text: `Repeat ${top.w}kg × ${repsNum} @${top.rpe} to own it, then add next time.`, kind: 'hold' };
}
