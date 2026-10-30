import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { HScroll } from '@/components/ui/HScroll';
import { useCreateProgram } from '@/features/plans';
import type { PlanInput } from '@/lib/jarvisActions';
import type { Weekday, WorkoutCategory } from '@/lib/types';

const WEEKDAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATS: WorkoutCategory[] = ['Strength', 'Running', 'Cycling', 'Walking', 'Swimming', 'HIIT', 'Yoga', 'Core', 'Other'];
const field = 'w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

interface BuilderExercise {
  id: number;
  name: string;
  sets: number;
  reps: string;
}
interface DayData {
  name: string;
  category: WorkoutCategory;
  duration: string;
  exercises: BuilderExercise[];
}

const emptyDay = (): DayData => ({ name: '', category: 'Strength', duration: '', exercises: [] });

export function PlanBuilder({ onClose }: { onClose: () => void }) {
  const create = useCreateProgram();
  const [title, setTitle] = useState('');
  const [active, setActive] = useState<Weekday>('Monday');
  const [days, setDays] = useState<Record<Weekday, DayData>>(
    () => Object.fromEntries(WEEKDAYS.map((d) => [d, emptyDay()])) as Record<Weekday, DayData>,
  );
  const nextId = useRef(0);

  const day = days[active];
  const setDay = (patch: Partial<DayData>) => setDays((p) => ({ ...p, [active]: { ...p[active], ...patch } }));

  function addExercise() {
    setDay({ exercises: [...day.exercises, { id: nextId.current++, name: '', sets: 3, reps: '' }] });
  }
  function patchExercise(id: number, patch: Partial<BuilderExercise>) {
    setDay({ exercises: day.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  function removeExercise(id: number) {
    setDay({ exercises: day.exercises.filter((e) => e.id !== id) });
  }

  const dayCount = (d: Weekday) => days[d].exercises.filter((e) => e.name.trim()).length;
  const totalExercises = WEEKDAYS.reduce((n, d) => n + dayCount(d), 0);
  const canSave = title.trim().length > 0 && totalExercises > 0 && !create.isPending;

  async function save() {
    const plans: PlanInput[] = WEEKDAYS.map((d): PlanInput | null => {
      const dd = days[d];
      const exercises = dd.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({ name: e.name.trim(), exName: e.name.trim(), sets: Math.max(1, e.sets), reps: e.reps.trim() }));
      if (!exercises.length) return null;
      return {
        title: dd.name.trim() || d,
        day: d,
        category: dd.category,
        duration: dd.duration ? Number(dd.duration) : 0,
        exercises,
      };
    }).filter((p): p is PlanInput => p !== null);

    await create.mutateAsync({ title: title.trim(), goalType: 'strength', plans });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <div
        className="glass-overlay safe-bottom max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] px-5 pt-3 pb-4 md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50 md:hidden" />
        <div>
          <p className="eyebrow mb-3">Create plan</p>
          <div className="flex flex-col gap-3">
            <input className={field} placeholder="Program name (e.g. My PPL Split)" value={title} onChange={(e) => setTitle(e.target.value)} />

            {/* Day tabs */}
            <HScroll className="-mx-1 flex gap-2 px-1 pb-1">
              {WEEKDAYS.map((d) => {
                const n = dayCount(d);
                return (
                  <span key={d} className="shrink-0">
                    <Pill tone="ink" active={active === d} onClick={() => setActive(d)}>
                      {d.slice(0, 3)}{n > 0 ? ` · ${n}` : ''}
                    </Pill>
                  </span>
                );
              })}
            </HScroll>

            {/* Selected day */}
            <input className={field} placeholder={`${active} name (e.g. Push Day)`} value={day.name} onChange={(e) => setDay({ name: e.target.value })} />
            <HScroll className="-mx-1 flex gap-2 px-1 pb-1">
              {CATS.map((c) => (
                <span key={c} className="shrink-0">
                  <Pill tone="lavender" active={day.category === c} onClick={() => setDay({ category: c })}>{c}</Pill>
                </span>
              ))}
            </HScroll>
            <input className={field} type="number" inputMode="numeric" placeholder="Duration (min, optional)" value={day.duration} onChange={(e) => setDay({ duration: e.target.value })} />

            {/* Exercises for this day */}
            <div className="flex flex-col gap-2">
              {day.exercises.length === 0 ? (
                <p className="text-ink-3 text-sm font-semibold">No exercises on {active} yet.</p>
              ) : (
                day.exercises.map((ex) => (
                  <div key={ex.id} className="flex items-center gap-2 rounded-2xl bg-sys-fill-2 p-2">
                    <input
                      className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-ink-3"
                      placeholder="Exercise name"
                      value={ex.name}
                      onChange={(e) => patchExercise(ex.id, { name: e.target.value })}
                    />
                    <input
                      className="w-12 rounded-lg bg-sys-fill px-2 py-1.5 text-center text-sm font-semibold outline-none"
                      type="number"
                      inputMode="numeric"
                      aria-label="Sets"
                      value={ex.sets}
                      onChange={(e) => patchExercise(ex.id, { sets: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    <span className="text-ink-3 text-xs font-bold">×</span>
                    <input
                      className="w-16 rounded-lg bg-sys-fill px-2 py-1.5 text-center text-sm font-semibold outline-none placeholder:text-ink-3"
                      placeholder="reps"
                      value={ex.reps}
                      onChange={(e) => patchExercise(ex.id, { reps: e.target.value })}
                    />
                    <button onClick={() => removeExercise(ex.id)} aria-label="Remove" className="text-ink-3 shrink-0">
                      <X size={16} strokeWidth={3} />
                    </button>
                  </div>
                ))
              )}
              <button onClick={addExercise} className="text-ink-2 flex items-center gap-1 self-start text-xs font-bold">
                <Plus size={12} strokeWidth={3} /> Add exercise
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="ink" onClick={save} disabled={!canSave}>
              {create.isPending ? 'Saving…' : `Save program${totalExercises ? ` · ${totalExercises} ex` : ''}`}
            </Button>
            <Button variant="surface" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
