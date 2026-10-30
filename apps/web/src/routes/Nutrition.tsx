import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Pill } from '@/components/ui/Pill';
import { DayPager } from '@/components/ui/DayPager';
import { NumberField } from '@/components/ui/NumberField';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { range } from '@/components/ui/NumberPicker';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  MealForm,
  MealRow,
  MealPlanView,
  useDayNutrition,
  useDeleteMeal,
  useNutritionTrend,
  NUTRITION,
  NUTRITION_RANGES,
} from '@/features/nutrition';
import { useGoals, useGoalMutations } from '@/hooks/useGoals';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { todayKey, fmtDayKey } from '@/lib/date';
import { num } from '@/lib/format';
import type { Goal } from '@/lib/types';

const R = NUTRITION_RANGES;
const TARGET_KCAL = range(R.targetKcal.min, R.targetKcal.max, R.targetKcal.step);
const TARGET_PRO = range(R.targetPro.min, R.targetPro.max, R.targetPro.step);

/** Set/update daily calorie + protein targets, stored as habit goals. */
function TargetEditor({ calGoal, proGoal, onDone }: { calGoal?: Goal; proGoal?: Goal; onDone: () => void }) {
  const { create, update } = useGoalMutations();
  const [cal, setCal] = useState(calGoal ? String(calGoal.target) : '');
  const [pro, setPro] = useState(proGoal ? String(proGoal.target) : '');

  async function upsert(existing: Goal | undefined, metric: string, title: string, unit: string, value: number) {
    if (existing) {
      if (existing.target !== value) await update.mutateAsync({ id: existing.id, target: value });
    } else {
      await create.mutateAsync({ title, category: 'habit', metric, target: value, unit, startDate: todayKey(), status: 'active' });
    }
  }

  async function save() {
    if (cal) await upsert(calGoal, 'dailyCalories', NUTRITION.targets.calories, NUTRITION.form.kcal, Number(cal));
    if (pro) await upsert(proGoal, 'dailyProtein', NUTRITION.targets.protein, NUTRITION.form.grams, Number(pro));
    onDone();
  }

  return (
    <Card accent="peach" className="mb-4">
      <p className="eyebrow mb-2">{NUTRITION.targets.heading}</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField className="w-full" value={cal} onChange={setCal} options={TARGET_KCAL} title={NUTRITION.targets.calories} unit={NUTRITION.form.kcal} placeholder={NUTRITION.targets.caloriesPlaceholder} />
        <NumberField className="w-full" value={pro} onChange={setPro} options={TARGET_PRO} title={NUTRITION.targets.protein} unit={NUTRITION.form.grams} placeholder={NUTRITION.targets.proteinPlaceholder} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="ink" onClick={save} disabled={create.isPending || update.isPending}>{NUTRITION.actions.save}</Button>
        <Button variant="surface" onClick={onDone}>{NUTRITION.actions.cancel}</Button>
      </div>
    </Card>
  );
}

function ProgressBar({ value, target, accent }: { value: number; target: number; accent: string }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const over = value > target;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
      <div style={{ width: `${pct}%`, background: over ? 'var(--color-peach)' : accent }} className="h-full" />
    </div>
  );
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number }>;
}
function CalTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface rounded-xl px-2.5 py-1.5" style={{ boxShadow: 'var(--shadow-2)' }}>
      <p className="text-[10px] font-bold">{fmtDayKey(String(label))}</p>
      <p className="font-mono text-sm font-bold">{num(payload[0]?.value ?? 0)} kcal</p>
    </div>
  );
}

function NutritionScreen() {
  const { openJarvis } = useJarvis();
  const { isPro } = useEntitlement();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'today' | 'plan'>('today');
  const [date, setDate] = useState(todayKey());
  const [adding, setAdding] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  const { totals, meals, isLoading } = useDayNutrition(date);
  const del = useDeleteMeal(date);
  const { data: goals } = useGoals();
  const { data: trend } = useNutritionTrend(R.trendDays);

  const calGoal = goals?.find((g) => g.metric === 'dailyCalories');
  const proGoal = goals?.find((g) => g.metric === 'dailyProtein');
  const calTarget = calGoal?.target;
  const proTarget = proGoal?.target;

  const maxCal = useMemo(() => Math.max(calTarget ?? 0, ...(trend ?? []).map((d) => d.calories), 1), [trend, calTarget]);

  // Macro composition (energy share of protein/carbs/fat) for the stacked breakdown bar.
  const macro = useMemo(() => {
    const p = (totals.protein || 0) * 4, c = (totals.carbs || 0) * 4, f = (totals.fat || 0) * 9;
    const t = Math.max(1, p + c + f);
    return { p: (p / t) * 100, c: (c / t) * 100, f: (f / t) * 100 };
  }, [totals]);

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries()}>
      <BackHeader to="/health" />
      <PageHeader eyebrow={NUTRITION.page.eyebrow} title={NUTRITION.page.title} />

      <div className="mb-4 flex items-center gap-2">
        <Pill tone="ink" active={tab === 'today'} onClick={() => setTab('today')}>{NUTRITION.tabs.today}</Pill>
        <Pill tone="ink" active={tab === 'plan'} onClick={() => setTab('plan')}>{NUTRITION.tabs.plan}</Pill>
      </div>

      {tab === 'plan' ? (
        <MealPlanView />
      ) : (
        <>
          {/* Shared cream date pager (same component as the Sleep detail page). */}
          <DayPager dayKey={date} onChange={(k) => setDate(k)} className="mb-4" />

          <Card accent="surface" className="mb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">{NUTRITION.totals.label(meals.length)}</p>
                <p className="big-number mt-1 text-4xl">
                  {num(totals.calories)}
                  {calTarget ? <span className="text-ink-2 text-base font-bold"> / {num(calTarget)}</span> : null}
                  <span className="text-ink-2 text-base font-bold"> kcal</span>
                </p>
              </div>
              <button
                onClick={() => setEditingTarget((v) => !v)}
                className="text-ink-2 flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-3 py-1.5 text-[11px] font-semibold transition-opacity active:opacity-60"
              >
                <Pencil size={12} strokeWidth={2.5} /> {calTarget || proTarget ? NUTRITION.actions.targets : NUTRITION.actions.setTargets}
              </button>
            </div>

            {calTarget ? <div className="mt-3"><ProgressBar value={totals.calories} target={calTarget} accent="var(--color-mint)" /></div> : null}

            <div className="mt-3 flex gap-4 text-sm font-bold">
              <span>P {num(totals.protein)}{proTarget ? `/${num(proTarget)}` : ''}g</span>
              <span>C {num(totals.carbs)}g</span>
              <span>F {num(totals.fat)}g</span>
            </div>
            {/* Macro composition — shows ALL three macros (protein/carbs/fat), not just protein. */}
            {totals.count > 0 && (
              <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full">
                <div style={{ width: `${macro.p}%`, background: 'var(--color-mint)' }} />
                <div style={{ width: `${macro.c}%`, background: 'var(--color-butter)' }} />
                <div style={{ width: `${macro.f}%`, background: 'var(--color-lavender)' }} />
              </div>
            )}
          </Card>

          {editingTarget && <TargetEditor calGoal={calGoal} proGoal={proGoal} onDone={() => setEditingTarget(false)} />}

          <div className="mb-4 flex gap-2">
            {isPro && <Button variant="ink" onClick={() => openJarvis(NUTRITION.jarvisSeeds.logMeal)}>{NUTRITION.actions.logWithVyom}</Button>}
            <Button variant="surface" onClick={() => setAdding((v) => !v)}>
              <Plus size={15} strokeWidth={3} /> {NUTRITION.actions.manual}
            </Button>
          </div>

          {adding && <MealForm date={date} onDone={() => setAdding(false)} />}

          {isLoading ? (
            <SkeletonList rows={3} />
          ) : meals.length === 0 ? (
            <EmptyState title={NUTRITION.empty.noMeals.title} hint={NUTRITION.empty.noMeals.hint} />
          ) : (
            <div className="flex flex-col gap-2">
              {meals.map((m) => (
                <MealRow key={m.id} meal={m} onDelete={() => del.mutate(m.id)} deleting={del.isPending} />
              ))}
            </div>
          )}

          {trend && trend.some((d) => d.calories > 0) && (
            <Card accent="surface" variant="solid" className="mt-4">
              <p className="eyebrow mb-3">{NUTRITION.trend.heading}</p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                    <XAxis dataKey="date" tickFormatter={(d) => fmtDayKey(d, 'd/M')} tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-ink-2)' }} axisLine={{ stroke: 'var(--color-line)', strokeWidth: 1 }} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--color-ink-2)' }} axisLine={{ stroke: 'var(--color-line)', strokeWidth: 1 }} tickLine={false} width={40} domain={[0, Math.ceil(maxCal * 1.1)]} />
                    <Tooltip content={<CalTip />} cursor={{ fill: 'var(--color-ink)', fillOpacity: 0.06 }} />
                    {calTarget ? <ReferenceLine y={calTarget} stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
                    <Bar dataKey="calories" radius={[6, 6, 2, 2]} isAnimationActive={false}>
                      {trend.map((d) => (
                        <Cell key={d.date} fill={calTarget && d.calories > calTarget ? 'var(--color-sys-orange)' : 'var(--color-sys-green)'} strokeWidth={0} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}
    </PullToRefresh>
  );
}

export default function Nutrition() {
  return (
    <ErrorBoundary label="Nutrition">
      <NutritionScreen />
    </ErrorBoundary>
  );
}
