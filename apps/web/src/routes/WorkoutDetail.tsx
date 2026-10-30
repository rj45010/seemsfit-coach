import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2, Dumbbell } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SetTable } from '@/features/workouts/components/SetTable';
import { SegmentTable } from '@/features/workouts/components/SegmentTable';
import { useWorkout, useDeleteWorkout } from '@/features/workouts';
import { catMeta, isCardio } from '@/lib/workoutMeta';
import { iconForType } from '@/lib/workoutTypes';
import { duration as fmtDur, km, kcal, num } from '@/lib/format';
import { fmtDate } from '@/lib/date';
import { WorkoutShare } from '@/components/share/WorkoutShare';
import { WorkoutLoadSheet } from '@/features/workouts/components/WorkoutLoadSheet';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-sys-fill-2 px-3 py-2 text-center">
      <p className="big-number text-lg">{value}</p>
      <p className="eyebrow mt-0.5">{label}</p>
    </div>
  );
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: w, isLoading } = useWorkout(id);
  const del = useDeleteWorkout();
  const [confirm, setConfirm] = useState(false);
  const [editingLoad, setEditingLoad] = useState(false);

  async function handleDelete() {
    if (!id) return;
    await del.mutateAsync(id);
    navigate('/train', { replace: true });
  }

  if (isLoading) {
    return (
      <>
        <BackHeader to="/train" label="Train" />
        <SkeletonList rows={3} />
      </>
    );
  }
  if (!w) {
    return (
      <>
        <BackHeader to="/train" label="Train" />
        <EmptyState title="Workout not found" />
      </>
    );
  }

  const { icon: catIcon } = catMeta(w.category);
  const Icon = iconForType(w.sport) ?? catIcon;
  const date = w.customDate ?? w.createdAt;
  const hasSets = !!w.exerciseSets && w.exerciseSets.length > 0;

  return (
    <>
      <BackHeader to="/train" label="Train" />

      {/* Editorial hero — floats over the route's gold "spotlight" ambient (immersive feel) */}
      <div className="mb-6 pt-1">
        <div className="mb-3 flex items-center gap-3">
          <div className="glass flex h-12 w-12 items-center justify-center rounded-2xl">
            <Icon size={22} strokeWidth={2.5} />
          </div>
          <div>
            <p className="eyebrow">{w.category}</p>
            <p className="text-ink-2 text-xs font-semibold">{fmtDate(date)}</p>
          </div>
        </div>
        <h1 className="display mb-4 text-3xl leading-[1.1]">{w.title || w.sport || w.category}</h1>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Duration" value={fmtDur(w.duration)} />
          {isCardio(w.category) ? (
            <Stat label="Distance" value={`${km(w.distance)} km`} />
          ) : (
            <Stat label="Sets" value={num(w.exerciseSets?.reduce((n, e) => n + e.sets.length, 0))} />
          )}
          <Stat label="Calories" value={`${kcal(w.calories)}`} />
        </div>
        {(w.effort != null || w.feel || (w.sport && w.title)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {w.sport && w.title && <span className="text-ink-2 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2.5 py-0.5 text-xs font-semibold">{w.sport}</span>}
            {w.effort != null && <span className="text-ink-2 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2.5 py-0.5 text-xs font-semibold">Effort {w.effort}/10</span>}
            {w.feel && <span className="text-ink-2 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2.5 py-0.5 text-xs font-semibold">Felt {w.feel}</span>}
          </div>
        )}
      </div>

      {w.segments && w.segments.length > 0 && (
        <div className="mb-4">
          <p className="eyebrow mb-2">{w.format && w.format !== 'standard' ? w.format : 'Segments'}</p>
          <SegmentTable segments={w.segments} />
        </div>
      )}

      {w.exerciseSets && w.exerciseSets.length > 0 && (
        <>
          <p className="eyebrow mb-2">Exercises</p>
          <SetTable exercises={w.exerciseSets} />
        </>
      )}

      {/* Add load — turns a watch/Apple-Health session into a full strength record */}
      {!isCardio(w.category) && (
        hasSets ? (
          <div className="mt-3 flex justify-center">
            <button onClick={() => setEditingLoad(true)} className="text-ink-3 hover:text-ink flex items-center gap-1.5 text-xs font-bold">
              <Dumbbell size={13} strokeWidth={2.5} /> Edit load
            </button>
          </div>
        ) : (
          <Card accent="surface" className="mt-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Add your load</p>
                <p className="text-ink-2 text-xs font-medium">Log the sets, reps and weight to make this a full strength record.</p>
              </div>
              <Button variant="ink" onClick={() => setEditingLoad(true)}>
                <Dumbbell size={15} strokeWidth={2.5} /> Add
              </Button>
            </div>
          </Card>
        )
      )}

      {editingLoad && <WorkoutLoadSheet workout={w} onClose={() => setEditingLoad(false)} />}

      {w.notes && (
        <Card accent="surface" className="mt-4">
          <p className="eyebrow mb-1">Notes</p>
          <p className="text-sm font-medium">{w.notes}</p>
        </Card>
      )}

      <WorkoutShare workout={w} />

      {/* Delete */}
      <div className="mt-6 flex justify-center">
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Delete this workout?</span>
            <Button variant="surface" onClick={() => setConfirm(false)}>Cancel</Button>
            <button
              onClick={handleDelete}
              disabled={del.isPending}
              className="nb-btn bg-crit text-paper flex items-center gap-1.5 px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={2.5} /> {del.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="text-ink-3 hover:text-crit flex items-center gap-1.5 text-xs font-bold"
          >
            <Trash2 size={13} strokeWidth={2.5} /> Delete workout
          </button>
        )}
      </div>
    </>
  );
}
