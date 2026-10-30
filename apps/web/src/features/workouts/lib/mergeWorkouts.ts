import { toDate } from '@/lib/date';
import type { Workout } from '@/lib/types';

/**
 * A planned merge of a duplicate strength session: the phone log is KEPT (it owns the weights/reps
 * the user typed) and the watch log is DROPPED after its session metrics are grafted in.
 */
export interface StrengthMergeOp {
  keepId: string; // the phone/manual doc we keep (has the weights)
  dropId: string; // the watch doc we delete after merging
  patch: Record<string, unknown>; // fields to setDoc(merge) onto the kept doc
}

// Session metrics the WATCH measures better — these overwrite the phone log on merge.
const WATCH_METRIC_FIELDS = ['calories', 'avgHr', 'maxHr', 'duration', 'distance', 'effort'] as const;

// When a day has MORE than one watch/phone strength log, disambiguate by time: a phone log pairs
// with the watch session whose window [start … start+duration] (padded 10 min) it falls in.
const PAD_MS = 10 * 60 * 1000;

function createdMs(w: Workout): number | null {
  return toDate(w.createdAt)?.getTime() ?? null;
}

/** The calendar day a workout belongs to (explicit customDate, else its createdAt date). */
function dayOf(w: Workout): string | null {
  if (w.customDate) return w.customDate.slice(0, 10);
  return toDate(w.createdAt)?.toISOString().slice(0, 10) ?? null;
}

/** Is this the phone/manual copy (can own user-typed weights), not a tracked/import copy? */
function isPhoneLog(w: Workout): boolean {
  return w.source !== 'watch' && w.source !== 'appleHealth' && w.source !== 'hae';
}

// A *tracked* session carrying metrics (HR / kcal / duration) but no typed weights — the copy we
// fold into the phone log and then drop. Covers the live Apple Watch (`wkt_*`, source 'watch') and
// Apple Health imports (`ahk_*`, source 'appleHealth' / 'hae'). Mirror of isPhoneLog above.
const DONOR_SOURCES = new Set(['watch', 'appleHealth', 'hae']);
function isDonor(w: Workout): boolean {
  return w.source != null && DONOR_SOURCES.has(w.source);
}

function buildOp(donor: Workout, phone: Workout): StrengthMergeOp {
  const patch: Record<string, unknown> = { watchMerged: true };
  for (const f of WATCH_METRIC_FIELDS) {
    const v = donor[f as keyof Workout];
    if (v != null) patch[f] = v;
  }
  // Weights stay from the phone; only borrow the donor's sets if the phone log has none.
  if ((!phone.exerciseSets || phone.exerciseSets.length === 0) && donor.exerciseSets?.length) {
    patch.exerciseSets = donor.exerciseSets;
  }
  return { keepId: phone.id, dropId: donor.id, patch };
}

/**
 * Find duplicate STRENGTH sessions logged both by a tracked source (Apple Watch `wkt_*` or Apple
 * Health `ahk_*`) and on the phone, and plan a merge for each: keep the phone log (weights/reps),
 * fold in the tracked session's metrics (HR / calories / duration / effort), and drop the tracked doc.
 *
 * Per calendar day:
 *  • exactly one tracked + one phone strength log → merge them (they're the same session, even if the
 *    weights were typed on the phone hours after the tracked session);
 *  • several of either → pair each phone log with the tracked session it was created within (±10 min),
 *    so two separate sessions in a day never cross-merge.
 * Idempotent: once merged the tracked doc is gone and the kept doc is flagged, so re-runs find nothing.
 */
export function planStrengthMerges(workouts: Workout[]): StrengthMergeOp[] {
  const strength = workouts.filter((w) => w.category === 'Strength');
  const byDay = new Map<string, Workout[]>();
  for (const w of strength) {
    const d = dayOf(w);
    if (!d) continue;
    const arr = byDay.get(d);
    if (arr) arr.push(w);
    else byDay.set(d, [w]);
  }

  const ops: StrengthMergeOp[] = [];
  for (const group of byDay.values()) {
    const donors = group.filter(isDonor);
    const phones = group.filter((w) => isPhoneLog(w) && !w.watchMerged);
    if (!donors.length || !phones.length) continue;

    // The common case: one tracked (watch / Apple Health) copy + one phone copy → merge outright.
    if (donors.length === 1 && phones.length === 1) {
      ops.push(buildOp(donors[0], phones[0]));
      continue;
    }

    // Multiple sessions in a day → pair by time proximity so the right ones join.
    const used = new Set<string>();
    for (const w of donors) {
      const start = createdMs(w);
      if (start == null) continue;
      const end = start + (w.duration ?? 0) * 60_000;
      let best: Workout | null = null;
      let bestGap = Infinity;
      for (const p of phones) {
        if (used.has(p.id)) continue;
        const t = createdMs(p);
        if (t == null) continue;
        const gap = t < start ? start - t : t > end ? t - end : 0;
        if (gap <= PAD_MS && gap < bestGap) {
          best = p;
          bestGap = gap;
        }
      }
      if (best) {
        used.add(best.id);
        ops.push(buildOp(w, best));
      }
    }
  }
  return ops;
}
