import { sleepHrs } from '@/lib/format';
import type { DailyMetrics } from '@/lib/types';

const STAGE = [
  { key: 'deep', label: 'Deep', color: '#3b2e8c' },
  { key: 'rem', label: 'REM', color: '#7c5cd6' },
  { key: 'core', label: 'Core', color: '#9db8ff' },
  { key: 'awake', label: 'Awake', color: '#ffd2b0' },
] as const;

export function SleepCard({ sleep }: { sleep?: DailyMetrics['sleep'] }) {
  if (!sleep?.totalMin) {
    return <p className="text-ink-3 text-sm font-semibold">No sleep data.</p>;
  }
  const stages = sleep.stages;
  const total = stages
    ? (stages.deep ?? 0) + (stages.rem ?? 0) + (stages.core ?? 0) + (stages.awake ?? 0)
    : 0;

  return (
    <div>
      <p className="big-number text-2xl">{sleepHrs(sleep.totalMin)}</p>
      {stages && total > 0 && (
        <>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full">
            {STAGE.map((s) => {
              const v = stages[s.key] ?? 0;
              return v > 0 ? (
                <div key={s.key} style={{ width: `${(v / total) * 100}%`, background: s.color }} />
              ) : null;
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {STAGE.map((s) => {
              const v = stages[s.key] ?? 0;
              return v > 0 ? (
                <span key={s.key} className="flex items-center gap-1 text-[11px] font-bold">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label} {Math.round(v / 60)}h{Math.round(v % 60)}
                </span>
              ) : null;
            })}
          </div>
        </>
      )}
    </div>
  );
}
