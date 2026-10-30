import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { ExerciseLogRow } from '@/components/plans/ExerciseLogRow';
import { useUpdateWorkout } from '../api/useWorkouts';
import { useSyncGoals } from '@/hooks/useGoals';
import type { ExerciseSetEntry, ExerciseSets, PlanExercise, Workout } from '@/lib/types';

const FEELS: Array<'great' | 'good' | 'ok' | 'rough'> = ['great', 'good', 'ok', 'rough'];
const field = 'w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

const validSet = (s: ExerciseSetEntry) => {
  const hasWeight = s.weight !== '' && s.weight != null;
  const hasReps = s.reps === 'F' || (typeof s.reps === 'number' && s.reps > 0);
  return hasWeight || hasReps;
};

/** Seed a PlanExercise row, pre-loading any sets the workout already has. */
function seedExercise(name: string, sets: ExerciseSetEntry[]): PlanExercise {
  return { name, exName: name, sets: 1, reps: '', done: false, supersetId: null, loggedSets: sets };
}

interface Row {
  id: number;
  name: string;
  seed: ExerciseSetEntry[];
}

/**
 * Add strength load (sets/reps/weight), effort, feel and notes to an EXISTING workout —
 * typically an Apple-Health session the watch recorded (`ahk_*`) that arrived with only
 * duration/calories. Pre-fills from any sets already saved. Writes via useUpdateWorkout
 * (merge:true) so a later HealthKit re-sync won't clobber it. Reuses ExerciseLogRow so
 * the set editor matches the manual-log flow exactly.
 */
export function WorkoutLoadSheet({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const update = useUpdateWorkout();
  const syncGoals = useSyncGoals();

  // Lock the page behind the sheet (prevents iOS scroll-chaining shifting the overlay).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const existing = workout.exerciseSets ?? [];
  const [title, setTitle] = useState(workout.title ?? '');
  const [effort, setEffort] = useState<number | null>(workout.effort ?? null);
  const [feel, setFeel] = useState<'great' | 'good' | 'ok' | 'rough' | null>(workout.feel ?? null);
  const [notes, setNotes] = useState(workout.notes ?? '');

  const [rows, setRows] = useState<Row[]>(
    existing.length
      ? existing.map((e, i) => ({ id: i, name: e.name, seed: e.sets ?? [] }))
      : [{ id: 0, name: '', seed: [] }],
  );
  const nextId = useRef(rows.length);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const live = useRef<Record<number, ExerciseSetEntry[]>>(
    Object.fromEntries(rows.map((r) => [r.id, r.seed])),
  );

  const handleChange = useCallback((i: number, sets: ExerciseSetEntry[]) => {
    const id = rowsRef.current[i]?.id;
    if (id != null) live.current[id] = sets;
  }, []);

  const addExercise = () => setRows((p) => [...p, { id: nextId.current++, name: '', seed: [] }]);
  const removeExercise = (id: number) => {
    setRows((p) => (p.length > 1 ? p.filter((e) => e.id !== id) : p));
    delete live.current[id];
  };
  const rename = (id: number, name: string) => setRows((p) => p.map((e) => (e.id === id ? { ...e, name } : e)));

  async function save() {
    const exerciseSets: ExerciseSets[] = rows
      .map((r) => ({
        name: r.name.trim(),
        supersetId: null,
        sets: (live.current[r.id] ?? []).filter(validSet),
      }))
      .filter((e) => e.name && e.sets.length);

    await update.mutateAsync({
      id: workout.id,
      patch: {
        title: title.trim() || undefined,
        exerciseSets: exerciseSets.length ? exerciseSets : undefined,
        effort: effort ?? undefined,
        feel: feel ?? undefined,
        notes: notes.trim() || undefined,
      },
    });
    void syncGoals();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <div
        className="glass-overlay safe-bottom max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] px-5 pt-3 pb-4 md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50 md:hidden" />
        <p className="eyebrow mb-3">Add load · {workout.category}</p>
        <div className="flex flex-col gap-2.5">
          <input className={field} placeholder='Session name (optional, e.g. "Push Day")' value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="flex flex-col gap-2">
            <p className="text-ink-2 text-xs font-bold">Exercises</p>
            {rows.map((row, i) => (
              <ExerciseLogRow
                key={row.id}
                exercise={seedExercise(row.name, row.seed)}
                index={i}
                onChange={handleChange}
                defaultOpen
                editableName
                onRename={(name) => rename(row.id, name)}
                onRemove={() => removeExercise(row.id)}
              />
            ))}
            <button onClick={addExercise} className="text-ink-2 flex items-center gap-1 self-start text-xs font-bold">
              <Plus size={12} strokeWidth={3} /> Add exercise
            </button>
          </div>

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
          <Button variant="ink" onClick={save} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save load'}</Button>
          <Button variant="surface" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
