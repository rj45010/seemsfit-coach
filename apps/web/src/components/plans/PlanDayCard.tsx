import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown, ClipboardCheck, SkipForward } from 'lucide-react';
import { catMeta } from '@/lib/workoutMeta';
import { duration as fmtDur } from '@/lib/format';
import { useLogPlanSets, useUpdatePlanExercises } from '@/features/plans';
import { useSyncGoals } from '@/hooks/useGoals';
import { FinOverlay } from '@/components/ui/FinOverlay';
import { ExerciseLogRow } from './ExerciseLogRow';
import { draftKey, clearPlanDrafts } from '@/lib/drafts';
import { tapLight, tapSuccess } from '@/lib/haptics';
import { supersetGroups } from '@/lib/supersets';
import type { ExerciseSetEntry, Plan, PlanExercise } from '@/lib/types';

/**
 * A weekday session that expands into an inline, loggable set editor.
 * Logging writes a workout and saves the entered sets back onto the plan, so
 * reopening pre-fills with the last-logged values.
 */
export function PlanDayCard({
  plan,
  today,
  defaultOpen = false,
  programName,
  onSkip,
}: {
  plan: Plan;
  today: string;
  defaultOpen?: boolean;
  programName?: string;
  onSkip?: (plan: Plan) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [fin, setFin] = useState(false);
  const [prs, setPrs] = useState<string[]>([]);
  const log = useLogPlanSets();
  const updateExs = useUpdatePlanExercises();
  const syncGoals = useSyncGoals();
  const live = useRef<Record<number, ExerciseSetEntry[]>>({});

  // Local editable copy so superset links update instantly; persisted to the plan.
  const [exercises, setExercises] = useState<PlanExercise[]>(plan.exercises ?? []);
  // Exercises skipped for THIS session only (by index) — never persisted to the plan.
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  useEffect(() => { setExercises(plan.exercises ?? []); setSkipped(new Set()); }, [plan.exercises]);
  const toggleSkip = (i: number) => {
    tapLight();
    setSkipped((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const isToday = plan.day === today;
  const { icon: Icon } = catMeta(plan.category);
  const groups = supersetGroups(exercises);

  const handleChange = useCallback((i: number, sets: ExerciseSetEntry[]) => {
    live.current[i] = sets;
  }, []);

  /** Link exercise i with exercise `other` (shared id), or unlink when other===null. */
  function setSuperset(i: number, other: number | null) {
    tapLight();
    setExercises((prev) => {
      const next = prev.map((e) => ({ ...e }));
      if (other == null) {
        next[i].supersetId = null;
      } else {
        const id = next[other].supersetId ?? next[i].supersetId ?? `ss-${Date.now()}`;
        next[i].supersetId = id;
        next[other].supersetId = id;
      }
      // Drop any group left with a single member.
      const counts: Record<string, number> = {};
      next.forEach((e) => { if (e.supersetId) counts[e.supersetId] = (counts[e.supersetId] ?? 0) + 1; });
      next.forEach((e) => { if (e.supersetId && counts[e.supersetId] < 2) e.supersetId = null; });
      updateExs.mutate({ planId: plan.id, exercises: next });
      return next;
    });
  }

  function doLog() {
    const exerciseSets = exercises.map((ex, i) => ({
      name: ex.exName || ex.name,
      supersetId: ex.supersetId ?? null,
      sets: skipped.has(i) ? [] : (live.current[i] ?? ex.loggedSets ?? []),
      skip: skipped.has(i),
    }));
    log.mutate(
      { plan: { ...plan, exercises }, exerciseSets },
      {
        onSuccess: (data) => {
          tapSuccess();
          clearPlanDrafts(plan.id); // logged — drop the in-progress drafts
          setPrs(data?.newPRs ?? []);
          setOpen(false);
          setFin(true);
          void syncGoals(); // strength e1RM goals may have advanced/completed
        },
      },
    );
  }

  return (
    <div className="nb-card overflow-hidden" style={{ background: 'var(--color-surface)' }}>
      <AnimatePresence>
        {fin && <FinOverlay onDone={() => setFin(false)} big={prs.length ? 'New PR' : 'Fin.'} sub={prs.length ? prs.join(' · ') : undefined} />}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sys-fill">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">
            {programName ? `${programName} · ` : ''}
            {plan.day}
            {isToday ? ' · Today' : ''}
          </p>
          <p className="truncate font-bold">{plan.title}</p>
          <p className="text-ink-2 text-xs font-semibold">
            {exercises.length} exercises · {fmtDur(plan.duration)}
          </p>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={3}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {exercises.length === 0 ? (
            <p className="text-ink-2 text-sm font-semibold">No exercises in this session.</p>
          ) : (
            exercises.map((ex, i) => (
              <ExerciseLogRow
                key={`${ex.name}-${i}`}
                exercise={ex}
                index={i}
                onChange={handleChange}
                draftKey={draftKey(plan.id, ex.exName || ex.name)}
                group={ex.supersetId ? groups[ex.supersetId] : undefined}
                siblings={exercises.map((e, j) => ({ index: j, name: e.exName || e.name })).filter((s) => s.index !== i)}
                onSuperset={(other) => setSuperset(i, other)}
                skippable
                skipped={skipped.has(i)}
                onToggleSkip={() => toggleSkip(i)}
              />
            ))
          )}

          <div className="mt-1 flex gap-2">
            <button
              onClick={doLog}
              disabled={log.isPending || exercises.length === 0 || skipped.size >= exercises.length}
              className="nb-btn flex grow items-center justify-center gap-1.5 bg-[var(--color-ink)] px-4 py-2 text-sm font-bold text-[var(--color-paper)] disabled:opacity-50"
            >
              <ClipboardCheck size={14} strokeWidth={3} />
              {log.isPending ? 'Logging…' : `Log ${isToday ? 'today' : plan.day}`}
            </button>
            {onSkip && (
              <button
                onClick={() => onSkip(plan)}
                className="nb-btn bg-surface flex items-center gap-1.5 px-4 py-2 text-sm font-bold"
              >
                <SkipForward size={14} strokeWidth={3} /> Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
