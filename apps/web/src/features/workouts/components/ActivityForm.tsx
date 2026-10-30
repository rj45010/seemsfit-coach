import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { ExerciseLogRow } from '@/components/plans/ExerciseLogRow';
import { useLogActivity } from '../api/useWorkouts';
import { useSyncGoals } from '@/hooks/useGoals';
import { useMetricsRange } from '@/hooks/useMetrics';
import { todayKey } from '@/lib/date';
import { isCardio } from '@/lib/workoutMeta';
import { estimateCalories } from '@/lib/calories';
import { WORKOUT_TYPES, type WorkoutType } from '@/lib/workoutTypes';
import type { ExerciseSetEntry, ExerciseSets, PlanExercise, WorkoutCategory } from '@/lib/types';

const FEELS: Array<'great' | 'good' | 'ok' | 'rough'> = ['great', 'good', 'ok', 'rough'];
const field = 'w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

interface ManualExercise {
  id: number;
  name: string;
}

/** A blank PlanExercise so the set editor seeds with one empty row. */
function blankPlanExercise(name: string): PlanExercise {
  return { name, exName: name, sets: 1, reps: '', done: false, supersetId: null, loggedSets: [] };
}

const validSet = (s: ExerciseSetEntry) => {
  const hasWeight = s.weight !== '' && s.weight != null;
  const hasReps = s.reps === 'F' || (typeof s.reps === 'number' && s.reps > 0);
  return hasWeight || hasReps;
};

export function ActivityForm({ onClose }: { onClose: () => void }) {
  const log = useLogActivity();
  const syncGoals = useSyncGoals();

  // Lock the page behind the sheet so scrolling inside it can't leak to the body
  // (iOS scroll-chaining would otherwise shift this fixed overlay). Same pattern as InfoSheet.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const { data: metrics } = useMetricsRange(120);
  const weightKg = useMemo(() => {
    for (const m of [...(metrics ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
      if (m.weightKg != null) return m.weightKg;
    }
    return null;
  }, [metrics]);
  const [category, setCategory] = useState<WorkoutCategory>('Strength');
  const [typeName, setTypeName] = useState('Traditional Strength Training');
  const [typeQuery, setTypeQuery] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [sport, setSport] = useState('');
  const [date, setDate] = useState(todayKey());
  const [duration, setDuration] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [distance, setDistance] = useState('');
  const [effort, setEffort] = useState<number | null>(null);
  const [feel, setFeel] = useState<'great' | 'good' | 'ok' | 'rough' | null>(null);
  const [notes, setNotes] = useState('');

  // Strength: a list of exercises, each with its own sets (collected via a live ref,
  // keyed by stable id so renaming/removing never remounts and loses entered sets).
  const [exs, setExs] = useState<ManualExercise[]>([{ id: 0, name: '' }]);
  const nextId = useRef(1);
  const exsRef = useRef(exs);
  exsRef.current = exs;
  const live = useRef<Record<number, ExerciseSetEntry[]>>({});

  const isStrength = category === 'Strength';

  const filteredTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    return q ? WORKOUT_TYPES.filter((t) => t.name.toLowerCase().includes(q)) : WORKOUT_TYPES;
  }, [typeQuery]);

  function pickType(t: WorkoutType) {
    setTypeName(t.name);
    setCategory(t.category);
    setTypeOpen(false);
  }

  const handleChange = useCallback((i: number, sets: ExerciseSetEntry[]) => {
    const id = exsRef.current[i]?.id;
    if (id != null) live.current[id] = sets;
  }, []);

  function addExercise() {
    setExs((p) => [...p, { id: nextId.current++, name: '' }]);
  }
  function removeExercise(id: number) {
    setExs((p) => (p.length > 1 ? p.filter((e) => e.id !== id) : p));
    delete live.current[id];
  }
  function rename(id: number, name: string) {
    setExs((p) => p.map((e) => (e.id === id ? { ...e, name } : e)));
  }

  async function save() {
    let exerciseSets: ExerciseSets[] | undefined;
    if (isStrength) {
      exerciseSets = exs
        .map((ex) => ({
          name: ex.name.trim(),
          supersetId: null,
          sets: (live.current[ex.id] ?? []).filter(validSet),
        }))
        .filter((e) => e.name && e.sets.length);
    }
    const totalMin = (Number(duration) || 0) + (Number(durationSec) || 0) / 60;
    const calories = estimateCalories({ category, durationMin: totalMin, rpe: effort ?? undefined, weightKg });
    await log.mutateAsync({
      category,
      sport: sport.trim() || typeName,
      date,
      durationMin: totalMin > 0 ? totalMin : undefined,
      distanceKm: distance ? Number(distance) : undefined,
      calories,
      effort: effort ?? undefined,
      feel: feel ?? undefined,
      notes: notes.trim() || undefined,
      exerciseSets: exerciseSets?.length ? exerciseSets : undefined,
    });
    void syncGoals(); // a logged session may advance a distance / e1RM goal
    onClose();
  }

  // Portal to <body>: the sheet must escape the page's PullToRefresh wrapper. That
  // wrapper applies a translateY transform on drag, and a transformed ancestor makes
  // `position: fixed` descendants move with it — which shifted this sheet on scroll.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <div
        className="glass-overlay safe-bottom max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] px-5 pt-3 pb-4 md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50 md:hidden" />
        <div>
          <p className="eyebrow mb-3">Log workout</p>
          <div className="flex flex-col gap-2.5">
            {/* Workout type — searchable Apple Fitness list (sets the category bucket) */}
            <div className="relative">
              <input
                className={field}
                placeholder="Search workout type…"
                value={typeOpen ? typeQuery : typeName}
                onFocus={() => { setTypeOpen(true); setTypeQuery(''); }}
                onBlur={() => setTimeout(() => setTypeOpen(false), 150)}
                onChange={(e) => setTypeQuery(e.target.value)}
              />
              {typeOpen && (
                <div className="bg-surface absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl p-1 shadow-xl ring-1 ring-[color-mix(in_srgb,var(--color-ink)_12%,transparent)]">
                  {filteredTypes.length === 0 ? (
                    <p className="text-ink-3 px-3 py-2 text-sm font-semibold">No match — pick “Other”.</p>
                  ) : (
                    filteredTypes.map((t) => (
                      <button
                        key={t.name}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickType(t)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.98]"
                      >
                        <t.icon size={18} strokeWidth={2.2} className="shrink-0" />
                        <span className={`flex-1 ${typeName === t.name ? 'text-lavender' : ''}`}>{t.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <input className={field} placeholder={isStrength ? 'Session name (optional, e.g. "Push Day")' : 'Custom name (optional, e.g. "Morning 5k")'} value={sport} onChange={(e) => setSport(e.target.value)} />
            {/* appearance-none + left-aligned value stops iOS's native date control from overflowing its box */}
            <input className={`${field} appearance-none [&::-webkit-date-and-time-value]:text-left`} type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex gap-2">
              <input className={field} type="number" inputMode="numeric" placeholder="Min" value={duration} onChange={(e) => setDuration(e.target.value)} />
              <input className={field} type="number" inputMode="numeric" min={0} max={59} placeholder="Sec" value={durationSec} onChange={(e) => setDurationSec(e.target.value)} />
              {isCardio(category) && (
                <input className={field} type="number" inputMode="decimal" placeholder="Distance (km)" value={distance} onChange={(e) => setDistance(e.target.value)} />
              )}
            </div>

            {/* Strength: multiple exercises, each with weight × reps × RPE sets */}
            {isStrength && (
              <div className="flex flex-col gap-2">
                <p className="text-ink-2 text-xs font-bold">Exercises</p>
                {exs.map((ex, i) => (
                  <ExerciseLogRow
                    key={ex.id}
                    exercise={blankPlanExercise(ex.name)}
                    index={i}
                    onChange={handleChange}
                    defaultOpen
                    editableName
                    onRename={(name) => rename(ex.id, name)}
                    onRemove={() => removeExercise(ex.id)}
                  />
                ))}
                <button
                  onClick={addExercise}
                  className="text-ink flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[color-mix(in_srgb,var(--color-ink)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] py-3 text-sm font-bold transition-transform active:scale-[0.99]"
                >
                  <Plus size={16} strokeWidth={3} /> Add exercise
                </button>
              </div>
            )}

            <div>
              <p className="text-ink-2 mb-1 text-xs font-bold">Effort (RPE)</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setEffort(n === effort ? null : n)}
                    className="h-8 w-8 rounded-xl font-mono text-xs font-semibold transition-transform active:scale-95"
                    style={{ background: effort === n ? 'var(--color-butter)' : 'color-mix(in srgb, var(--color-ink) 6%, transparent)' }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-ink-2 mb-1 text-xs font-bold">Felt</p>
              <div className="flex gap-2">
                {FEELS.map((f) => (
                  <Pill key={f} tone="mint" active={feel === f} onClick={() => setFeel(f === feel ? null : f)}>{f}</Pill>
                ))}
              </div>
            </div>
            <textarea className={field} rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ink" onClick={save} disabled={log.isPending}>{log.isPending ? 'Saving…' : 'Log it'}</Button>
            <Button variant="surface" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
