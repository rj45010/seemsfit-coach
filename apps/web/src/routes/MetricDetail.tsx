import { useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { BackHeader } from '@/components/ui/BackHeader';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { DayPager } from '@/components/ui/DayPager';
import { Pill } from '@/components/ui/Pill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MetricChart, type Point } from '@/components/charts/MetricChart';
import { SleepCard } from '@/components/today/SleepCard';
import { useMetricsRange } from '@/hooks/useMetrics';
import { METRICS, RANGES } from '@/lib/metricConfig';
import { combinedSleepMin } from '@/lib/sleep';
import { num, delta, sleepHrs } from '@/lib/format';
import { todayKey, shiftDayKey } from '@/lib/date';
import type { DailyMetrics } from '@/lib/types';
import {
  METRIC_RANGE,
  SLEEP_STAGES,
  SLEEP_STAGES_TITLE,
  SLEEP_STAGES_INTRO,
  EDU_HEADING,
  RANGE_HEADING,
} from '@/constants/metricEducation';

const DIR_TEXT: Record<'up' | 'down' | 'neutral', string> = {
  up: 'Higher is better',
  down: 'Lower is better',
  neutral: 'Good direction depends on your goal',
};

const SWIPE = 56; // px / velocity threshold to page a day

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-2xl px-2 py-2 text-center" style={{ boxShadow: 'var(--shadow-1)' }}>
      <p className="big-number text-base">{value}</p>
      <p className="eyebrow mt-0.5 text-[9px]">{label}</p>
    </div>
  );
}

/** Turn the current-vs-average move into a plain good/steady/watch read-out. */
function readout(dir: 'up' | 'down' | 'neutral', dAvg: number, avg: number, days: number) {
  const rel = avg ? dAvg / Math.abs(avg) : 0;
  const moved = Math.abs(rel) > 0.02; // within ~2% of average reads as "steady"
  if (dir === 'neutral') {
    const dirWord = dAvg > 0 ? 'up' : dAvg < 0 ? 'down' : 'flat';
    return {
      bg: 'var(--color-lavender)',
      verdict: dAvg === 0 ? 'No change' : `Trending ${dirWord}`,
      note: 'There’s no universally good direction here — read it against your goal.',
    };
  }
  if (!moved) {
    return { bg: 'var(--color-lavender)', verdict: 'Holding steady', note: `About the same as your ${days}-day average.` };
  }
  const improving = dir === 'up' ? dAvg > 0 : dAvg < 0;
  return improving
    ? { bg: 'var(--color-mint)', verdict: 'Good sign', note: `Moving the healthy way versus your ${days}-day average.` }
    : { bg: 'var(--color-peach)', verdict: 'Worth watching', note: `Drifting against your ${days}-day average — worth keeping an eye on.` };
}

export default function MetricDetail() {
  const { metric: metricParam } = useParams();
  const metric = METRICS.find((m) => m.key === metricParam);
  const isSleep = metric?.key === 'sleep';

  const [days, setDays] = useState(30);
  const [dayKey, setDayKey] = useState(todayKey());
  const [dir, setDir] = useState(1); // slide direction: +1 newer, -1 older
  const { data, isLoading } = useMetricsRange(days);

  const byDate = useMemo(() => {
    const map = new Map<string, DailyMetrics>();
    for (const m of data ?? []) map.set(m.date, m);
    return map;
  }, [data]);

  const points = useMemo<Point[]>(() => {
    if (!metric) return [];
    return (data ?? [])
      .map((m) => ({ date: m.date, value: metric.get(m) }))
      .filter((p): p is Point => p.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, metric]);

  const stats = useMemo(() => {
    if (!points.length) return null;
    const vals = points.map((p) => p.value);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const current = vals[vals.length - 1];
    return { min: Math.min(...vals), max: Math.max(...vals), avg, current, dAvg: current - avg };
  }, [points]);

  if (!metric) return <Navigate to="/trends" replace />;

  const atToday = dayKey >= todayKey();
  const goOlder = () => { setDir(-1); setDayKey((k) => shiftDayKey(k, -1)); };
  const goNewer = () => { if (!atToday) { setDir(1); setDayKey((k) => shiftDayKey(k, 1)); } };
  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE || info.velocity.x > 300) goOlder();
    else if (info.offset.x < -SWIPE || info.velocity.x < -300) goNewer();
  };

  const dm = byDate.get(dayKey);
  const rawVal = dm ? metric.get(dm) : undefined;
  const dayValue = isSleep ? (dm ? combinedSleepMin(dm) : null) : rawVal ?? null;
  const displayValue = dayValue == null ? '—' : isSleep ? sleepHrs(dayValue) : num(dayValue, metric.digits);

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="Over time" title={metric.label} />

      {/* Date pager — its OWN card on top (shared with the Nutrition day view) */}
      <DayPager dayKey={dayKey} onChange={(k, d) => { setDir(d); setDayKey(k); }} />

      {/* The selected day's value + (for sleep) manual line & watch stages — separate card, swipeable */}
      <Card accent="surface" className="mb-3">
        <AnimatePresence initial={false} mode="wait" custom={dir}>
          <motion.div
            key={dayKey}
            custom={dir}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="cursor-grab touch-pan-y active:cursor-grabbing"
          >
            {dayValue == null ? (
              <p className="text-ink-3 py-3 text-center text-sm font-semibold">No reading this day</p>
            ) : (
              <div className="text-center">
                <p className="big-number text-5xl leading-none">
                  {displayValue}
                  {metric.unit && <span className="text-ink-2 ml-1 text-lg font-bold">{metric.unit}</span>}
                </p>
              </div>
            )}

            {/* Manual sleep — shown so the total reconciles (watch stages + any manual log/nap). */}
            {isSleep && dm?.manualSleep?.totalMin != null && (
              <p className="text-ink-2 mt-2 text-center text-xs font-semibold">
                {dm?.sleep?.totalMin != null ? 'Includes manual · ' : 'Manual · '}
                {sleepHrs(dm.manualSleep.totalMin)}
                {dm.manualSleep.quality != null ? ` · quality ${dm.manualSleep.quality}/5` : ''}
              </p>
            )}

            {isSleep && dm?.sleep?.totalMin != null && (
              <div className="mt-4">
                <SleepCard sleep={dm.sleep} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Card>

      {/* Range + trend chart */}
      <div className="mb-3 flex gap-2">
        {RANGES.map((r) => (
          <Pill key={r.label} tone="ink" active={r.days === days} onClick={() => setDays(r.days)}>
            {r.label}
          </Pill>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="mb-3 h-56" />
      ) : points.length === 0 ? (
        <EmptyState title="No data for this metric yet" hint="Apple Health metrics flow in once the nightly sync runs." />
      ) : (
        <>
          <Card accent={metric.accent} variant="solid" className="mb-3">
            <MetricChart data={points} stroke={metric.stroke} />
          </Card>

          {stats && (
            <div className="mb-3 grid grid-cols-4 gap-2">
              <StatBox label="Current" value={num(stats.current, metric.digits)} />
              <StatBox label="Avg" value={num(stats.avg, metric.digits)} />
              <StatBox label="Min" value={num(stats.min, metric.digits)} />
              <StatBox label="Max" value={num(stats.max, metric.digits)} />
            </div>
          )}

          {stats &&
            (() => {
              const r = readout(metric.dir, stats.dAvg, stats.avg, days);
              return (
                <div className="mb-3 rounded-2xl p-4" style={{ background: r.bg, boxShadow: 'var(--shadow-1)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{r.verdict}</p>
                    <span className="font-mono text-xs font-bold">
                      {delta(stats.dAvg, metric.digits)} {metric.unit} vs avg
                    </span>
                  </div>
                  <p className="text-ink-2 mt-1 text-xs font-semibold">{r.note}</p>
                </div>
              );
            })()}
        </>
      )}

      {/* What this means */}
      <Card accent="surface" className="mb-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="eyebrow">{EDU_HEADING}</p>
          <span className="text-ink-2 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2 py-0.5 text-[10px] font-semibold">
            {DIR_TEXT[metric.dir]}
          </span>
        </div>
        <p className="text-ink-2 text-sm font-medium leading-relaxed">{metric.desc}</p>
      </Card>

      {/* Healthy range */}
      {METRIC_RANGE[metric.key] && (
        <Card accent="surface" className="mb-3">
          <p className="eyebrow mb-1">{RANGE_HEADING}</p>
          <p className="text-ink-2 text-sm font-medium leading-relaxed">{METRIC_RANGE[metric.key]}</p>
        </Card>
      )}

      {/* Sleep-stage education */}
      {isSleep && (
        <Card accent="surface" className="mb-3">
          <p className="display mb-1 text-base">{SLEEP_STAGES_TITLE}</p>
          <p className="text-ink-3 mb-3 text-xs font-semibold leading-relaxed">{SLEEP_STAGES_INTRO}</p>
          <div className="flex flex-col gap-3">
            {SLEEP_STAGES.map((s) => (
              <div key={s.key} className="flex gap-3">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    {s.label} <span className="text-ink-3 font-semibold">· {s.range}</span>
                  </p>
                  <p className="text-ink-2 text-xs font-medium leading-relaxed">{s.what}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
