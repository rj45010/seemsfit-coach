import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { SleepCard } from './SleepCard';
import { sleepHrs } from '@/lib/format';
import { tapLight } from '@/lib/haptics';
import { recoveryTimeParts, type Recovery, type RecoveryBand } from '@/lib/readiness';
import type { Exertion } from '@/lib/exertion';
import type { DailyMetrics } from '@/lib/types';

// On-theme readiness ramp (green → amber → red), no blue.
// On the pastel section cards, bright system colours clash (green bar on the sage card especially).
// Every bar is a warm dark-ink fill instead — high contrast on any pastel, editorial, cohesive. The
// value is read from the number + bar length, not colour.
const BAR = 'color-mix(in srgb, var(--color-ink) 72%, transparent)';
const BAND_COLOR: Record<RecoveryBand, string> = { primed: BAR, steady: BAR, easy: BAR, recover: BAR };
function sleepColor(_min: number): string { return BAR; }
function recoveryTimeColor(_hrs: number): string { return BAR; }
function exertionBar(_v: number): string { return BAR; }

type Panel = 'recovery' | 'exertion' | 'sleep' | 'recoveryTime';

export interface SleepInfo {
  watch?: DailyMetrics['sleep'];
  watchDate?: string;
  totalMin?: number; // combined watch + manual nap, de-duplicated (combinedSleepMin)
  manualMin?: number;
  manualQuality?: number;
  manualDate?: string;
  debt?: { confident: boolean; debtMin: number; nights: number } | null;
}

export interface ExertionInfo {
  date?: string; // the day this exertion reflects (yesterday until live)
  activeEnergyKcal?: number;
  exerciseMin?: number;
  workoutAU?: number;
}

/**
 * Recovery · Exertion · Sleep · Recovery Time as four stacked rows in one card.
 * Each row shows its value (clearly legible, heading-size) and a thin horizontal
 * bar; tapping a row expands its detail INLINE directly beneath it while the
 * other rows stay put, so the whole thing reads as one continuous card. Single-
 * open: tapping the same row (or its collapse button) closes it, tapping another
 * switches. Each panel carries its own date label since the metrics reflect
 * different windows until live HealthKit (Capacitor) makes them all "today".
 */
export function RecoveryStrain({
  recovery,
  exertion,
  recoveryTimeHrs,
  recoveryDate,
  exertionInfo,
  sleepInfo,
}: {
  recovery: Recovery;
  exertion: Exertion;
  recoveryTimeHrs: number;
  recoveryDate?: string;
  exertionInfo?: ExertionInfo;
  sleepInfo?: SleepInfo;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const toggle = (p: Panel) => { tapLight(); setOpen((cur) => (cur === p ? null : p)); };

  const sleepMin = sleepInfo?.totalMin ?? (sleepInfo?.watch?.totalMin ?? 0) + (sleepInfo?.manualMin ?? 0);
  const hasSleep = sleepMin > 0;
  const sleepQual = !hasSleep ? 'No data' : sleepMin >= 450 ? 'Plenty' : sleepMin >= 390 ? 'Solid' : sleepMin >= 330 ? 'Short' : 'Low';
  // Which night this sleep is for — wake date (sleep.end) is most accurate, else the doc date.
  const sleepWhen = sleepInfo?.watch?.end ?? (sleepInfo?.watch?.totalMin ? sleepInfo?.watchDate : sleepInfo?.manualDate);
  const sleepLabel = hasSleep && sleepWhen ? `${sleepQual} · ${format(new Date(sleepWhen), 'EEE d MMM')}` : sleepQual;

  // Breakdown behind the recovery-time estimate (recovery deficit + today's effort).
  const rtParts = recoveryTimeParts(recovery.score, exertion.value);

  // In 0–100, today's recommended exertion ≈ today's recovery score.
  const targetExertion = Math.round(recovery.score);
  const exertionGuide =
    recovery.score >= 67
      ? "You're well recovered, so a hard session is fine today."
      : recovery.score >= 40
        ? 'Recovery is okay, so keep today’s effort moderate.'
        : 'Recovery is low, so take it easy and rest today.';

  return (
    <Card accent="mint" className="relative mb-4">
      <div className="flex flex-col">
        {/* Recovery */}
        <Row
          label="Recovery"
          sub={recovery.label}
          value={`${Math.round(recovery.score)}`}
          unit="/100"
          fill={recovery.score / 100}
          color={BAND_COLOR[recovery.band]}
          active={open === 'recovery'}
          onClick={() => toggle('recovery')}
        >
          <Detail title="Recovery" date={recoveryDate} onClose={() => toggle('recovery')}>
            <p className="text-sm font-bold">{recovery.score}/100 · {recovery.label}</p>
            {recovery.drivers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recovery.drivers.map((d) => (
                  <span key={d} className="rounded-full bg-sys-fill px-2.5 py-1 text-[11px] font-bold">{d}</span>
                ))}
              </div>
            )}
            {recovery.confidence === 'low' && (
              <p className="text-ink-3 mt-2 text-[11px] font-semibold">Not much overnight data, so treat this as a rough guide.</p>
            )}
          </Detail>
        </Row>

        {/* Exertion */}
        <Row
          label="Exertion"
          sub={exertion.label}
          value={`${Math.round(exertion.value)}`}
          unit="/100"
          fill={exertion.value / 100}
          color={exertionBar(exertion.value)}
          active={open === 'exertion'}
          onClick={() => toggle('exertion')}
        >
          <Detail title="Exertion" date={exertionInfo?.date} onClose={() => toggle('exertion')}>
            <p className="text-sm font-bold">{exertion.value}/100 · {exertion.label}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Mini big={Math.round(exertionInfo?.activeEnergyKcal ?? 0).toString()} label="active kcal" />
              <Mini big={Math.round(exertionInfo?.exerciseMin ?? 0).toString()} label="exercise min" />
              <Mini big={Math.round(exertionInfo?.workoutAU ?? 0).toString()} label="workout load" />
            </div>
            <p className="text-ink-2 mt-2 text-xs font-semibold">
              Today's target ≈ <b className="text-ink">{targetExertion}</b>. {exertionGuide}
            </p>
          </Detail>
        </Row>

        {/* Sleep */}
        <Row
          label="Sleep"
          sub={sleepLabel}
          value={hasSleep ? sleepHrs(sleepMin) : '–'}
          fill={hasSleep ? Math.min(1, sleepMin / 480) : 0}
          color={hasSleep ? sleepColor(sleepMin) : 'var(--color-ink-3)'}
          active={open === 'sleep'}
          onClick={() => toggle('sleep')}
        >
          <Detail
            title="Sleep"
            date={sleepWhen}
            onClose={() => toggle('sleep')}
          >
            {hasSleep && <p className="mb-2 text-sm font-bold">{sleepHrs(sleepMin)} · {sleepQual}</p>}
            {(sleepInfo?.watch?.start || sleepInfo?.watch?.end) && (
              <p className="text-ink-2 mb-2 text-xs font-bold">
                {sleepInfo.watch.start && <>Bedtime {format(new Date(sleepInfo.watch.start), 'h:mm a')}</>}
                {sleepInfo.watch.start && sleepInfo.watch.end && ' · '}
                {sleepInfo.watch.end && <>Wake {format(new Date(sleepInfo.watch.end), 'h:mm a')}</>}
              </p>
            )}
            {sleepInfo?.watch?.totalMin ? (
              <SleepCard sleep={sleepInfo.watch} />
            ) : sleepInfo?.manualMin ? (
              <p className="big-number text-2xl">{sleepHrs(sleepInfo.manualMin)}</p>
            ) : (
              <p className="text-ink-3 text-sm font-semibold">No sleep logged.</p>
            )}
            {sleepInfo?.manualMin != null && (
              <p className="mt-2 text-sm font-bold">
                Manual{sleepInfo.manualDate ? ` · ${format(new Date(sleepInfo.manualDate), 'd MMM')}` : ''}: {sleepHrs(sleepInfo.manualMin)}
                {sleepInfo.manualQuality != null && (
                  <span className="text-ink-3 font-medium"> · quality {sleepInfo.manualQuality}/5</span>
                )}
              </p>
            )}
            {sleepInfo?.debt?.confident && (
              <p
                className="mt-2 text-sm font-bold"
                style={{
                  color:
                    sleepInfo.debt.debtMin <= 60
                      ? 'color-mix(in srgb, var(--color-mint) 55%, var(--color-ink))'
                      : sleepInfo.debt.debtMin <= 180
                        ? 'color-mix(in srgb, var(--color-peach) 45%, var(--color-ink))'
                        : 'var(--color-crit)',
                }}
              >
                {sleepInfo.debt.debtMin <= 60 ? 'Sleep debt: on track' : `Sleep debt: ${sleepHrs(sleepInfo.debt.debtMin)}`}
                <span className="text-ink-3 font-medium"> · last {sleepInfo.debt.nights} nights</span>
              </p>
            )}
          </Detail>
        </Row>

        {/* Recovery Time — a duration, so a readout (depleting bar empties as you recover) */}
        <Row
          label="Recovery time"
          sub={recoveryTimeHrs <= 0 ? 'Recovered' : 'until fresh'}
          value={recoveryTimeHrs <= 0 ? 'Ready' : `~${recoveryTimeHrs}h`}
          fill={Math.min(1, recoveryTimeHrs / 24)}
          color={recoveryTimeColor(recoveryTimeHrs)}
          active={open === 'recoveryTime'}
          onClick={() => toggle('recoveryTime')}
          last
        >
          <Detail title="Recovery time" onClose={() => toggle('recoveryTime')}>
            <p className="text-sm font-bold">
              {recoveryTimeHrs <= 0 ? "You're recovered and ready to train." : `About ${recoveryTimeHrs} hours until you're fully recovered.`}
            </p>
            {recoveryTimeHrs > 0 && (rtParts.fromRecovery > 0 || rtParts.fromExertion > 0) && (
              <div className="mt-2 flex flex-col gap-1">
                {rtParts.fromRecovery > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-ink-2">Recovery at {Math.round(recovery.score)}/100</span>
                    <span className="text-ink">+{rtParts.fromRecovery}h</span>
                  </div>
                )}
                {rtParts.fromExertion > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-ink-2">Today's effort ({Math.round(exertion.value)}/100)</span>
                    <span className="text-ink">+{rtParts.fromExertion}h</span>
                  </div>
                )}
              </div>
            )}
            <p className="text-ink-2 mt-2 text-xs font-semibold">
              Estimated from how far below fresh you are now, plus how hard today was. A guide, not a hard rule — listen to your body.
            </p>
          </Detail>
        </Row>
      </div>

      {recovery.confidence === 'low' && open == null && (
        <p className="text-ink-3 mt-2 text-center text-[11px] font-semibold">Not enough data yet, so treat this as a rough guide.</p>
      )}
    </Card>
  );
}

/**
 * One metric row: label + sub on the left, a heading-size value on the right, a
 * thin fill bar underneath, and an inline expandable detail beneath that.
 */
function Row({
  label,
  sub,
  value,
  unit,
  fill,
  color,
  active,
  onClick,
  last,
  children,
}: {
  label: string;
  sub: string;
  value: string;
  unit?: string;
  fill: number;
  color: string;
  active: boolean;
  onClick: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? '' : 'mb-3'}>
      <button
        onClick={onClick}
        aria-label={`${label} details`}
        aria-expanded={active}
        className="w-full rounded-2xl px-1 py-1 text-left transition-transform active:scale-[0.99]"
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className={`text-sm font-bold ${active ? 'underline' : ''}`}>{label}</span>
            <span className="text-ink-3 text-[11px] font-semibold">{sub}</span>
          </span>
          <span className="big-number text-xl leading-none">
            {value}
            {unit && <span className="text-ink-3 ml-0.5 text-xs font-bold">{unit}</span>}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_14%,transparent)]">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: color }} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {/* Inset filled panel so the detail clearly belongs to the row above, not the one below. */}
            <div className="mt-2 mb-1 rounded-2xl bg-sys-fill-2 p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Detail({
  title,
  date,
  night,
  onClose,
  children,
}: {
  title: string;
  date?: string;
  night?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Sleep is attributed to the morning it ends, so show the NIGHT it spans
  // (e.g. "Mon 29 → Tue 30") instead of just today's date, which reads as if
  // you slept during the day.
  let label = '';
  if (date) {
    const end = new Date(date);
    if (night) {
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      label = ` · ${format(start, 'EEE d')} → ${format(end, 'EEE d MMM')}`;
    } else {
      label = ` · ${format(end, 'EEE d MMM')}`;
    }
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">
          {title}
          {label}
        </p>
        <button onClick={onClose} aria-label="Collapse" className="text-ink-3 hover:text-ink active:scale-90">
          <ChevronUp size={16} strokeWidth={2.5} />
        </button>
      </div>
      {children}
    </div>
  );
}

function Mini({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-2xl bg-sys-fill-2 px-2 py-2">
      <p className="big-number text-lg leading-none">{big}</p>
      <p className="eyebrow mt-1 text-[9px]">{label}</p>
    </div>
  );
}
