import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronRight, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { ExpandableCard } from '@/components/ui/ExpandableCard';
import { ImmersiveMoment } from '@/components/ui/ImmersiveMoment';
import { SleepCard } from '@/components/today/SleepCard';
import { Ring } from '@/components/today/Ring';
import { useTodayMetrics, useMetricsRange } from '@/hooks/useMetrics';
import { useMemory } from '@/hooks/useMemory';
import { bodyAgeReadout } from '@/lib/bodyAge';
import { combinedSleepMin } from '@/lib/sleep';
import { num, sleepHrs } from '@/lib/format';
import { METRICS } from '@/lib/metricConfig';
import type { DailyMetrics } from '@/lib/types';
import {
  FITNESS_AGE,
  fitnessAgeDelta,
  SLEEP_CARD,
  VITALS,
  SNAPSHOT_HEADING,
  EXPLORE_HEADING,
  NAV_ITEMS,
} from '@/constants/health';

function ageFrom(birthDate?: string): number | null {
  if (!birthDate) return null;
  const a = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86_400_000));
  return a > 0 && a < 120 ? a : null;
}

/** Ring fill for a fitness age: lower age = fuller ring (fitter). Maps 18–60 → 1–0. */
function ageFill(age: number): number {
  return Math.max(0, Math.min(1, 1 - (age - 18) / 42));
}

/** One vital: latest non-null value for a metricConfig key; taps to its trend. */
function VitalTile({ metricKey, to, value }: { metricKey: string; to: string; value: string }) {
  const def = METRICS.find((m) => m.key === metricKey);
  if (!def) return null;
  return (
    <Link to={to} className="rounded-2xl bg-sys-fill-2 px-3 py-3 transition-transform active:scale-95">
      <p className="eyebrow">{def.label}</p>
      <p className="big-number mt-1 text-xl leading-none">
        {value}
        {def.unit && value !== '—' && <span className="text-ink-2 ml-0.5 text-xs font-bold">{def.unit}</span>}
      </p>
    </Link>
  );
}

export default function Health() {
  // Same metrics the App/Today shells already cache — so this is ~free.
  const { data: today } = useTodayMetrics();
  const { data: recent } = useMetricsRange(60);
  const { data: memory } = useMemory();
  const [info, setInfo] = useState(false);

  // Desc-by-date list (incl. today), then most-recent non-null per metric —
  // today is often partial (overnight readings not in yet). Mirrors Today.tsx.
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

  const profile = memory?.profile;
  const age = ageFrom(profile?.birthDate);
  const body = bodyAgeReadout(pick((m) => m.vo2Max), profile?.sex, age);

  const sleepDay = useMemo(
    () => days.find((m) => m.sleep?.totalMin != null || m.manualSleep?.totalMin != null) ?? null,
    [days],
  );
  const sleepMin = sleepDay ? combinedSleepMin(sleepDay) : null;

  const vital = (key: string) => {
    const def = METRICS.find((m) => m.key === key);
    const v = def ? pick(def.get) : undefined;
    return def && v != null ? num(v, def.digits) : '—';
  };

  return (
    <>
      <PageHeader eyebrow="Your body" title="Health" />

      {/* ① Fitness age — circular gauge, neutral surface, readable ink copy */}
      <Card accent="surface" className="mb-4">
        {body ? (
          <div className="flex items-center gap-5">
            <Ring
              value={ageFill(body.age)}
              size={92}
              stroke={8}
              track="color-mix(in srgb, var(--color-accent) 14%, transparent)"
              color="var(--color-accent)"
            >
              <div className="text-center leading-none">
                <p className="big-number text-2xl" style={{ color: 'var(--color-ink)' }}>{body.age}</p>
                <p className="eyebrow mt-0.5 text-[9px]">yrs</p>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <span className="eyebrow inline-flex items-center gap-1">
                {FITNESS_AGE.eyebrow}
                <button onClick={() => setInfo(true)} aria-label="What is fitness age?" className="text-ink-3 hover:text-ink">
                  <Info size={13} strokeWidth={2.5} />
                </button>
              </span>
              <p className="text-ink mt-1 text-sm font-bold leading-snug">{fitnessAgeDelta(body.delta)}</p>
              <Link to={FITNESS_AGE.link.to} className="text-ink-2 hover:text-ink mt-2 inline-flex items-center gap-1 text-xs font-bold">
                {FITNESS_AGE.link.label}
                <ChevronRight size={14} strokeWidth={3} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow mb-1">{FITNESS_AGE.eyebrow}</p>
              <p className="text-ink-3 text-[13px] font-semibold leading-relaxed">{FITNESS_AGE.empty}</p>
            </div>
            <button onClick={() => setInfo(true)} aria-label="What is fitness age?" className="text-ink-3 hover:text-ink shrink-0">
              <Info size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </Card>

      {/* ②③ Snapshot — glanceable, tap to expand */}
      <p className="eyebrow mb-2">{SNAPSHOT_HEADING}</p>
      <div className="mb-4 flex flex-col gap-3">
        {/* Sleep — latest night; the day navigator lives on the detail page (/trends/sleep) */}
        {sleepMin != null ? (
          <ExpandableCard
            accent="surface"
            ariaLabel="Sleep details"
            summary={
              <div>
                <p className="eyebrow">{SLEEP_CARD.eyebrow}</p>
                <p className="big-number text-2xl leading-none">{sleepHrs(sleepMin)}</p>
                {/* Surface any manual log so the total reconciles (matches the detail page). */}
                {sleepDay?.manualSleep?.totalMin != null && (
                  <p className="text-ink-2 mt-1 text-xs font-semibold">
                    {sleepDay.sleep?.totalMin != null ? 'Includes manual · ' : 'Manual · '}
                    {sleepHrs(sleepDay.manualSleep.totalMin)}
                    {sleepDay.manualSleep.quality != null ? ` · quality ${sleepDay.manualSleep.quality}/5` : ''}
                  </p>
                )}
              </div>
            }
          >
            {sleepDay?.sleep?.totalMin != null ? (
              <SleepCard sleep={sleepDay.sleep} />
            ) : (
              <p className="text-ink-2 text-xs font-semibold">Logged manually · {sleepHrs(sleepMin)} total.</p>
            )}
            <Link to={SLEEP_CARD.link.to} className="text-ink mt-3 inline-flex items-center gap-1 text-xs font-bold">
              {SLEEP_CARD.link.label}
              <ChevronRight size={14} strokeWidth={3} />
            </Link>
          </ExpandableCard>
        ) : (
          <Card accent="surface">
            <p className="eyebrow mb-1">{SLEEP_CARD.eyebrow}</p>
            <p className="text-ink-3 text-[13px] font-semibold leading-relaxed">{SLEEP_CARD.empty}</p>
          </Card>
        )}

        {/* ④ Vitals — tap through to trends */}
        <div className="grid grid-cols-2 gap-2">
          {VITALS.map((v) => (
            <VitalTile key={v.metric} metricKey={v.metric} to={v.to} value={vital(v.metric)} />
          ))}
        </div>
      </div>

      {/* ⑤ Explore — every destination one tap away */}
      <p className="eyebrow mb-2">{EXPLORE_HEADING}</p>
      <div className="grid grid-cols-2 gap-3">
        {NAV_ITEMS.map(({ to, label, hint, icon: Icon }, i) => {
          const isLast = i === NAV_ITEMS.length - 1;
          return (
            <Link key={to} to={to} className={isLast ? 'col-span-2' : undefined}>
              <Card
                accent="surface"
                delay={Math.min(i * 0.04, 0.24)}
                className="flex h-full items-center gap-3 transition-opacity active:opacity-70"
              >
                {/* Neutral cards; the icon (in the accent) is what distinguishes each destination. */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' }}
                >
                  <Icon size={18} strokeWidth={2.5} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="display text-base leading-tight">{label}</p>
                  {isLast && <p className="text-ink-2 text-[11px] font-semibold">{hint}</p>}
                </div>
                {isLast && <ChevronRight size={18} strokeWidth={2.5} className="text-ink-3" />}
              </Card>
            </Link>
          );
        })}
      </div>

      <AnimatePresence>
        {info && (
          <ImmersiveMoment
            eyebrow={FITNESS_AGE.eyebrow}
            title={FITNESS_AGE.infoTitle}
            body={FITNESS_AGE.infoBody}
            onClose={() => setInfo(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
