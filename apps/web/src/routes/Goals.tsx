import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalForm, type GoalDraft } from '@/components/goals/GoalForm';
import { useGoals, useGoalMutations, useSyncGoals } from '@/hooks/useGoals';
import type { Goal } from '@/lib/types';

export default function Goals() {
  const { data, isLoading } = useGoals();
  const { create, update, remove } = useGoalMutations();
  const syncGoals = useSyncGoals();
  const [mode, setMode] = useState<'idle' | 'new' | string>('idle'); // string = editing goal id

  // Refresh progress (incl. daily protein/calories/water/walk from today's logs) on open.
  useEffect(() => { void syncGoals(); }, [syncGoals]);

  const goals = data ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const archived = goals.filter((g) => g.status !== 'active');
  const editing = typeof mode === 'string' && mode !== 'idle' && mode !== 'new'
    ? goals.find((g) => g.id === mode)
    : undefined;
  const saving = create.isPending || update.isPending;

  async function handleSave(draft: GoalDraft) {
    if (editing) await update.mutateAsync({ id: editing.id, ...draft });
    else await create.mutateAsync(draft);
    void syncGoals(); // set initial progress (and complete if already met) for typed goals
    setMode('idle');
  }

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="Targets" title="Goals" />

      {mode === 'idle' && (
        <Button variant="ink" className="mb-4" onClick={() => setMode('new')}>
          <Plus size={16} strokeWidth={3} /> New goal
        </Button>
      )}

      {(mode === 'new' || editing) && (
        <GoalForm
          initial={editing}
          saving={saving}
          onSave={handleSave}
          onCancel={() => setMode('idle')}
          onDelete={
            editing
              ? async () => {
                  await remove.mutateAsync(editing.id);
                  setMode('idle');
                }
              : undefined
          }
        />
      )}

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : goals.length === 0 && mode === 'idle' ? (
        <EmptyState title="No goals yet" hint="Set a cardio, strength, body, or blood-marker target." />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((g: Goal, i) => (
            <GoalCard key={g.id} goal={g} delay={Math.min(i * 0.04, 0.3)} onEdit={() => setMode(g.id)} />
          ))}
          {archived.length > 0 && (
            <>
              <p className="eyebrow mt-3">Archive</p>
              {archived.map((g) => (
                <GoalCard key={g.id} goal={g} onEdit={() => setMode(g.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
