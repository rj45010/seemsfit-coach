import { useState } from 'react';
import { ChevronDown, Plus, Trash2, Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';
import { tapSuccess } from '@/lib/haptics';
import { useMealPlans, useDeleteMealPlan } from '../api/useMealPlans';
import { useMealMutation } from '../api/useMeals';
import { NUTRITION } from '../constants/messages';
import type { PlannedMeal } from '../types';

function MealCard({ meal }: { meal: PlannedMeal }) {
  const add = useMealMutation();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  async function log() {
    await add.mutateAsync({
      name: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
    });
    tapSuccess();
    setLogged(true);
    setTimeout(() => setLogged(false), 2500);
  }

  return (
    <Card accent="surface" animate={false} className="py-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => meal.recipe && setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate font-bold">
            {meal.name}
            {meal.time ? <span className="text-ink-3 font-semibold"> · {meal.time}</span> : null}
          </p>
          <p className="text-ink-2 text-xs font-semibold">
            {num(meal.calories)} kcal
            {meal.protein != null ? ` · P${num(meal.protein)}` : ''}
            {meal.carbs != null ? ` C${num(meal.carbs)}` : ''}
            {meal.fat != null ? ` F${num(meal.fat)}` : ''}
          </p>
        </button>
        <button
          onClick={log}
          disabled={add.isPending}
          className={cn('nb-btn shrink-0 px-3 py-1.5 text-xs font-bold', logged ? 'bg-mint' : 'bg-ink text-paper')}
        >
          {logged ? <Check size={14} strokeWidth={3} /> : add.isPending ? '…' : NUTRITION.actions.log}
        </button>
      </div>
      {meal.recipe && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-ink-3 mt-1.5 flex items-center gap-1 text-[11px] font-bold"
          >
            <ChevronDown size={12} strokeWidth={3} className={cn('transition-transform', open && 'rotate-180')} />
            {open ? 'Hide' : 'Recipe'}
          </button>
          {open && <p className="text-ink-2 mt-1 text-sm font-medium leading-relaxed">{meal.recipe}</p>}
        </>
      )}
    </Card>
  );
}

export function MealPlanView() {
  const { data: plans, isLoading } = useMealPlans();
  const del = useDeleteMealPlan();
  const { openJarvis } = useJarvis();

  if (isLoading) return <SkeletonList rows={3} />;

  if (!plans || plans.length === 0) {
    return (
      <>
        <EmptyState title={NUTRITION.empty.noPlan.title} hint={NUTRITION.empty.noPlan.hint} />
        <div className="mt-4 flex justify-center">
          <Button variant="ink" onClick={() => openJarvis(NUTRITION.jarvisSeeds.buildPlan)}>
            {NUTRITION.actions.askMealPlan}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {plans.map((plan) => (
        <section key={plan.id}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="display text-lg leading-tight">{plan.title}</p>
              <p className="text-ink-2 text-xs font-semibold">
                {plan.goalKcal ? `${num(plan.goalKcal)} kcal` : ''}
                {plan.goalProtein ? ` · ${num(plan.goalProtein)}g protein` : ''}
                {plan.note ? ` · ${plan.note}` : ''}
              </p>
            </div>
            <button
              onClick={() => del.mutate(plan.id)}
              aria-label="Delete plan"
              className="text-ink-3 hover:text-crit shrink-0"
            >
              <Trash2 size={15} strokeWidth={2.5} />
            </button>
          </div>

          {plan.days?.map((day, di) => (
            <div key={di} className="mb-3">
              <p className="eyebrow mb-1.5">{day.name}</p>
              <div className="flex flex-col gap-2">
                {day.meals?.map((m, mi) => (
                  <MealCard key={mi} meal={m} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <button
        onClick={() => openJarvis(NUTRITION.jarvisSeeds.adjustPlan)}
        className="text-ink-2 flex items-center justify-center gap-1 text-xs font-bold"
      >
        <Plus size={12} strokeWidth={3} /> Ask Vyom to add or adjust a plan
      </button>
    </div>
  );
}
