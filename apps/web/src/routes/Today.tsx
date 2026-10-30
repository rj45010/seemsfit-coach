import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { tapLight } from '@/lib/haptics';
import { format } from 'date-fns';
import { Footprints, GlassWater, Info, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { InsightCard } from '@/components/jarvis/InsightCard';
import { RecoveryStrain } from '@/components/today/RecoveryStrain';
import { AskJarvisBar } from '@/components/today/AskJarvisBar';
import { todayKey, toDate } from '@/lib/date';
import { TodayJournalCard } from '@/components/today/TodayJournalCard';
import { TodayNutritionCard } from '@/components/today/TodayNutritionCard';
import { useTodayMetrics, useTodayInsight, useMetricsRange, useGenerateInsight, useSetWater } from '@/hooks/useMetrics';
import { useGoals } from '@/hooks/useGoals';
import { useJournalEntry } from '@/hooks/useJournal';
import { useRecentWorkouts } from '@/features/workouts';
import { useDayNutrition } from '@/features/nutrition';
import { useHealthSyncNow } from '@/hooks/useHealthKit';
import { useWatchSync } from '@/hooks/useWatchSync';
import { useWatchWorkoutSync } from '@/hooks/useWatchWorkoutSync';
import { useWatchPlanSync } from '@/hooks/useWatchPlanSync';
import { useWatchAuthSync } from '@/hooks/useWatchAuthSync';
import { greeting } from '@/lib/date';
import { useMemory } from '@/hooks/useMemory';
import { useAuth } from '@/hooks/useAuth';
import { AnimatePresence } from 'framer-motion';
import { TimeScene } from '@/features/ambient';
import { Reveal } from '@/components/ui/Reveal';
import { CountUp } from '@/components/ui/CountUp';
import { ImmersiveMoment } from '@/components/ui/ImmersiveMoment';
import { ageFromBirthDate } from '@/lib/calories';
import { bpm, ms, num } from '@/lib/format';
import { recovery, recoveryTimeHours } from '@/lib/readiness';
import { combinedSleepMin } from '@/lib/sleep';
import { sleepDebt } from '@/lib/sleepDebt';
import { dayExertion } from '@/lib/exertion';
import type { DailyMetrics } from '@/lib/types';

function ActStat({
  value,
  label,
  digits = 0,
  format,
}: {
  value?: number | null;
  label: string;
  digits?: number;
  format?: (n: number) => string;
}) {
  const fmt = format ?? ((n: number) => num(n, digits));
  return (
    <div>
      <p className="big-number text-xl">
        {value == null ? '–' : <CountUp value={value} format={fmt} />}
      </p>
      <p className="eyebrow mt-0.5 text-[9px]">{label}</p>
    </div>
  );
}

/** Compact vital stat inside the Vitals card; taps open its trend. */
function VitalMini({ to, label, value, unit }: { to: string; label: string; value: string; unit?: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-sys-fill-2 px-2 py-2 text-center transition-transform active:scale-95">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className="big-number mt-0.5 text-lg leading-none">
        {value}
        {unit && <span className="text-ink-2 ml-0.5 text-[11px] font-bold">{unit}</span>}
      </p>
    </Link>
  );
}

export default function Today() {
  const qc = useQueryClient();
  const syncHealth = useHealthSyncNow();
  const { data: today } = useTodayMetrics();
  const { data: insight, isLoading: insightLoading } = useTodayInsight();
  const genInsight = useGenerateInsight();
  const triedInsight = useRef(false);

  // Auto-generate today's insight once per day (when none cached yet).
  useEffect(() => {
    if (!triedInsight.current && !insightLoading && insight === null && !genInsight.isPending) {
      triedInsight.current = true;
      genInsight.mutate();
    }
  }, [insight, insightLoading, genInsight]);
  const { data: recent } = useMetricsRange(60);
  const { data: goals } = useGoals();
  // Build a desc-by-date list (incl. today), then read the most recent NON-NULL
  // value per metric — today is often partial (overnight HRV/RHR not recorded yet).
  const days = useMemo(() => {
    const map = new Map<string, DailyMetrics>();
    for (const m of recent ?? []) map.set(m.date, m);
    if (today) map.set(today.date, today);
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [recent, today]);

  const pick = <T,>(f: (m: DailyMetrics) => T | undefined): T | undefined => {
    for (const m of days) {
      const v = f(m);
      if (v != null) return v;
    }
    return undefined;
  };

  const todayK = todayKey();
  // Yesterday/last complete day — fallback when today has no live activity yet.
  const completeDay = useMemo(() => days.find((d) => d.date < todayK) ?? days[0] ?? null, [days, todayK]);
  // The hero strip reflects TODAY only — after midnight yesterday's numbers clear from here
  // (they still live in the DB and show in the labelled "Yesterday" card below). If today has
  // no live activity yet, this is null and the strip shows dashes rather than stale data.
  const activityDay = useMemo(() => days.find((d) => d.date === todayK) ?? null, [days, todayK]);
  const walkAvg = useMemo(() => {
    const past = days.filter((d) => d.date < todayK).slice(0, 7);
    const vals = past.map((d) => d.distanceKm).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [days, todayK]);
  // Target lives as a 'dailyWalkKm' goal so Jarvis / the Goals screen can change it.
  const walkTarget = (goals ?? []).find((g) => g.metric === 'dailyWalkKm')?.target ?? 4;
  // TODAY-only (see activityDay): recovery reflects last night's reading, which Apple records
  // under today's date. No reading today → null → the Recovery/Sleep card shows its empty state
  // instead of surfacing an older day's numbers.
  const recoveryDay = useMemo(() => {
    const t = days.find((d) => d.date === todayK);
    return t?.hrv?.avg != null ? t : null;
  }, [days, todayK]);
  // TODAY-only sleep (watch or manual). Older nights stay in the DB but no longer leak into the
  // hero after midnight.
  const sleepDay = useMemo(() => {
    const t = days.find((d) => d.date === todayK);
    return t && (t.sleep?.totalMin != null || t.manualSleep?.totalMin != null) ? t : null;
  }, [days, todayK]);
  // Rolling 7-night sleep debt (duration only; watch + manual naps summed).
  const debt = useMemo(() => sleepDebt(days), [days]);

  // Extra recovery inputs: today's self-report, yesterday's strain + fuel.
  const yKey = useMemo(() => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), []);
  const { data: todayJournal, isLoading: journalLoading } = useJournalEntry(todayK);
  const { data: recentW } = useRecentWorkouts(7);
  const { totals: yNut, isLoading: yNutLoading } = useDayNutrition(yKey);
  const priorStrainAU = useMemo(() => {
    const wd = (w: { customDate?: string; createdAt?: unknown }) =>
      w.customDate ? w.customDate.slice(0, 10) : toDate(w.createdAt as never)?.toISOString().slice(0, 10);
    return (recentW ?? [])
      .filter((w) => wd(w) === yKey)
      .reduce((s, w) => s + (w.duration ?? 0) * (w.effort ?? 5), 0);
  }, [recentW, yKey]);
  const calTarget = (goals ?? []).find((g) => g.metric === 'dailyCalories')?.target;
  const proTarget = (goals ?? []).find((g) => g.metric === 'dailyProtein')?.target;

  const recovInputs = useMemo(
    () => ({
      journal: todayJournal
        ? { energy: todayJournal.energy, soreness: todayJournal.soreness, mood: todayJournal.mood, stress: todayJournal.stress, ill: todayJournal.ill }
        : undefined,
      priorStrainAU,
      nutrition: calTarget || proTarget ? { calories: yNut.calories, protein: yNut.protein, calTarget, proTarget } : undefined,
    }),
    [todayJournal, priorStrainAU, yNut.calories, yNut.protein, calTarget, proTarget],
  );
  const recov = useMemo(() => recovery(recoveryDay, days, recovInputs), [recoveryDay, days, recovInputs]);
  // Only surface recovery once the inputs that SHAPE it have loaded — the metric history, yesterday's
  // training strain + fuel, and today's journal. Otherwise the score flashes a too-high value from
  // partial data, then drops as the strain/nutrition penalties arrive (the "81 → 61 doing nothing"
  // jump). Until then we show a calm skeleton instead of a misleading number.
  const recovReady =
    recent !== undefined && recentW !== undefined && goals !== undefined && !yNutLoading && !journalLoading;

  // Day exertion (0–100) for the displayed day (today once HealthKit is live, else
  // the last complete day) — active energy + exercise + that day's workouts.
  const strainDayKey = activityDay?.date;
  const strainAU = useMemo(
    () =>
      (recentW ?? [])
        .filter((w) => (w.customDate ? w.customDate.slice(0, 10) : toDate(w.createdAt)?.toISOString().slice(0, 10)) === strainDayKey)
        .reduce((s, w) => s + (w.duration ?? 0) * (w.effort ?? 5), 0),
    [recentW, strainDayKey],
  );
  const exertion = useMemo(() => dayExertion(activityDay, strainAU), [activityDay, strainAU]);
  const recoveryTimeHrs = useMemo(() => recoveryTimeHours(recov?.score, exertion.value), [recov?.score, exertion.value]);

  // Quick water + steps strip. Steps show today live (HealthKit) when available,
  // otherwise the last complete day.
  const setWater = useSetWater();
  const glasses = today?.waterGlasses ?? 0;
  const stepCount = activityDay?.steps;

  // Pull in any workouts the watch recorded while the app was closed, write to Firestore.
  useWatchWorkoutSync();

  // Push the user's workout plans to the watch so it can show & log them offline.
  useWatchPlanSync();

  // Vend a fresh Firebase ID token to the watch so it can use Vyom on its own.
  useWatchAuthSync();

  // Calorie-model inputs for the watch (Keytel): age/sex from the profile, latest logged weight.
  const { data: memory } = useMemory();
  const { user } = useAuth();
  // Greet the signed-in user by first name (from their Google/Apple display name); fall back to a
  // neutral greeting so it's never someone else's name.
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'there';
  const latestWeightKg = useMemo(() => {
    for (const d of days) if (d.weightKg != null) return d.weightKg;
    return undefined;
  }, [days]);

  // Mirror today's computed scores to the paired Apple Watch (no-op off iOS).
  useWatchSync({
    recovery: recov?.score,
    strain: exertion?.value,
    sleepMin: combinedSleepMin(sleepDay) ?? undefined,
    steps: stepCount,
    weightKg: latestWeightKg,
    ageYears: memory?.profile?.birthDate ? ageFromBirthDate(memory.profile.birthDate) : undefined,
    sex: memory?.profile?.sex,
  });

  // Exclude daily-target goals (protein/calories/water/walk) — those are shown by
  // their own components (Nutrition, Activity), not as goal cards here.
  const activeGoals = (goals ?? [])
    .filter((g) => g.status === 'active' && !/^daily/i.test(g.metric))
    .slice(0, 3);

  const [info, setInfo] = useState<'vitals' | null>(null);
  const [briefing, setBriefing] = useState(false);

  return (
    <PullToRefresh onRefresh={async () => { await syncHealth(); qc.invalidateQueries(); }}>
      {/* Greeting + Jarvis entry stay pinned while the page scrolls */}
      <div
        className="bleed-x sticky top-0 z-20 -mt-[calc(env(safe-area-inset-top)+0.5rem)] mb-0 overflow-hidden pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3 backdrop-blur-md md:static md:mx-0 md:mt-0 md:mb-4 md:p-0 md:pb-0 md:backdrop-blur-none"
        style={{
          // Near-solid paper under the status bar (reads attached), fading to translucent so the
          // aurora still shows behind the greeting — no hard seam at the top.
          background:
            'linear-gradient(to bottom, color-mix(in srgb, var(--color-paper) 88%, transparent) 0%, color-mix(in srgb, var(--color-paper) 70%, transparent) 45%, color-mix(in srgb, var(--color-paper) 12%, transparent) 100%)',
        }}
      >
        {/* Animated time-of-day vignette (sun/birds · moon/stars) behind the greeting */}
        <TimeScene />
        <div className="relative z-[1] mb-3 flex items-baseline justify-between gap-2">
          <h1 className="display text-[34px] leading-[1.0]">{greeting()},<br />{firstName}.</h1>
          <p className="eyebrow shrink-0">{format(new Date(), 'EEE · d MMM')}</p>
        </div>

        {/* Two tidy pills: water −/+ (in L) and steps */}
        <div className="relative z-[1] flex items-center gap-2">
          <div className="bg-surface flex items-center gap-2 rounded-full px-3.5 py-2" style={{ boxShadow: 'var(--shadow-1)' }}>
            <GlassWater size={18} strokeWidth={2.5} className="text-sky" fill="currentColor" />
            <button onClick={() => { tapLight(); setWater.mutate(Math.max(0, glasses - 1)); }} disabled={glasses <= 0} aria-label="Less water" className="text-ink-2 disabled:opacity-30 active:scale-90">
              <Minus size={16} strokeWidth={3} />
            </button>
            <span className="big-number w-12 text-center text-base">{num(glasses * 0.25, 2)}<span className="text-ink-3 text-xs font-bold"> L</span></span>
            <button onClick={() => { tapLight(); setWater.mutate(glasses + 1); }} aria-label="More water" className="text-ink-2 active:scale-90">
              <Plus size={16} strokeWidth={3} />
            </button>
          </div>
          <div className="bg-surface ml-auto flex items-center gap-1.5 rounded-full px-3.5 py-2" style={{ boxShadow: 'var(--shadow-1)' }}>
            <Footprints size={18} strokeWidth={2.5} className="text-ink-2" />
            <span className="big-number text-base">{stepCount != null ? <CountUp value={stepCount} /> : '-'}</span>
            <span className="text-ink-3 text-xs font-bold">steps</span>
          </div>
        </div>
      </div>

      {/* Recovery · Strain · Sleep — three rings, tap to expand detail */}
      <Reveal>{!recovReady ? (
        <Card accent="surface" className="mb-4">
          <p className="eyebrow mb-3">Recovery</p>
          <div className="bg-sys-fill h-24 animate-pulse rounded-2xl" />
          <p className="text-ink-3 mt-3 text-[11px] font-semibold">Reading last night’s data…</p>
        </Card>
      ) : recov ? (
        <RecoveryStrain
          recovery={recov}
          exertion={exertion}
          recoveryTimeHrs={recoveryTimeHrs}
          recoveryDate={recoveryDay?.date}
          exertionInfo={{
            date: activityDay?.date,
            activeEnergyKcal: activityDay?.activeEnergyKcal,
            exerciseMin: activityDay?.exerciseMin,
            workoutAU: strainAU,
          }}
          sleepInfo={{
            watch: sleepDay?.sleep,
            watchDate: sleepDay?.date,
            totalMin: combinedSleepMin(sleepDay) ?? undefined,
            manualMin: sleepDay?.manualSleep?.totalMin,
            manualQuality: sleepDay?.manualSleep?.quality,
            manualDate: sleepDay?.date,
            debt,
          }}
        />
      ) : (
        <div className="mb-4">
          <EmptyState
            title="No recovery data yet"
            hint="Import or sync Apple Health (HRV, sleep, resting HR) and your recovery score appears here."
          />
        </div>
      )}</Reveal>

      {/* Nutrition — today's fuel */}
      <Reveal><TodayNutritionCard /></Reveal>

      {/* Ask Jarvis */}
      <Reveal className="mb-4">
        <AskJarvisBar />
      </Reveal>

      {/* Daily summary (Jarvis) */}
      <Reveal>{insight ? (
        <InsightCard insight={insight} onRefresh={() => genInsight.mutate()} refreshing={genInsight.isPending} onImmerse={() => setBriefing(true)} />
      ) : genInsight.isPending ? (
        <Card accent="butter" className="mb-4">
          <p className="eyebrow mb-1">Vyom</p>
          <p className="animate-pulse text-sm font-semibold">Writing your briefing…</p>
        </Card>
      ) : null}</Reveal>

      {/* Immersive full-screen morning briefing (dark, particle-lit, status bar dissolved) */}
      <AnimatePresence>
        {briefing && insight && (
          <ImmersiveMoment
            eyebrow="Your briefing"
            title={insight.headline}
            body={insight.body}
            points={insight.recommendations}
            onClose={() => setBriefing(false)}
          />
        )}
      </AnimatePresence>

      {/* Yesterday — last complete day's activity + vitals (today is still partial) */}
      {completeDay && (
        <Reveal><Card accent="sky" className="relative mb-4">
          <button onClick={() => setInfo('vitals')} aria-label="About these vitals" className="text-ink-3 hover:text-ink absolute right-3 top-3">
            <Info size={16} strokeWidth={2.5} />
          </button>
          <p className="eyebrow mb-3">Yesterday · {format(new Date(completeDay.date), 'EEE d MMM')}</p>
          {walkAvg != null && (
            <div
              className="mb-3 flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: walkAvg >= walkTarget ? 'var(--color-mint)' : 'var(--color-butter)' }}
            >
              <span className="text-xs font-bold">Walk · 7-day avg</span>
              <span className="text-sm font-bold">
                {num(walkAvg, 1)} / {walkTarget} km{' '}
                <span className="text-ink-2">
                  {walkAvg >= walkTarget ? '· on target' : `· ${num(walkTarget - walkAvg, 1)} short`}
                </span>
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-y-4 text-center">
            <ActStat value={completeDay.steps} label="Steps" format={(n) => Math.round(n).toLocaleString()} />
            <ActStat value={completeDay.distanceKm} label="km" digits={1} />
            <ActStat value={completeDay.activeEnergyKcal} label="kcal" />
            <ActStat value={completeDay.exerciseMin} label="exercise min" />
            <ActStat value={completeDay.standHours} label="stand hr" />
            <ActStat value={completeDay.flightsClimbed} label="flights" />
          </div>

          <div className="mt-4 border-t border-[color-mix(in_srgb,var(--color-ink)_10%,transparent)] pt-3">
            <p className="eyebrow mb-2">Vitals</p>
            <div className="grid grid-cols-3 gap-2">
              <VitalMini to="/trends/restingHr" label="Resting HR" value={bpm(pick((m) => m.restingHr))} unit="bpm" />
              <VitalMini to="/trends/hrv" label="HRV" value={ms(pick((m) => m.hrv?.avg))} unit="ms" />
              <VitalMini to="/trends/vo2Max" label="VO₂ Max" value={(() => { const v = pick((m) => m.vo2Max); return v != null ? num(v, 1) : '-'; })()} />
            </div>
          </div>
        </Card></Reveal>
      )}

      <AnimatePresence>
        {info === 'vitals' && (
          <ImmersiveMoment eyebrow="Vitals" title="Resting HR · HRV · VO₂ Max" onClose={() => setInfo(null)}>
            <p><b>Resting heart rate (bpm)</b> is your lowest heart rate when you're fully at rest, usually overnight. A lower number generally means better fitness and recovery. If it stays higher than usual, that can be a sign of fatigue, stress or coming down with something. Tap it to see the trend.</p>
            <p><b>HRV, or heart-rate variability (ms),</b> is the tiny variation in time between heartbeats. A higher number (compared to your own normal) means your body is well rested and recovered. A drop can come from stress, poor sleep, alcohol or doing too much. It's the biggest factor in your recovery score. One note: Apple only checks HRV now and then, so single readings jump around a lot. Watch the overall trend rather than any one day.</p>
            <p><b>VO₂ Max (ml/kg/min)</b> is the most oxygen your body can use during hard exercise, and it's the best single measure of aerobic fitness. Higher is fitter. Apple estimates it from your runs and walks, so it drops if you stop running and rises with regular cardio. For a 29-year-old male, roughly: under 40 is below average, around 43 to 48 is good, and 50 or more is excellent.</p>
            <p>These are read from Apple Health (most recent value shown). Tap any to open its full trend.</p>
          </ImmersiveMoment>
        )}
      </AnimatePresence>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Goals</p>
            <Link to="/goals" className="text-ink text-xs font-bold underline">All</Link>
          </div>
          <div className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              const pct = g.current != null && g.target ? Math.max(0, Math.min(100, (g.current / g.target) * 100)) : 0;
              return (
                <Link key={g.id} to="/goals">
                  <Card accent="mint" animate={false} className="py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="truncate text-sm font-bold">{g.title}</p>
                      <span className="text-ink-2 text-xs font-bold">{num(g.current ?? 0, 1)}/{num(g.target, 1)} {g.unit}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
                      <div className="bg-ink h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Journal — how you feel today */}
      <TodayJournalCard />
    </PullToRefresh>
  );
}
