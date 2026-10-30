import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';
import { HScroll } from '@/components/ui/HScroll';
import { PlanDayCard } from '@/components/plans/PlanDayCard';
import { ProgramCard } from '@/components/plans/ProgramCard';
import { HistoryByMonth } from '@/features/workouts/components/HistoryByMonth';
import { ActivityForm } from '@/features/workouts/components/ActivityForm';
import { PlanBuilder } from '@/components/plans/PlanBuilder';
import { usePrograms } from '@/features/plans';
import { useWorkoutsInfinite, useWorkoutsPeriod } from '@/features/workouts';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { CalendarPlus, ClipboardList, Plus } from 'lucide-react';
import type { Plan, WorkoutCategory } from '@/lib/types';

type Tab = 'plan' | 'history';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2020 }, (_, i) => THIS_YEAR - i); // 2021..now

interface ActivityType {
  id: string;
  label: string;
  cats: WorkoutCategory[] | null;
  cardio: boolean;
}

const TYPES: ActivityType[] = [
  { id: 'All', label: 'All', cats: null, cardio: false },
  { id: 'Gym', label: 'Gym', cats: ['Strength'], cardio: false },
  { id: 'Running', label: 'Run', cats: ['Running'], cardio: true },
  { id: 'Cycling', label: 'Cycle', cats: ['Cycling'], cardio: true },
  { id: 'Walking', label: 'Walk', cats: ['Walking', 'Hiking'], cardio: true },
  { id: 'Swimming', label: 'Swim', cats: ['Swimming'], cardio: true },
  { id: 'HIIT', label: 'HIIT', cats: ['HIIT'], cardio: false },
  { id: 'Yoga', label: 'Yoga', cats: ['Yoga', 'Core'], cardio: false },
];

export default function Train() {
  const qc = useQueryClient();
  const { openJarvis } = useJarvis();
  const { programs, isLoading } = usePrograms();
  const [logMode, setLogMode] = useState<null | 'choose' | 'manual' | 'plan'>(null);

  // Tab + history filters live in the URL so returning from a workout (back)
  // restores the exact view you were on, alongside scroll position.
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') === 'history' ? 'history' : 'plan') as Tab;
  const typeId = params.get('type') ?? 'All';
  const openId = params.get('open'); // a plan id to auto-expand (from the Today suggestion)
  const year = params.get('year') ? Number(params.get('year')) : null; // null = all-time (paginated)
  const month = params.get('month') ? Number(params.get('month')) : null; // 0-11, within the chosen year

  const patch = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const setTab = (t: Tab) => patch({ tab: t === 'plan' ? null : t });
  const setTypeId = (id: string) => patch({ type: id === 'All' ? null : id });
  const setYear = (y: number | null) => patch({ year: y === null ? null : String(y), month: null });
  const setMonth = (m: number | null) => patch({ month: m === null ? null : String(m) });

  const type = TYPES.find((t) => t.id === typeId) ?? TYPES[0];
  const periodActive = year !== null;

  // All-time → paginated infinite scroll; a chosen year/month → bounded fetch.
  const {
    data: pages,
    isLoading: loadingInf,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWorkoutsInfinite(type.cats, !periodActive);
  const { data: periodData, isLoading: loadingPeriod } = useWorkoutsPeriod(type.cats, year, month);

  const history = useMemo(
    () => (periodActive ? (periodData ?? []) : (pages?.pages ?? []).flatMap((p) => p.workouts)),
    [periodActive, periodData, pages],
  );
  const loadingW = periodActive ? loadingPeriod : loadingInf;

  const weekday = format(new Date(), 'EEEE');
  // Today's sessions across all programs, each tagged with its program name.
  const todays = useMemo(
    () =>
      programs.flatMap((prog) =>
        prog.days.filter((d) => d.day === weekday).map((plan) => ({ plan, programName: prog.title })),
      ),
    [programs, weekday],
  );

  // When arriving from the Today suggestion (?open=<planId>), scroll that session
  // into view once it's rendered (PlanDayCard auto-expands via defaultOpen below).
  useEffect(() => {
    if (!openId || isLoading) return;
    const el = document.getElementById(`plan-${openId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [openId, isLoading, todays]);

  function skip(plan: Plan) {
    openJarvis(`I'm skipping "${plan.title}" today. Here's why: `);
  }

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries()}>
      <PageHeader eyebrow="Your training" title="Train" />

      <div className="mb-4 flex items-center gap-2">
        <Pill tone="ink" active={tab === 'plan'} onClick={() => setTab('plan')}>Plan</Pill>
        <Pill tone="ink" active={tab === 'history'} onClick={() => setTab('history')}>History</Pill>
        <button
          onClick={() => setLogMode('choose')}
          className="bg-mint text-ink ml-auto flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-opacity active:opacity-70"
        >
          <Plus size={14} strokeWidth={3} /> Log
        </button>
      </div>

      {logMode === 'choose' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={() => setLogMode(null)}>
          <div
            className="bg-surface safe-bottom w-full max-w-md rounded-t-[28px] px-5 pt-3 pb-4 md:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50 md:hidden" />
            <div>
              <p className="eyebrow mb-3">What do you want to do?</p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setLogMode('manual')}
                  className="flex items-center gap-3 rounded-2xl bg-sys-fill p-3.5 text-left transition-transform active:scale-[0.98]"
                >
                  <ClipboardList size={20} strokeWidth={2.5} className="shrink-0" />
                  <span>
                    <span className="block font-bold">Log a workout</span>
                    <span className="text-ink-2 text-xs font-medium">A session you already did, like cardio or a strength workout with several exercises.</span>
                  </span>
                </button>
                <button
                  onClick={() => setLogMode('plan')}
                  className="flex items-center gap-3 rounded-2xl bg-sys-fill p-3.5 text-left transition-transform active:scale-[0.98]"
                >
                  <CalendarPlus size={20} strokeWidth={2.5} className="shrink-0" />
                  <span>
                    <span className="block font-bold">Create a plan</span>
                    <span className="text-ink-2 text-xs font-medium">A reusable weekly program with exercises set for each day.</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {logMode === 'manual' && <ActivityForm onClose={() => setLogMode(null)} />}
      {logMode === 'plan' && <PlanBuilder onClose={() => setLogMode(null)} />}

      {tab === 'plan' ? (
        isLoading ? (
          <SkeletonList rows={3} />
        ) : programs.length === 0 ? (
          <EmptyState
            title="No programs yet"
            hint="Migrate your plans, or ask Vyom to build a program — even for a HYROX or a race."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Today's sessions — collapsed; tap to expand and log */}
            {todays.length > 0 && (
              <section>
                <p className="eyebrow mb-2">Today · {weekday}</p>
                <div className="flex flex-col gap-3">
                  {todays.map(({ plan, programName }) => (
                    <div key={plan.id} id={`plan-${plan.id}`}>
                      <PlanDayCard plan={plan} today={weekday} programName={programName} onSkip={skip} defaultOpen={plan.id === openId} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Programs — each a box; open to log any day */}
            <section>
              <p className="eyebrow mb-2">Programs</p>
              <div className="flex flex-col gap-3">
                {programs.map((prog) => (
                  <ProgramCard key={prog.id} program={prog} today={weekday} />
                ))}
              </div>
            </section>
          </div>
        )
      ) : (
        <>
          {/* activity type */}
          <HScroll className="mb-2 bleed-x flex gap-2 pb-1">
            {TYPES.map((t) => (
              <span key={t.id} className="shrink-0">
                <Pill tone="lavender" active={typeId === t.id} onClick={() => setTypeId(t.id)}>
                  {t.label}
                </Pill>
              </span>
            ))}
          </HScroll>
          {/* year */}
          <HScroll className="mb-2 bleed-x flex gap-2 pb-1">
            <span className="shrink-0">
              <Pill tone="sky" active={year === null} onClick={() => setYear(null)}>
                All time
              </Pill>
            </span>
            {YEARS.map((y) => (
              <span key={y} className="shrink-0">
                <Pill tone="sky" active={year === y} onClick={() => setYear(y)}>
                  {y}
                </Pill>
              </span>
            ))}
          </HScroll>
          {/* month (only when a year is chosen) */}
          {periodActive && (
            <HScroll className="mb-3 bleed-x flex gap-2 pb-1">
              <span className="shrink-0">
                <Pill tone="peach" active={month === null} onClick={() => setMonth(null)}>
                  All {year}
                </Pill>
              </span>
              {MONTHS.map((m, i) => (
                <span key={m} className="shrink-0">
                  <Pill tone="peach" active={month === i} onClick={() => setMonth(i)}>
                    {m}
                  </Pill>
                </span>
              ))}
            </HScroll>
          )}
          {loadingW ? (
            <SkeletonList rows={4} />
          ) : history.length === 0 ? (
            <EmptyState
              title={typeId === 'All' ? 'No workouts logged yet' : `No ${type.label} logs yet`}
              hint="Log a session above, ask Vyom, or import Apple Health."
            />
          ) : (
            <>
              <HistoryByMonth workouts={history} cardio={type.cardio} />
              {!periodActive && hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button variant="surface" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'Loading…' : 'Load older'}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PullToRefresh>
  );
}
